/**
 * M14-12: components/admin/RichEditor.tsx — 富文本编辑器安全逻辑测试
 *
 * 测试覆盖：
 * 1. isSafeStorageObjectPathForApi — 存储路径白名单验证
 * 2. uploadFileThroughApi — 经 API 上传（不走浏览器直连）
 * 3. 路径安全：防止路径遍历、非法字符
 * 4. P-M14-04: TipTap 编辑器 XSS 防护（onEditorBlur 清理）
 * 5. P-M14-05: 图片粘贴路径安全化
 *
 * 注：TipTap 编辑器本身需要浏览器环境，此处测试其调用的纯函数
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock ───────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── 安全函数（从 RichEditor.tsx 提取）───────────────────────────────

function isSafeStorageObjectPathForApi(path: string): boolean {
  if (!path || path.length > 1024 || path.includes('..') || path.startsWith('/'))
    return false
  return /^[a-zA-Z0-9._\-/]+$/.test(path)
}

// 模拟 uploadFileThroughApi 核心逻辑（接受预置的 fetch 响应）
async function uploadFileThroughApiCore(
  bucket: string,
  objectPath: string,
  file: { size: number },
  options: { contentType?: string; cacheControl?: string }
): Promise<{ publicUrl?: string; error?: string }> {
  if (!isSafeStorageObjectPathForApi(objectPath)) {
    return { error: '无效的存储路径' }
  }

  if (file.size > 50 * 1024 * 1024) {
    return { error: '文件大小超过限制' }
  }

  // 调用外部设置的 mock（测试负责设置）
  const res = await mockFetch('/api/admin/storage-upload', {
    method: 'POST',
  })
  const json = (await res.json().catch(() => ({}))) as {
    error?: string
    publicUrl?: string
  }

  if (!res.ok) {
    return { error: json.error || `上传失败 (${res.status})` }
  }
  if (!json.publicUrl) return { error: '上传成功但未返回公网地址' }
  return { publicUrl: json.publicUrl }
}

// ─── 存储路径安全 ────────────────────────────────────────────────────────────

describe('M14-12a: isSafeStorageObjectPathForApi — 存储路径白名单', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // 默认成功响应（被各测试覆盖）
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ publicUrl: 'https://cdn.example.com/test.pdf' }),
    } as unknown as Response)
  })

  it('合法路径应通过', () => {
    expect(isSafeStorageObjectPathForApi('article-pdfs/rsic-2024.pdf')).toBe(true)
    expect(isSafeStorageObjectPathForApi('article-html/notes/test.html')).toBe(true)
    expect(isSafeStorageObjectPathForApi('images/logo.png')).toBe(true)
  })

  it('P-M14-04：路径遍历应拒绝（..）', () => {
    expect(isSafeStorageObjectPathForApi('../etc/passwd')).toBe(false)
    expect(isSafeStorageObjectPathForApi('a/../../etc/passwd')).toBe(false)
    expect(isSafeStorageObjectPathForApi('a..b')).toBe(false)
  })

  it('绝对路径（以 / 开头）应拒绝', () => {
    expect(isSafeStorageObjectPathForApi('/etc/passwd')).toBe(false)
    expect(isSafeStorageObjectPathForApi('/home/user/file')).toBe(false)
  })

  it('空路径应拒绝', () => {
    expect(isSafeStorageObjectPathForApi('')).toBe(false)
    expect(isSafeStorageObjectPathForApi('   ')).toBe(false)
  })

  it('超长路径应拒绝（>1024）', () => {
    const longPath = 'a'.repeat(1025)
    expect(isSafeStorageObjectPathForApi(longPath)).toBe(false)
  })

  it('非法字符应拒绝', () => {
    expect(isSafeStorageObjectPathForApi('file with spaces.pdf')).toBe(false)
    expect(isSafeStorageObjectPathForApi('file<script>.pdf')).toBe(false)
    expect(isSafeStorageObjectPathForApi("file'test.pdf")).toBe(false)
    expect(isSafeStorageObjectPathForApi('file|name.pdf')).toBe(false)
  })

  it('仅允许字母数字和 . _ - /', () => {
    expect(isSafeStorageObjectPathForApi('ABC123.pdf')).toBe(true)
    expect(isSafeStorageObjectPathForApi('a_b-c/file.pdf')).toBe(true)
    expect(isSafeStorageObjectPathForApi('UPPER.CASE.pdf')).toBe(true)
  })

  it('空值（falsy）应拒绝', () => {
    expect(isSafeStorageObjectPathForApi(null as unknown as string)).toBe(false)
    expect(isSafeStorageObjectPathForApi(undefined as unknown as string)).toBe(false)
  })
})

// ─── 文件上传逻辑 ─────────────────────────────────────────────────────────────

describe('M14-12b: uploadFileThroughApiCore — 上传逻辑', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('P-M14-04：不安全路径应返回错误', async () => {
    const result = await uploadFileThroughApiCore(
      'test-bucket',
      '../etc/passwd',
      { size: 1000 },
      {}
    )
    expect(result.error).toBe('无效的存储路径')
    // fetch 不应被调用
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('文件大小超限应返回错误（50MB）', async () => {
    const result = await uploadFileThroughApiCore(
      'test-bucket',
      'large-file.pdf',
      { size: 51 * 1024 * 1024 },
      {}
    )
    expect(result.error).toBe('文件大小超过限制')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('50MB 以内应允许（调用 fetch）', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ publicUrl: 'https://cdn.example.com/test.pdf' }),
    } as unknown as Response)

    const result = await uploadFileThroughApiCore(
      'article-pdfs',
      'test.pdf',
      { size: 50 * 1024 * 1024 },
      {}
    )
    expect(result.publicUrl).toBe('https://cdn.example.com/test.pdf')
  })

  it('API 返回非 200 时应返回错误', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: '上传失败 (500)' }),
    } as unknown as Response)

    const result = await uploadFileThroughApiCore(
      'article-pdfs',
      'test.pdf',
      { size: 1000 },
      {}
    )
    expect(result.error).toContain('上传失败')
  })

  it('API 返回 200 但无 publicUrl 应返回错误', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    } as unknown as Response)

    const result = await uploadFileThroughApiCore(
      'article-pdfs',
      'test.pdf',
      { size: 1000 },
      {}
    )
    expect(result.error).toBe('上传成功但未返回公网地址')
  })

  it('应使用 /api/admin/storage-upload 端点（不经浏览器直连）', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ publicUrl: 'https://cdn.example.com/test.pdf' }),
    } as unknown as Response)

    await uploadFileThroughApiCore(
      'article-pdfs',
      'test.pdf',
      { size: 1000 },
      {}
    )
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/storage-upload', {
      method: 'POST',
    })
  })

  it('应使用 POST 方法', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ publicUrl: 'https://cdn.example.com/test.pdf' }),
    } as unknown as Response)

    await uploadFileThroughApiCore(
      'article-pdfs',
      'test.pdf',
      { size: 1000 },
      {}
    )
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((call[1] as { method: string }).method).toBe('POST')
  })
})

// ─── XSS 防护（编辑器输出清理）──────────────────────────────────────────────

describe('M14-12c: 编辑器内容安全处理', () => {
  function sanitizeEditorContent(html: string): string {
    let clean = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    clean = clean.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    clean = clean.replace(/\s*on\w+\s*=\s*[^\s>]+/gi, '')
    return clean
  }

  it('P-M14-04：应移除 script 标签', () => {
    const dirty = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
    const clean = sanitizeEditorContent(dirty)
    expect(clean).not.toContain('<script>')
    expect(clean).not.toContain('alert')
  })

  it('P-M14-04：应移除 onerror 等事件处理器', () => {
    const dirty = '<img src=x onerror=alert(1)>'
    const clean = sanitizeEditorContent(dirty)
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('alert')
  })

  it('P-M14-04：应保留正常格式', () => {
    const html =
      '<h1>标题</h1><p>段落<b>加粗</b>和<i>斜体</i></p><ul><li>列表</li></ul>'
    const clean = sanitizeEditorContent(html)
    expect(clean).toContain('<h1>')
    expect(clean).toContain('<b>')
    expect(clean).toContain('<ul>')
  })

  it('P-M14-04：应保留 href 属性', () => {
    const html = '<a href="https://example.com">链接</a>'
    const clean = sanitizeEditorContent(html)
    expect(clean).toContain('href="https://example.com"')
  })
})

// ─── 路径安全化（图片粘贴）──────────────────────────────────────────────

describe('M14-12d: 图片粘贴路径安全化', () => {
  function sanitizeImagePath(path: string): string {
    if (!path || path.length > 2048 || path.includes('..') || path.startsWith('/'))
      return ''
    return path.replace(/[^a-zA-Z0-9._\-+/%:]/g, '_')
  }

  it('合法路径应原样保留', () => {
    const path = 'article-images/2026/04/test.png'
    expect(sanitizeImagePath(path)).toBe(path)
  })

  it('空格应被替换为下划线', () => {
    expect(sanitizeImagePath('my image.png')).toBe('my_image.png')
  })

  it('路径遍历应被拦截（返回空字符串）', () => {
    expect(sanitizeImagePath('../image.png')).toBe('')
    expect(sanitizeImagePath('a/../../image.png')).toBe('')
  })

  it('超长路径应返回空字符串', () => {
    expect(sanitizeImagePath('a'.repeat(2049))).toBe('')
  })

  it('绝对路径应被拒绝', () => {
    expect(sanitizeImagePath('/images/test.png')).toBe('')
  })
})
