/**
 * M12-Uncov: app/api/fetch-external-image/route.ts — 未覆盖的测试
 *
 * 基于 m12-fetch-external-image.test.ts（已覆盖基础功能），
 * 本文件补充以下未覆盖的边界情况：
 *
 * 1. isAllowedImageUrl — 11 个允许域名完整覆盖
 *    - nlark.com / yuque.com / yuque.antfin.com
 *    - larkoffice.com / feishu.cn / larksuite.com
 *    - alicdn.com / alipayobjects.com / mmstat.com / bcebos.com
 *    - HTTPS 强制要求
 *    - javascript: / data: / ftp: 等非法协议拒绝
 *
 * 2. Redirect 跳转深度限制
 *    - 3 hops 最大限制（第 4 次抛出）
 *    - Redirect 循环检测
 *    - 跳转链中域名变化的安全处理
 *
 * 3. Content-Type 验证
 *    - image/avif / image/apng / 带参数 Content-Type
 *    - application/javascript 等非图片类型拒绝
 *
 * 4. 403 降级重试（minimal headers）
 *    - 第二次请求仅含 Accept + User-Agent
 *    - 降级后仍失败的处理
 *
 * 5. 15MB 大小限制（边界值）
 *    - 恰好 15MB 通过
 *    - 15MB + 1 byte 拒绝
 *
 * 6. Redirect 循环场景
 *    - A → B → A → B 循环检测
 *
 * 模块：app/api/fetch-external-image/route.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

function mockImageResponse(
  body: ArrayBuffer | string = '',
  contentType = 'image/png',
  extraInit: ResponseInit = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType, ...(extraInit.headers as Record<string, string> || {}) },
    ...extraInit,
  })
}

function mockRedirectResponse(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  })
}

// ─── ALLOWED_HOST_SUFFIXES（从 route.ts 复制）─────────────────────────────────
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

// 路由内联函数（复制自 route.ts，用于单元测试）
function isAllowedImageUrl(u: URL): boolean {
  if (u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. isAllowedImageUrl — 11 个允许域名完整覆盖
// ═══════════════════════════════════════════════════════════════════════════════
describe('M12-Uncov: isAllowedImageUrl — 全部 11 个允许域名', () => {
  it('nlark.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://nlark.com/a.png'))).toBe(true)
  })

  it('*.nlark.com（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://cdn.nlark.com/a.png'))).toBe(true)
    expect(isAllowedImageUrl(new URL('https://static.nlark.com/a.png'))).toBe(true)
  })

  it('yuque.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://yuque.com/a.png'))).toBe(true)
  })

  it('*.yuque.com（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://cdn.yuque.com/a.png'))).toBe(true)
  })

  it('yuque.antfin.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://yuque.antfin.com/a.png'))).toBe(true)
  })

  it('*.yuque.antfin.com（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://img.yuque.antfin.com/a.png'))).toBe(true)
  })

  it('larkoffice.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://larkoffice.com/a.png'))).toBe(true)
  })

  it('*.larkoffice.com（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://static.larkoffice.com/a.png'))).toBe(true)
  })

  it('feishu.cn（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://feishu.cn/a.png'))).toBe(true)
  })

  it('*.feishu.cn（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://sf3.feishu.cn/a.png'))).toBe(true)
  })

  it('larksuite.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://larksuite.com/a.png'))).toBe(true)
  })

  it('*.larksuite.com（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://sf16.larksuite.com/a.png'))).toBe(true)
  })

  it('alicdn.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://alicdn.com/a.png'))).toBe(true)
  })

  it('*.alicdn.com（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://img.alicdn.com/a.png'))).toBe(true)
    expect(isAllowedImageUrl(new URL('https://assets.alicdn.com/a.png'))).toBe(true)
  })

  it('alipayobjects.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://alipayobjects.com/a.png'))).toBe(true)
  })

  it('*.alipayobjects.com（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://cdn.alipayobjects.com/a.png'))).toBe(true)
  })

  it('mmstat.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://mmstat.com/a.png'))).toBe(true)
  })

  it('*.mmstat.com（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://js.mmstat.com/a.png'))).toBe(true)
  })

  it('bcebos.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://bcebos.com/a.png'))).toBe(true)
  })

  it('*.bcebos.com（子域名）', () => {
    expect(isAllowedImageUrl(new URL('https://cdn.bcebos.com/a.png'))).toBe(true)
  })
})

describe('M12-Uncov: isAllowedImageUrl — HTTPS 强制要求', () => {
  it('http://yuque.com → 拒绝（仅允许 https）', () => {
    expect(isAllowedImageUrl(new URL('http://yuque.com/a.png'))).toBe(false)
  })

  it('https://yuque.com → 允许', () => {
    expect(isAllowedImageUrl(new URL('https://yuque.com/a.png'))).toBe(true)
  })

  it('协议大小写敏感（URL 规范化为小写，HTTPS 大写实际变成 https:）', () => {
    // URL 构造器自动将协议规范化为小写，所以 HTTPS:// 实际上 protocol === 'https:'
    expect(new URL('HTTPS://yuque.com/a.png').protocol).toBe('https:')
    expect(isAllowedImageUrl(new URL('HTTPS://yuque.com/a.png'))).toBe(true)
  })
})

describe('M12-Uncov: isAllowedImageUrl — 非法协议拒绝', () => {
  it('javascript: → 拒绝', () => {
    expect(isAllowedImageUrl(new URL('javascript:alert(1)'))).toBe(false)
  })

  it('data: → 拒绝', () => {
    expect(isAllowedImageUrl(new URL('data:text/html,<img>'))).toBe(false)
  })

  it('ftp:// → 拒绝', () => {
    expect(isAllowedImageUrl(new URL('ftp://yuque.com/a.png'))).toBe(false)
  })

  it('file:// → 拒绝', () => {
    expect(isAllowedImageUrl(new URL('file:///etc/passwd'))).toBe(false)
  })
})

describe('M12-Uncov: isAllowedImageUrl — 不允许的域名拒绝', () => {
  it('evil.com → 拒绝', () => {
    expect(isAllowedImageUrl(new URL('https://evil.com/a.png'))).toBe(false)
  })

  it('alipay.com（不含 objects）→ 拒绝', () => {
    expect(isAllowedImageUrl(new URL('https://alipay.com/a.png'))).toBe(false)
  })

  it('antfin.com（不含 yuque）→ 拒绝', () => {
    expect(isAllowedImageUrl(new URL('https://antfin.com/a.png'))).toBe(false)
  })

  it('localhost → 拒绝', () => {
    expect(isAllowedImageUrl(new URL('https://localhost/a.png'))).toBe(false)
  })

  it('内网 IP → 拒绝', () => {
    expect(isAllowedImageUrl(new URL('https://10.0.0.1/a.png'))).toBe(false)
    expect(isAllowedImageUrl(new URL('https://127.0.0.1/a.png'))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Redirect 跳转深度限制
// ═══════════════════════════════════════════════════════════════════════════════
describe('M12-Uncov: Redirect — 3-hop 限制', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('0 hops（无跳转）→ 直接返回 200', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/no-redirect.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('2 hops → 成功（≤ 3）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step2.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step3.png'))
      .mockResolvedValueOnce(mockImageResponse(buf))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/2hops.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('3 hops → 成功（最大允许）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/2.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/3.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/4.png'))
      .mockResolvedValueOnce(mockImageResponse(buf))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/3hops.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('4 hops → 拒绝（第 4 次抛出 "超过最大跳转次数"）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/2.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/3.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/4.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/5.png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/4hops.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})

describe('M12-Uncov: Redirect — 循环检测', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('跳转循环：A → B → A → B → ... → 第 4 次超限', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    // 永远返回跳转，形成 A→B→A→B 循环
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/b.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/a.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/b.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/a.png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/loop.png')
    const res = await GET(req)
    // 循环达到第 4 hop 限制 → 502
    expect(res.status).toBe(502)
  })
})

describe('M12-Uncov: Redirect — Location 头异常', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('无 Location 头 → 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: {} }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/no-loc.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('非法 Location URL（无法解析） → 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: ':::not-a-url:::' } }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/bad-loc.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('相对路径 Location → 正确解析为绝对 URL', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('/static/img.png'))
      .mockResolvedValueOnce(mockImageResponse(buf))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/rel.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('其他 3xx 状态码（301/302/303/307/308）均处理', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    for (const status of [301, 302, 303, 307, 308]) {
      fetchMock.mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/final.png', status))
      fetchMock.mockResolvedValueOnce(mockImageResponse(buf))
    }

    for (const status of [301, 302, 303, 307, 308]) {
      const req = new Request(`http://example.com/api/fetch-external-image?url=https://yuque.com/${status}.png`)
      const res = await GET(req)
      expect(res.status).toBe(200)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Content-Type 验证（image/ 前缀）
// ═══════════════════════════════════════════════════════════════════════════════
describe('M12-Uncov: Content-Type — 各种 image/* 类型', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('image/avif → 接受', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/avif'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/a.avif')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/image\/avif/)
  })

  it('image/webp → 接受（已有，补充确认）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/webp'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/a.webp')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('带参数 Content-Type image/png; charset=utf-8 → 接受', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'image/png; charset=utf-8' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/ct-params.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/image\/png/)
  })

  it('带空格的 Content-Type image/png ; charset=utf-8 → 接受', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'image/png ; charset=utf-8' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/ct-space.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })
})

describe('M12-Uncov: Content-Type — 非图片类型拒绝', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('application/javascript → 拒绝', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'application/javascript' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/js.js')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('text/css → 拒绝', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'text/css' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/style.css')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('application/json → 拒绝', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/api.json')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('text/plain → 拒绝', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/txt.txt')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('无 Content-Type 头 → 拒绝（已有，补充确认）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, { status: 200, headers: {} }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/no-ct.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 403 降级重试（minimal headers）
// ═══════════════════════════════════════════════════════════════════════════════
describe('M12-Uncov: 403 降级重试 — minimal headers', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('403 → 降级重试，第二次请求不含 Referer / Origin', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)

    fetchMock
      .mockResolvedValueOnce(
        new Response(buf, { status: 403, headers: { 'content-type': 'image/png' } }),
      )
      .mockResolvedValueOnce(
        new Response(buf, { status: 200, headers: { 'content-type': 'image/png' } }),
      )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/403-fallback.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 第一次：带 Referer + Origin
    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string> | undefined
    expect(firstHeaders?.Referer).toBe('https://www.yuque.com/')
    expect(firstHeaders?.Origin).toBe('https://www.yuque.com')

    // 第二次（降级）：仅 Accept + User-Agent
    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string> | undefined
    expect(secondHeaders?.Referer).toBeUndefined()
    expect(secondHeaders?.Origin).toBeUndefined()
    expect(secondHeaders?.Accept).toBeDefined()
    expect(secondHeaders?.['User-Agent']).toBeDefined()
  })

  it('403 降级后 Content-Type 非图片 → 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)

    fetchMock
      .mockResolvedValueOnce(
        new Response(buf, { status: 403, headers: { 'content-type': 'image/png' } }),
      )
      .mockResolvedValueOnce(
        new Response(buf, { status: 200, headers: { 'content-type': 'text/html' } }),
      )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/403-html.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toMatch(/非图片/)
  })

  it('403 降级重试也失败 → 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)

    fetchMock
      .mockResolvedValueOnce(
        new Response(buf, { status: 403, headers: { 'content-type': 'image/png' } }),
      )
      .mockRejectedValueOnce(new Error('Fallback fetch failed'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/403-fail.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toMatch(/失败/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 15MB 大小限制（边界值）
// ═══════════════════════════════════════════════════════════════════════════════
describe('M12-Uncov: 15MB 大小限制 — 边界值', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('0 bytes → 接受', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(0)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/empty.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('恰好 15MB → 接受', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(15 * 1024 * 1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/15mb.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('15MB + 1 byte → 拒绝 413', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(15 * 1024 * 1024 + 1)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/15mb1b.png')
    const res = await GET(req)
    expect(res.status).toBe(413)
    const json = await res.json()
    expect(json.error).toMatch(/过大/)
  })

  it('16MB → 拒绝 413', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(16 * 1024 * 1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/16mb.png')
    const res = await GET(req)
    expect(res.status).toBe(413)
  })

  it('50MB → 拒绝 413', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(50 * 1024 * 1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/50mb.png')
    const res = await GET(req)
    expect(res.status).toBe(413)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. 综合边界场景
// ═══════════════════════════════════════════════════════════════════════════════
describe('M12-Uncov: 综合边界场景', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('非 200/403 的其他 4xx 状态码 → 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, { status: 401, headers: { 'content-type': 'image/png' } }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/401.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('500 状态码 → 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, { status: 500, headers: { 'content-type': 'image/png' } }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/500.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('204 No Content → Content-Type 检查后 body 为空仍返回 200', async () => {
    // 204 的 Content-Type 检查通过（image/png），且 res.ok = true → 200
    // 实际场景中 204 通常不带 Content-Type，带了也会正常返回
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { 'content-type': 'image/png' } }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/204.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('204 No Content 无 Content-Type → 非图片响应 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204, headers: {} }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/204-no-ct.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('POST 方法 → 与 GET 一致的行为', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://yuque.com/post.png' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('POST body.url 为空字符串 → 400', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/fetch-external-image/route')
    const req = new Request('http://example.com/api/fetch-external-image', {
      method: 'POST',
      body: JSON.stringify({ url: '   ' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('protocol-relative URL（//开头）→ 自动补全为 https://', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=//yuque.com/a.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('非图片 Content-Type 且为 403 降级后 → 仍拒绝', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)

    fetchMock
      .mockResolvedValueOnce(
        new Response(buf, { status: 403, headers: { 'content-type': 'image/png' } }),
      )
      .mockResolvedValueOnce(
        new Response(buf, { status: 200, headers: { 'content-type': 'text/html' } }),
      )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/403-notimg.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})
