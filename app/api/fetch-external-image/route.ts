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
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const h = u.hostname.toLowerCase()
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))
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

  let res = await fetch(parsed.toString(), {
    redirect: 'follow',
    headers: yuqueLikeHeaders,
    signal: AbortSignal.timeout(25_000),
  })

  // 个别资源对 Referer 敏感，再试一次仅 UA（少数反爬场景）
  if (res.status === 403) {
    res = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: {
        Accept: yuqueLikeHeaders.Accept,
        'User-Agent': yuqueLikeHeaders['User-Agent'],
      },
      signal: AbortSignal.timeout(25_000),
    })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `上游 ${res.status}` }, { status: 502 })
  }

  const ct = res.headers.get('content-type') || ''
  if (!ct.startsWith('image/') && !ct.includes('octet-stream')) {
    return NextResponse.json({ error: '非图片响应' }, { status: 502 })
  }

  const buf = await res.arrayBuffer()
  if (buf.byteLength > 15 * 1024 * 1024) {
    return NextResponse.json({ error: '图片过大' }, { status: 413 })
  }

  return new NextResponse(buf, {
    headers: {
      'Content-Type': ct.startsWith('image/') ? ct : 'image/png',
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
