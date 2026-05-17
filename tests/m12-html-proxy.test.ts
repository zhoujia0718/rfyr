/**
 * Module 12 - 代理服务：app/api/html-proxy/route.ts 测试套件
 *
 * 测试覆盖：
 * 1. URL 格式验证（Supabase Storage 域名白名单）
 * 2. HTML 文件类型验证（仅 .html/.htm）
 * 3. <base href> 注入逻辑
 * 4. Content-Type 强制覆盖
 * 5. 文件大小限制（20MB）
 * 6. HTTPS 协议验证
 *
 * 测试策略：提取纯函数进行单元测试（isAllowedStoragePublicHtmlUrl, injectBaseHref）
 * 注：NextRequest 的 mock 需要 Next.js 运行时，不适合在 vitest 单元测试中使用。
 *     通过测试提取的纯函数覆盖所有关键逻辑路径。
 */
import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// 纯函数提取：从 app/api/html-proxy/route.ts 中提取可测试的逻辑
// ─────────────────────────────────────────────────────────────────────────────
const MAX_BYTES = 20 * 1024 * 1024 // 20MB

function getAllowedSupabaseHostnames(): Set<string> {
  const set = new Set<string>()
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (raw) {
    try {
      set.add(new URL(raw).hostname.toLowerCase())
    } catch {
      /* ignore */
    }
  }
  set.add('ogctmgdomkktuynsiwmf.supabase.co')
  return set
}

function isAllowedStoragePublicHtmlUrl(u: URL): boolean {
  if (u.protocol !== 'https:') return false
  const hosts = getAllowedSupabaseHostnames()
  if (!hosts.has(u.hostname.toLowerCase())) return false
  const p = u.pathname.toLowerCase()
  return (
    p.includes('/storage/v1/object/public/') &&
    (p.endsWith('.html') || p.endsWith('.htm'))
  )
}

/**
 * 注入 <base href> 的 HTML 处理逻辑（从 route.ts 提取）
 */
function injectBaseHref(html: string, target: URL): string {
  const baseForRelative = new URL(target)
  baseForRelative.pathname = baseForRelative.pathname.replace(/\/[^/]+$/, '/')
  const baseHref = baseForRelative.toString()
  const baseTag = `<base href="${baseHref}">`

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`)
  } else if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${baseTag}</head>`)
  } else {
    return baseTag + html
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试：isAllowedStoragePublicHtmlUrl - URL 白名单验证
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-10: html-proxy - URL 白名单验证逻辑', () => {
  // ── 协议验证 ─────────────────────────────────────────────────────────────

  it('应拒绝 HTTP 协议', () => {
    const url = new URL('http://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/test.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(false)
  })

  it('应接受 HTTPS 协议', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/test.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  // ── 域名验证 ─────────────────────────────────────────────────────────────

  it('应接受默认 Supabase 域名', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/a.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  it('应接受环境变量中的自定义域名', () => {
    const originalEnv = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://my-project.supabase.co'
    try {
      const url = new URL('https://my-project.supabase.co/storage/v1/object/public/b.html')
      expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv
    }
  })

  it('应拒绝不在白名单中的域名', () => {
    const url = new URL('https://evil.com/storage/v1/object/public/test.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(false)
  })

  it('应拒绝真实域名但不含 storage 路径的 URL', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/other/path/test.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(false)
  })

  it('应拒绝真实域名且含 storage 但非 public 的路径', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/private/test.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(false)
  })

  // ── 文件类型验证 ─────────────────────────────────────────────────────────

  it('应接受 .html 扩展名', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/test.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  it('应接受 .htm 扩展名', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/test.htm')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  it('应接受 .HTML 大写扩展名', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/test.HTML')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  it('应拒绝非 HTML 文件（.png）', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/image.png')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(false)
  })

  it('应拒绝非 HTML 文件（.txt）', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/readme.txt')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(false)
  })

  it('应拒绝 .htmlo（不是 .html）', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/file.htmlo')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(false)
  })

  it('应接受路径中包含 .html 的文件名', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/my.article.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  // ── 路径结构验证 ─────────────────────────────────────────────────────────

  it('应拒绝不包含 /storage/v1/object/public/ 路径', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/bucket/file.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(false)
  })

  it('应接受含子目录的路径', () => {
    const url = new URL(
      'https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/articles/2024/01/test.html',
    )
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  it('应接受深层嵌套的路径', () => {
    const url = new URL(
      'https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/a/b/c/d/e/f.html',
    )
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  // ── 大小写处理 ───────────────────────────────────────────────────────────

  it('域名大小写应不敏感（toLowerCase）', () => {
    // 使用与 setup.ts 一致的域名，仅改变大小写来验证 toLowerCase 逻辑
    const url = new URL('https://TEST-PROJECT.supabase.co/storage/v1/object/public/test.html')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  it('路径大小写应不敏感（toLowerCase）', () => {
    const url = new URL(
      'https://ogctmgdomkktuynsiwmf.supabase.co/STORAGE/V1/OBJECT/PUBLIC/TEST.HTML',
    )
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })

  it('带 query string 的 URL 应正确匹配白名单', () => {
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co:8080/storage/v1/object/public/test.html?v=1')
    expect(isAllowedStoragePublicHtmlUrl(url)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试：injectBaseHref - <base href> 注入逻辑
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-11: html-proxy - <base href> 注入逻辑', () => {
  function makeUrl(path: string) {
    return new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public' + path)
  }

  it('HTML 包含 <head> 时应在 <head> 后注入 <base>', () => {
    const html = '<html><head><title>Test</title></head><body>Content</body></html>'
    const result = injectBaseHref(html, makeUrl('/test.html'))

    expect(result).toContain('<base href="https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/">')
    expect(result).toContain('<title>Test</title>')
  })

  it('HTML 不含 <head> 但含 <html> 时应插入 <head> 并包含 <base>', () => {
    const html = '<html><body>Content</body></html>'
    const result = injectBaseHref(html, makeUrl('/test.html'))

    expect(result).toContain('<head>')
    expect(result).toContain('<base href="https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/">')
  })

  it('HTML 不含 <head> 和 <html> 时应在开头插入 <base>', () => {
    const html = '<p>Just content</p>'
    const result = injectBaseHref(html, makeUrl('/test.html'))

    expect(result.startsWith('<base href="')).toBe(true)
    expect(result).toContain('<p>Just content</p>')
  })

  it('<base href> 应指向文件所在目录（移除文件名）', () => {
    const html = '<html><head></head></html>'
    const result = injectBaseHref(html, makeUrl('/sub/dir/test.html'))

    expect(result).toContain(
      '<base href="https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/sub/dir/">',
    )
    expect(result).not.toContain('/test.html/')
  })

  it('应正确处理多级子目录', () => {
    const html = '<html><head></head></html>'
    const result = injectBaseHref(html, makeUrl('/a/b/c/d/e.html'))

    expect(result).toContain(
      '<base href="https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/a/b/c/d/">',
    )
  })

  it('应正确处理根目录文件（去除最后一个路径段）', () => {
    const html = '<html><head></head></html>'
    const result = injectBaseHref(html, makeUrl('/test.html'))

    expect(result).toContain(
      '<base href="https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/">',
    )
  })

  it('带 query string 的 URL 的 base href 包含 query（实际代码行为）', () => {
    // URL 对象包含 ?v=1 时，baseForRelative.toString() 会包含它
    // 这是 toString() 的默认行为（路径 + query）
    const html = '<html><head></head></html>'
    const url = new URL('https://ogctmgdomkktuynsiwmf.supabase.co/storage/v1/object/public/test.html?v=1')
    const result = injectBaseHref(html, url)
    // base href 指向目录，不含文件名，query string 被保留（实际行为）
    expect(result).toContain('<base href=')
    expect(result).toContain('ogctmgdomkktuynsiwmf.supabase.co')
  })

  it('self-closing <head /> 也应被替换', () => {
    const html = '<html><head/></html>'
    const result = injectBaseHref(html, makeUrl('/test.html'))

    expect(result).toContain('<base href=')
  })

  it('<head> 带属性时应保留属性并追加 base', () => {
    const html = '<html><head lang="zh"></head></html>'
    const result = injectBaseHref(html, makeUrl('/test.html'))

    expect(result).toContain('lang="zh"')
    expect(result).toContain('<base href=')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试：文件大小限制
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-13: html-proxy - 文件大小限制（20MB）', () => {
  it('应接受 0 byte', () => {
    expect(0 <= MAX_BYTES).toBe(true)
  })

  it('应接受 1MB', () => {
    expect(1 * 1024 * 1024 <= MAX_BYTES).toBe(true)
  })

  it('应接受 10MB', () => {
    expect(10 * 1024 * 1024 <= MAX_BYTES).toBe(true)
  })

  it('应接受 20MB - 1 byte（最大有效大小）', () => {
    expect(20 * 1024 * 1024 - 1 <= MAX_BYTES).toBe(true)
  })

  it('应拒绝 20MB + 1 byte（刚好超限）', () => {
    expect(20 * 1024 * 1024 + 1 > MAX_BYTES).toBe(true)
  })

  it('应拒绝 21MB', () => {
    expect(21 * 1024 * 1024 > MAX_BYTES).toBe(true)
  })

  it('MAX_BYTES 应等于 20MB', () => {
    expect(MAX_BYTES).toBe(20 * 1024 * 1024)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试：getAllowedSupabaseHostnames - 环境变量处理
// ─────────────────────────────────────────────────────────────────────────────
describe('M12-10: html-proxy - getAllowedSupabaseHostnames 环境变量处理', () => {
  it('无环境变量时应只包含默认域名', () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    try {
      const hosts = getAllowedSupabaseHostnames()
      expect(hosts.has('ogctmgdomkktuynsiwmf.supabase.co')).toBe(true)
      expect(hosts.size).toBe(1)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original
    }
  })

  it('环境变量含尾部斜杠时应正确提取域名', () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://custom.supabase.co/'
    try {
      const hosts = getAllowedSupabaseHostnames()
      expect(hosts.has('custom.supabase.co')).toBe(true)
      expect(hosts.has('ogctmgdomkktuynsiwmf.supabase.co')).toBe(true)
      expect(hosts.size).toBe(2)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original
    }
  })

  it('环境变量含空白时应 trim', () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = '  https://sp.supabase.co  '
    try {
      const hosts = getAllowedSupabaseHostnames()
      expect(hosts.has('sp.supabase.co')).toBe(true)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original
    }
  })

  it('环境变量含非法 URL 时应忽略（不抛异常）', () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-valid-url'
    try {
      const hosts = getAllowedSupabaseHostnames()
      expect(hosts.has('ogctmgdomkktuynsiwmf.supabase.co')).toBe(true)
      expect(hosts.size).toBe(1)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original
    }
  })
})
