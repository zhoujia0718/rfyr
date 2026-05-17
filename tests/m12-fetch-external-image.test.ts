/**
 * Module 12 - 代理服务：app/api/fetch-external-image/route.ts 测试套件
 *
 * 测试覆盖：
 * P-12-01: HTTPS 协议强制验证
 * P-12-02: Content-Type 先验检查 + 文件大小限制
 * P-12-03: Redirect 跳转深度限制
 *
 * 测试文件：app/api/fetch-external-image/route.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// 辅助：创建 mock Response
// ─────────────────────────────────────────────────────────────────────────────
function mockResponse(
  body: ArrayBuffer | string = new ArrayBuffer(0),
  init: ResponseInit = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'image/png' },
    ...init,
  })
}

// 创建带指定 Content-Type 的 Response
function mockImageResponse(
  body: ArrayBuffer,
  contentType = 'image/png',
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType, ...extraHeaders },
  })
}

// 创建带跳转头的 Response
function mockRedirectResponse(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试：isAllowedImageUrl 逻辑
// 通过 fetchExternalImage 的错误响应间接验证域名白名单逻辑
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-01: fetch-external-image - 域名白名单与协议验证', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── P-12-01 修复验证 ─────────────────────────────────────────────────────

  it('GET - 应拒绝 HTTP 协议 URL（P-12-01 修复）', async () => {
    // 动态 import 以使用 mock 后的 fetch
    // @ts-ignore - dynamic import for route handler
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const req = new Request('http://example.com/api/fetch-external-image?url=http://evil.com/img.png')

    const res = await GET(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/不允许/)
  })

  it('GET - 应拒绝非法域名', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const req = new Request('http://example.com/api/fetch-external-image?url=https://evil.com/img.png')

    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('GET - 应接受白名单域名（yuque.com）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/abc.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('GET - 应接受子域名（*.alicdn.com）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(512)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/jpeg'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://img.alicdn.com/photo.jpg')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('GET - 应拒绝缺少 url 参数', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const req = new Request('http://example.com/api/fetch-external-image')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('GET - 应拒绝非法 URL', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const req = new Request('http://example.com/api/fetch-external-image?url=not-a-valid-url!!!')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('GET - 应拒绝空白 URL', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const req = new Request('http://example.com/api/fetch-external-image?url=   ')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('GET - 应正确处理 protocol-relative URL（//开头）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(256)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/webp'))

    // protocol-relative: //yuque.com/photo.png
    const req = new Request('http://example.com/api/fetch-external-image?url=//yuque.com/photo.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  // ── POST 方法测试 ─────────────────────────────────────────────────────────

  it('POST - 应拒绝 HTTP 协议 URL', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/fetch-external-image/route')
    const req = new Request('http://example.com/api/fetch-external-image', {
      method: 'POST',
      body: JSON.stringify({ url: 'http://evil.com/img.png' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('POST - 应接受白名单域名', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://nlark.com/photo.png' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('POST - 应拒绝空 body', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/fetch-external-image/route')
    const req = new Request('http://example.com/api/fetch-external-image', {
      method: 'POST',
      body: '',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('POST - 应拒绝 JSON 解析错误', async () => {
    // @ts-ignore - dynamic import for route handler
    const { POST } = await import('../../../app/api/fetch-external-image/route')
    const req = new Request('http://example.com/api/fetch-external-image', {
      method: 'POST',
      body: 'not-valid-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试：Content-Type 验证
// P-12-02 修复：Content-Type 在下载 body 前验证
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-02: fetch-external-image - Content-Type 验证（P-12-02）', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应接受 image/png', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/a.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/image\/png/)
  })

  it('应接受 image/webp', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/webp'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/b.webp')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应接受 image/gif', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/gif'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://feishu.cn/c.gif')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应接受 image/svg+xml', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/svg+xml'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://alicdn.com/d.svg')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应接受 application/octet-stream', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'application/octet-stream'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/e.bin')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应拒绝 text/html（防止 XSS）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/page')
    const res = await GET(req)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toMatch(/非图片/)
  })

  it('应拒绝 application/json', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/api')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('无 Content-Type 头时应拒绝', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: {},
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/no-ct')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试：文件大小限制
// P-12-02 修复：Content-Type 验证后再检查大小
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-03: fetch-external-image - 文件大小限制', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应接受 1MB 图片', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1 * 1024 * 1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/1mb.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应接受 10MB 图片（接近限制）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(10 * 1024 * 1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/10mb.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应拒绝 15MB+ 图片（超过 15MB 限制）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    // 故意返回超过 15MB 的 buffer
    const buf = new ArrayBuffer(16 * 1024 * 1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/16mb.png')
    const res = await GET(req)
    expect(res.status).toBe(413)
    const json = await res.json()
    expect(json.error).toMatch(/过大/)
  })

  it('应拒绝恰好 15MB 的图片（边界值）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    // 15MB + 1 byte = 超过限制
    const buf = new ArrayBuffer(15 * 1024 * 1024 + 1)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/15mb-plus.png')
    const res = await GET(req)
    expect(res.status).toBe(413)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试：Redirect 跳转深度限制
// P-12-03 修复：使用 manual redirect，限制最多 3 次跳转
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-04: fetch-external-image - Redirect 跳转深度限制（P-12-03）', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应跟随 1 次跳转（无跳转限制）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    // 第一次 302，跳转到最终图片
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/final.png', 302))
      .mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/redirect1.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应跟随 3 次跳转（最大允许次数）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step2.png', 301))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step3.png', 302))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step4.png', 303))
      .mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/3redirects.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应拒绝超过 3 次的跳转链（第 4 次抛出）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step2.png', 302))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step3.png', 302))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step4.png', 302))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step5.png', 302))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/loop.png')
    const res = await GET(req)
    // safeFetchImage 抛出错误，被 catch 捕获，返回 502
    expect(res.status).toBe(502)
  })

  it('应拒绝无 Location 头的 3xx 响应', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {},
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/no-location.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('应拒绝非法 Location URL', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: ':::invalid-url:::' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/bad-location.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('应支持相对路径 Location（自动解析为绝对 URL）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('/path/to/image.png', 302))
      .mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/dir/file.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试：Cache-Control 响应头
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-05: fetch-external-image - 响应头设置', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应设置 Cache-Control: public, max-age=86400（24小时）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/cache.png')
    const res = await GET(req)
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400')
  })

  it('应保留原始 Content-Type', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/webp'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/type.webp')
    const res = await GET(req)
    expect(res.headers.get('content-type')).toContain('image/webp')
  })

  it('octet-stream 应降级为 image/png', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'application/octet-stream'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/octet.bin')
    const res = await GET(req)
    expect(res.headers.get('content-type')).toContain('image/png')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试：上游错误处理
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-06: fetch-external-image - 上游错误处理', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('上游返回 404 应返回 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 404,
        headers: { 'content-type': 'image/png' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/notfound.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toMatch(/404/)
  })

  it('上游返回 500 应返回 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 500,
        headers: { 'content-type': 'image/png' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/500.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('fetch 超时应返回 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock.mockRejectedValueOnce(new Error('fetch timeout'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/slow.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('302 降级重试（403）时应仍返回正确 Content-Type', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    // 第一次返回 200 但 403，上游 CDN 需要 Referer
    fetchMock
      .mockResolvedValueOnce(
        new Response(buf, {
          status: 403,
          headers: { 'content-type': 'image/png' },
        }),
      )
      // 降级重试后返回正常
      .mockResolvedValueOnce(mockImageResponse(buf, 'image/jpeg'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/retry.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/jpeg')
  })
})
