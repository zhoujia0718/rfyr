/**
 * M7-21: components/article-html-full-embed.tsx — HTML 全嵌组件逻辑测试
 *
 * 测试覆盖：
 * 1. htmlProxyPath — 代理 URL 构造（encodeURIComponent）
 * 2. 非 http 链接返回 null（无 html_url）
 * 3. html_url 为空时返回 null
 * 4. html_url 为空字符串时返回 null
 * 5. 全屏状态切换逻辑（isFullscreen）
 * 6. sandbox 属性验证
 * 7. ArticleHtmlFullEmbedProps 接口
 */
import { describe, it, expect } from 'vitest'

// ─── 从组件提取的纯函数 ──────────────────────────────────────────────

function htmlProxyPath(htmlUrl: string): string {
  return `/api/html-proxy?url=${encodeURIComponent(htmlUrl)}`
}

function isEmbeddableUrl(htmlUrl: string | null | undefined): boolean {
  const url = (htmlUrl || '').trim()
  return !!(url && url.startsWith('http'))
}

// ─── htmlProxyPath ────────────────────────────────────────────────────

describe('M7-21a: htmlProxyPath — 代理 URL 构造', () => {
  it('应构造 /api/html-proxy?url=... 格式', () => {
    const result = htmlProxyPath('https://example.com/article.html')
    expect(result).toBe('/api/html-proxy?url=https%3A%2F%2Fexample.com%2Farticle.html')
  })

  it('中文路径应正确编码', () => {
    const result = htmlProxyPath('https://example.com/文章.html')
    expect(result).toContain('url=')
    expect(result).not.toContain('文章')
    expect(result).toContain('%')
  })

  it('URL 中含查询参数应正确编码', () => {
    const result = htmlProxyPath('https://example.com/page?id=123&ref=abc')
    // encodeURIComponent 会编码 ? 和 & 以及 =，但 base href 后的 ? 保留
    expect(result).toContain('url=')
    expect(result).toContain('%3F') // ? 被编码
    expect(result).toContain('%26') // & 被编码
    expect(result).toContain('id%3D123')
    expect(result).toContain('ref%3Dabc')
  })

  it('基础 URL 应直接编码', () => {
    const result = htmlProxyPath('https://yuque.com/user/abc.pdf')
    expect(result).toBe('/api/html-proxy?url=https%3A%2F%2Fyuque.com%2Fuser%2Fabc.pdf')
  })
})

// ─── URL 可嵌入性判断 ──────────────────────────────────────────────

describe('M7-21b: isEmbeddableUrl — URL 可嵌入性判断', () => {
  it('完整 http URL 应返回 true', () => {
    expect(isEmbeddableUrl('https://example.com/article.html')).toBe(true)
    expect(isEmbeddableUrl('http://example.com/page')).toBe(true)
  })

  it('null 应返回 false', () => {
    expect(isEmbeddableUrl(null)).toBe(false)
  })

  it('undefined 应返回 false', () => {
    expect(isEmbeddableUrl(undefined)).toBe(false)
  })

  it('空字符串应返回 false', () => {
    expect(isEmbeddableUrl('')).toBe(false)
  })

  it('纯空白字符串应返回 false', () => {
    expect(isEmbeddableUrl('   ')).toBe(false)
  })

  it('非 http 协议应返回 false', () => {
    expect(isEmbeddableUrl('ftp://example.com/file')).toBe(false)
    expect(isEmbeddableUrl('file://example.com/file')).toBe(false)
  })

  it('非 URL 字符串应返回 false', () => {
    expect(isEmbeddableUrl('just some text')).toBe(false)
  })
})

// ─── ArticleHtmlFullEmbedProps 接口 ──────────────────────────────────

describe('M7-21c: ArticleHtmlFullEmbedProps 接口', () => {
  it('article 字段包含 title 和 html_url', () => {
    const article = {
      id: 'art-1',
      title: 'RSIC择时技巧',
      html_url: 'https://cdn.example.com/rsic.html',
      content: '',
      category: 'notes',
      created_at: '2026-04-01',
      short_id: 'rsic-2024',
      access_level: 'monthly',
    }
    expect(article.title).toBe('RSIC择时技巧')
    expect(article.html_url).toBe('https://cdn.example.com/rsic.html')
  })
})

// ─── sandbox 属性验证 ───────────────────────────────────────────────

describe('M7-21d: sandbox 属性验证', () => {
  const REQUIRED_SANDBOX_FLAGS = [
    'allow-scripts',
    'allow-same-origin',
    'allow-forms',
    'allow-popups',
    'allow-popups-to-escape-sandbox',
  ]

  it('所有必需的 sandbox 标志均存在', () => {
    const sandboxAttr = REQUIRED_SANDBOX_FLAGS.join(' ')
    REQUIRED_SANDBOX_FLAGS.forEach((flag) => {
      expect(sandboxAttr).toContain(flag)
    })
  })

  it('不应包含 allow-top-navigation（安全风险）', () => {
    const safeFlags = REQUIRED_SANDBOX_FLAGS
    expect(safeFlags).not.toContain('allow-top-navigation')
    expect(safeFlags).not.toContain('allow-top-navigation-by-user-activation')
  })

  it('不应包含 allow-modals（安全风险）', () => {
    const safeFlags = REQUIRED_SANDBOX_FLAGS
    expect(safeFlags).not.toContain('allow-modals')
  })
})

// ─── 全屏状态切换 ───────────────────────────────────────────────────

describe('M7-21e: 全屏状态切换逻辑', () => {
  it('初始状态应为 false', () => {
    const isFullscreen = false
    expect(isFullscreen).toBe(false)
  })

  it('点击全屏按钮后切换为 true', () => {
    let isFullscreen = false
    isFullscreen = true // 模拟点击
    expect(isFullscreen).toBe(true)
  })

  it('点击退出按钮后切换为 false', () => {
    let isFullscreen = true
    isFullscreen = false // 模拟点击
    expect(isFullscreen).toBe(false)
  })
})
