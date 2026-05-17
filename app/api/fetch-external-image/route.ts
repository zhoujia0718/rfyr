import { NextResponse } from 'next/server'

/** 仅允许从这些域名拉图，防止 SSRF */
const ALLOWED_HOST_SUFFIXES = [
  'nlark.com',
  'yuque.com',
  'yuque.antfin.com',
  'larkoffice.com',
  'feishu.cn',
  'larksuite.com',
  'alicdn.com',
  'alipayobjects.com',
  'mmstat.com',
  'bcebos.com',
]

function isAllowedImageUrl(u: URL): boolean {
  // P-12-01 修复：仅允许 https:，禁止 http:（防止 MITM 攻击）
  if (u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))
}

/**
 * 安全拉取图片，限制跳转深度。
 * P-12-03 修复：使用 manual redirect，手动限制最多 3 次跳转。
 */
async function safeFetchImage(
  url: string,
  headers: Record<string, string>,
  maxRedirects = 3,
): Promise<Response> {
  let currentUrl = url
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(currentUrl, {
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(25_000),
    })

    if (res.status < 300 || res.status > 399) {
      return res
    }

    if (i === maxRedirects) {
      throw new Error(`超过最大跳转次数 (${maxRedirects})`)
    }

    const location = res.headers.get('Location')
    if (!location) {
      throw new Error('收到 3xx 但无 Location 头')
    }

    try {
      currentUrl = new URL(location, currentUrl).toString()
    } catch {
      throw new Error(`非法跳转 URL: ${location}`)
    }
  }
  throw new Error('不可能到达的代码路径')
}

async function fetchExternalImage(raw: string) {
  if (!raw) {
    return NextResponse.json({ error: '缺少 url' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(raw.startsWith('//') ? `https:${raw}` : raw)
  } catch {
    return NextResponse.json({ error: '非法 URL' }, { status: 400 })
  }

  if (!isAllowedImageUrl(parsed)) {
    return NextResponse.json({ error: '不允许的域名' }, { status: 403 })
  }

  // 语雀 CDN 常校验 Referer：无来源或来源为 localhost 会 403；模拟在语雀站内打开
  const yuqueLikeHeaders: Record<string, string> = {
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.yuque.com/',
    Origin: 'https://www.yuque.com',
  }

  // P-12-03 修复：使用手动跳转限制 fetch
  let res: Response
  try {
    res = await safeFetchImage(parsed.toString(), yuqueLikeHeaders)
  } catch {
    return NextResponse.json({ error: '拉取失败' }, { status: 502 })
  }

  // P-12-02 修复：先检查 Content-Type，再决定是否下载 body
  const ct = res.headers.get('content-type') || ''
  if (!ct.startsWith('image/') && !ct.includes('octet-stream')) {
    return NextResponse.json({ error: '非图片响应' }, { status: 502 })
  }

  // P-12-02 修复：Content-Type 验证通过后再下载 body
  let resFallback = false
  if (res.status === 403) {
    // 403 时降级重试，仅用 UA 头
    try {
      resFallback = true
      const fallbackHeaders = {
        Accept: yuqueLikeHeaders.Accept,
        'User-Agent': yuqueLikeHeaders['User-Agent'],
      }
      res = await safeFetchImage(parsed.toString(), fallbackHeaders)
      const ctFallback = res.headers.get('content-type') || ''
      if (!ctFallback.startsWith('image/') && !ctFallback.includes('octet-stream')) {
        return NextResponse.json({ error: '非图片响应' }, { status: 502 })
      }
    } catch {
      return NextResponse.json({ error: '拉取资源失败' }, { status: 502 })
    }
  }

  if (!res.ok) {
    return NextResponse.json({ error: `上游 ${res.status}` }, { status: 502 })
  }

  const buf = await res.arrayBuffer()
  if (buf.byteLength > 15 * 1024 * 1024) {
    return NextResponse.json({ error: '图片过大' }, { status: 413 })
  }

  const finalCt = resFallback
    ? (res.headers.get('content-type') || '')
    : ct

  return new NextResponse(buf, {
    headers: {
      'Content-Type': finalCt.startsWith('image/') ? finalCt : 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string }
    const raw = typeof body.url === 'string' ? body.url.trim() : ''
    return await fetchExternalImage(raw)
  } catch (e) {
    console.error('fetch-external-image:', e)
    return NextResponse.json({ error: '拉取失败' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const raw = (searchParams.get('url') || '').trim()
    return await fetchExternalImage(raw)
  } catch (e) {
    console.error('fetch-external-image(get):', e)
    return NextResponse.json({ error: '拉取失败' }, { status: 500 })
  }
}
