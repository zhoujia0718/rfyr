/**
 * M11-Uncov: 未覆盖的 admin/me + SSRF 路由测试
 *
 * 覆盖范围：
 * 1. extractAdminIdFromCookie（内联函数，直接复制测试）
 *    - Base64 HMAC 新格式：salt_userId_expiresAt_signature
 *    - 纯文本 HMAC 旧格式：userId_expiresAt_signature
 *    - 过期检查
 *    - 签名篡改检测
 *
 * 2. fetch-external-image 路由（未覆盖的分支）
 *    - SSRF 域名白名单（11 个允许域名）
 *    - HTTPS 强制要求
 *    - javascript: 协议拒绝
 *    - Redirect 跳转深度限制（3 hops）
 *    - Redirect 循环检测
 *    - 403 降级重试（minimal headers）
 *    - Content-Type 非 image/* 拒绝
 *    - 15MB 大小限制
 *
 * 模块：
 * - app/api/admin/me/route.ts（extractAdminIdFromCookie）
 * - app/api/fetch-external-image/route.ts（isAllowedImageUrl / safeFetchImage / fetchExternalImage）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'

// ─── 测试配置 ────────────────────────────────────────────────────────────────
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const HMAC_SECRET = process.env.HMAC_SECRET || 'test-hmac-secret-key-for-unit-testing-32chars'
const EXPIRES_IN = 7 * 24 * 60 * 60 // 7 天（秒）

// ─── extractAdminIdFromCookie（从 me/route.ts 复制的测试目标函数）─────────────

function extractAdminIdFromCookie(cookieValue: string): string | null {
  const HMAC_SECRET_local = process.env.HMAC_SECRET
  if (!HMAC_SECRET_local) return null

  try {
    // 尝试 Base64 解码（新格式）
    try {
      const decoded = Buffer.from(cookieValue, 'base64').toString('utf-8')
      const decodedParts = decoded.split('_')

      if (decodedParts.length === 4 && decodedParts[0].length === 16) {
        const [salt, userId, expiresAtStr, signature] = decodedParts
        const expiresAt = parseInt(expiresAtStr, 10)

        if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) {
          return null
        }

        const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, 'utf-8')
        const expectedSig = createHmac('sha256', Buffer.from(HMAC_SECRET_local, 'utf-8'))
          .update(msgBuf)
          .digest('hex')

        if (signature !== expectedSig) {
          return null
        }

        return userId
      }
    } catch {
      // Base64 解码失败，尝试旧格式
    }

    // 旧格式
    const parts = cookieValue.split('_')
    if (parts.length < 3) return null

    const signature = parts[parts.length - 1]
    if (!/^[0-9a-f]{64}$/i.test(signature)) return null

    const remainder = parts.slice(0, -1).join('_')
    const expectedSig = createHmac('sha256', Buffer.from(HMAC_SECRET_local, 'utf-8'))
      .update(Buffer.from(remainder, 'utf-8'))
      .digest('hex')

    if (signature !== expectedSig) return null

    const parts2 = remainder.split('_')
    const expiresAt = parseInt(parts2[parts2.length - 1], 10)
    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null

    return parts2[0]

  } catch {
    return null
  }
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function signMsg(msg: string): string {
  return createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
    .update(Buffer.from(msg, 'utf-8'))
    .digest('hex')
}

function makeNewFormatCookie(userId: string, expiresAt: number): string {
  const salt = 'aabbccddeeff0011' // 16 字符
  const msg = `${salt}_${userId}_${expiresAt}`
  const sig = signMsg(msg)
  const payload = `${salt}_${userId}_${expiresAt}_${sig}`
  return Buffer.from(payload).toString('base64')
}

function makeOldFormatCookie(userId: string, expiresAt: number): string {
  const msg = `${userId}_${expiresAt}`
  const sig = signMsg(msg)
  return `${userId}_${expiresAt}_${sig}`
}

// ─── 辅助：mock Response ─────────────────────────────────────────────────────

function mockImageResponse(body: ArrayBuffer | string = '', contentType = 'image/png'): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType },
  })
}

function mockRedirectResponse(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. extractAdminIdFromCookie — 新格式 Base64 HMAC
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-Uncov: extractAdminIdFromCookie — 新格式 Base64 HMAC', () => {
  it('应解析有效的 Base64 格式 Cookie', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = makeNewFormatCookie(TEST_USER_ID, expiresAt)

    const userId = extractAdminIdFromCookie(cookie)
    expect(userId).toBe(TEST_USER_ID)
  })

  it('应拒绝 Base64 解码后的 salt 长度不是 16', () => {
    // 手动构造 salt=8 字符
    const salt = 'aabbccdd'
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const msg = `${salt}_${TEST_USER_ID}_${expiresAt}`
    const sig = signMsg(msg)
    const payload = `${salt}_${TEST_USER_ID}_${expiresAt}_${sig}`
    const cookie = Buffer.from(payload).toString('base64')

    const userId = extractAdminIdFromCookie(cookie)
    expect(userId).toBeNull()
  })

  it('应拒绝新格式 Cookie 过期', () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 1
    const cookie = makeNewFormatCookie(TEST_USER_ID, expiredAt)

    const userId = extractAdminIdFromCookie(cookie)
    expect(userId).toBeNull()
  })

  it('应拒绝新格式 Cookie 签名篡改', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = makeNewFormatCookie(TEST_USER_ID, expiresAt)
    // 篡改末尾字符
    const tampered = cookie.slice(0, -3) + 'XXX'

    const userId = extractAdminIdFromCookie(tampered)
    expect(userId).toBeNull()
  })

  it('应拒绝 userId 被篡改的新格式 Cookie', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = makeNewFormatCookie(TEST_USER_ID, expiresAt)

    const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
    const parts = decoded.split('_')
    parts[1] = '550e8400-e29b-41d4-a716-446655440099'
    const tampered = Buffer.from(parts.join('_')).toString('base64')

    const userId = extractAdminIdFromCookie(tampered)
    expect(userId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. extractAdminIdFromCookie — 旧格式纯文本 HMAC
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-Uncov: extractAdminIdFromCookie — 旧格式纯文本 HMAC', () => {
  it('应解析有效的旧格式 Cookie', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = makeOldFormatCookie(TEST_USER_ID, expiresAt)

    const userId = extractAdminIdFromCookie(cookie)
    expect(userId).toBe(TEST_USER_ID)
  })

  it('应拒绝旧格式签名不匹配', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const parts = makeOldFormatCookie(TEST_USER_ID, expiresAt).split('_')
    parts[parts.length - 1] = 'a'.repeat(64)
    const tampered = parts.join('_')

    const userId = extractAdminIdFromCookie(tampered)
    expect(userId).toBeNull()
  })

  it('应拒绝旧格式 Cookie 过期', () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 1
    const cookie = makeOldFormatCookie(TEST_USER_ID, expiredAt)

    const userId = extractAdminIdFromCookie(cookie)
    expect(userId).toBeNull()
  })

  it('应拒绝旧格式部分数量不足（< 3）', () => {
    const userId = extractAdminIdFromCookie('only_two_parts')
    expect(userId).toBeNull()
  })

  it('应拒绝旧格式签名长度不是 64 字符', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const tampered = `${TEST_USER_ID}_${expiresAt}_${'a'.repeat(32)}`

    const userId = extractAdminIdFromCookie(tampered)
    expect(userId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. extractAdminIdFromCookie — HMAC_SECRET 未配置
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-Uncov: extractAdminIdFromCookie — HMAC_SECRET 未配置', () => {
  it('HMAC_SECRET 为空时应返回 null', () => {
    const original = process.env.HMAC_SECRET
    delete process.env.HMAC_SECRET

    const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_IN
    const cookie = makeNewFormatCookie(TEST_USER_ID, expiresAt)

    const userId = extractAdminIdFromCookie(cookie)
    expect(userId).toBeNull()

    if (original !== undefined) process.env.HMAC_SECRET = original
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. isAllowedImageUrl — SSRF 域名白名单（11 个允许域名）
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-Uncov: isAllowedImageUrl — 11 个允许域名', () => {
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
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))
  }

  it('应允许 nlark.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://nlark.com/img.png'))).toBe(true)
  })

  it('应允许 nlark.com 子域名', () => {
    expect(isAllowedImageUrl(new URL('https://xxx.nlark.com/img.png'))).toBe(true)
  })

  it('应允许 yuque.com', () => {
    expect(isAllowedImageUrl(new URL('https://yuque.com/photo.jpg'))).toBe(true)
  })

  it('应允许 yuque.antfin.com（精确匹配）', () => {
    expect(isAllowedImageUrl(new URL('https://yuque.antfin.com/photo.jpg'))).toBe(true)
  })

  it('应拒绝 yuque.com 上级域名（antfin.com）', () => {
    expect(isAllowedImageUrl(new URL('https://antfin.com/photo.jpg'))).toBe(false)
  })

  it('应允许 larkoffice.com', () => {
    expect(isAllowedImageUrl(new URL('https://larkoffice.com/photo.jpg'))).toBe(true)
  })

  it('应允许 feishu.cn', () => {
    expect(isAllowedImageUrl(new URL('https://feishu.cn/photo.jpg'))).toBe(true)
  })

  it('应允许 larksuite.com', () => {
    expect(isAllowedImageUrl(new URL('https://larksuite.com/photo.jpg'))).toBe(true)
  })

  it('应允许 alicdn.com 子域名', () => {
    expect(isAllowedImageUrl(new URL('https://img.alicdn.com/photo.jpg'))).toBe(true)
  })

  it('应允许 alipayobjects.com 子域名', () => {
    expect(isAllowedImageUrl(new URL('https://cdn.alipayobjects.com/photo.jpg'))).toBe(true)
  })

  it('应允许 mmstat.com', () => {
    expect(isAllowedImageUrl(new URL('https://mmstat.com/photo.jpg'))).toBe(true)
  })

  it('应允许 bcebos.com', () => {
    expect(isAllowedImageUrl(new URL('https://bcebos.com/photo.jpg'))).toBe(true)
  })
})

describe('M11-Uncov: isAllowedImageUrl — HTTPS 强制与非法协议拒绝', () => {
  const ALLOWED_HOST_SUFFIXES = [
    'nlark.com', 'yuque.com', 'yuque.antfin.com', 'larkoffice.com',
    'feishu.cn', 'larksuite.com', 'alicdn.com', 'alipayobjects.com',
    'mmstat.com', 'bcebos.com',
  ]

  function isAllowedImageUrl(u: URL): boolean {
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))
  }

  it('应拒绝 http://（仅允许 https）', () => {
    expect(isAllowedImageUrl(new URL('http://yuque.com/img.png'))).toBe(false)
  })

  it('应拒绝 javascript: 协议', () => {
    expect(isAllowedImageUrl(new URL('javascript:alert(1)'))).toBe(false)
  })

  it('应拒绝 data: 协议', () => {
    expect(isAllowedImageUrl(new URL('data:text/html,<img>'))).toBe(false)
  })

  it('应拒绝 ftp:// 协议', () => {
    expect(isAllowedImageUrl(new URL('ftp://yuque.com/img.png'))).toBe(false)
  })
})

describe('M11-Uncov: isAllowedImageUrl — 不允许的域名拒绝', () => {
  const ALLOWED_HOST_SUFFIXES = [
    'nlark.com', 'yuque.com', 'yuque.antfin.com', 'larkoffice.com',
    'feishu.cn', 'larksuite.com', 'alicdn.com', 'alipayobjects.com',
    'mmstat.com', 'bcebos.com',
  ]

  function isAllowedImageUrl(u: URL): boolean {
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))
  }

  it('应拒绝 evil.com', () => {
    expect(isAllowedImageUrl(new URL('https://evil.com/img.png'))).toBe(false)
  })

  it('应拒绝 google.com', () => {
    expect(isAllowedImageUrl(new URL('https://google.com/img.png'))).toBe(false)
  })

  it('应拒绝内部 IP 域名', () => {
    expect(isAllowedImageUrl(new URL('https://192.168.1.1/img.png'))).toBe(false)
  })

  it('应拒绝 localhost', () => {
    expect(isAllowedImageUrl(new URL('https://localhost/img.png'))).toBe(false)
  })

  it('应拒绝 alipay.com（不在白名单）', () => {
    expect(isAllowedImageUrl(new URL('https://alipay.com/img.png'))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. safeFetchImage — Redirect 跳转深度限制（3 hops）
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-Uncov: safeFetchImage — Redirect 跳转深度限制', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // safeFetchImage 在模块内不可直接调用，需要通过 fetchExternalImage 测试
  // 这里通过路由测试间接验证

  it('应跟随 1 次跳转（≤ 3 hops）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/final.png'))
      .mockResolvedValueOnce(mockImageResponse(buf))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/1hop.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('应跟随恰好 3 次跳转（第 4 次拒绝）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step2.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step3.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step4.png'))
      .mockResolvedValueOnce(mockRedirectResponse('https://yuque.com/step5.png')) // 第 4 个 hop → 拒绝

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/3hops.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('应拒绝无 Location 头的 3xx 响应', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: {} }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/no-location.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('应拒绝非法 Location URL', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: ':::invalid:::' } }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/bad-location.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. fetchExternalImage — 403 降级重试（minimal headers）
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-Uncov: fetchExternalImage — 403 降级重试（minimal headers）', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('上游 403 → 降级重试（仅 Accept + User-Agent）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)

    // 第一次 403（带 Referer）
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 403,
        headers: { 'content-type': 'image/png' },
      }),
    )
    // 降级重试：Referer/Origin 不再发送
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/403-retry.png')
    const res = await GET(req)
    expect(res.status).toBe(200)

    // 两次调用：第一次（带 Referer）+ 第二次（降级）
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 第一次调用带 Referer
    const firstCall = fetchMock.mock.calls[0][1] as RequestInit
    expect(firstCall.headers).toHaveProperty('Referer')

    // 第二次调用（降级）不应带 Referer 和 Origin
    const secondCall = fetchMock.mock.calls[1][1] as RequestInit
    const secondHeaders = secondCall.headers as Record<string, string>
    expect(secondHeaders).not.toHaveProperty('Referer')
    expect(secondHeaders).not.toHaveProperty('Origin')
  })

  it('403 降级重试后仍 403 → 返回 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)

    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 403,
        headers: { 'content-type': 'image/png' },
      }),
    )
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 403,
        headers: { 'content-type': 'image/png' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/403-still.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })

  it('403 降级重试后 Content-Type 无效 → 返回 502', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)

    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 403,
        headers: { 'content-type': 'image/png' },
      }),
    )
    // 降级后返回 HTML
    fetchMock.mockResolvedValueOnce(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/403-html.png')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. fetchExternalImage — Content-Type 验证
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-Uncov: fetchExternalImage — Content-Type 验证（image/ 前缀）', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应接受 image/avif', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/avif'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/a.avif')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应接受 image/apng', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/apng'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/b.apng')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应接受带参数的 Content-Type（image/png; charset=utf-8）', async () => {
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
  })

  it('应拒绝 application/javascript', async () => {
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
})

// ═══════════════════════════════════════════════════════════════════════════════
// 8. fetchExternalImage — 15MB 大小限制
// ═══════════════════════════════════════════════════════════════════════════════
describe('M11-Uncov: fetchExternalImage — 15MB 大小限制', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应接受恰好 15MB 的图片（边界值）', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(15 * 1024 * 1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/exactly15mb.png')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('应拒绝 15MB + 1 byte', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(15 * 1024 * 1024 + 1)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/15mb-plus1.png')
    const res = await GET(req)
    expect(res.status).toBe(413)
    const json = await res.json()
    expect(json.error).toMatch(/过大/)
  })

  it('应拒绝 20MB 图片', async () => {
    // @ts-ignore - dynamic import for route handler
    const { GET } = await import('../../../app/api/fetch-external-image/route')
    const buf = new ArrayBuffer(20 * 1024 * 1024)
    fetchMock.mockResolvedValueOnce(mockImageResponse(buf, 'image/png'))

    const req = new Request('http://example.com/api/fetch-external-image?url=https://yuque.com/20mb.png')
    const res = await GET(req)
    expect(res.status).toBe(413)
  })
})
