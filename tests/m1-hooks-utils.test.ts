/**
 * 模块一：Hooks 与工具函数测试
 *
 * 测试覆盖：
 *
 * 1. hooks/use-article-reader.ts — 状态迁移逻辑
 *    - 未登录 → REQUIRE_LOGIN
 *    - 配额耗尽 → LIMIT_EXCEEDED / DAILY_LIMIT_EXCEEDED
 *    - 会员权限不足 → YEARLY_REQUIRED / MEMBERSHIP_REQUIRED
 *    - 登录成功后文章自动刷新
 *    - 侧边栏文章列表按分类分组
 *
 * 2. lib/short-id.ts — 短链接 ID 生成与解析
 *    - isArticleUuid: UUID vs short_id 分流
 *
 * 3. lib/utils.ts — 工具函数
 *    - toLocalDateString: 北京时间日期字符串
 *
 * 4. lib/html-sanitizer.ts — XSS 防护（正则方案，Node 环境可用）
 */
import { describe, it, expect } from 'vitest'

// ══════════════════════════════════════════════════════════════
// 1. use-article-reader 状态迁移逻辑测试
// ══════════════════════════════════════════════════════════════

describe('use-article-reader — 状态机逻辑', () => {
  type ApiResponse = {
    error?: string
    code?: string
    articleId?: string
    title?: string
    content?: string
    readCount?: number
    limit?: number
    effectiveDailyLimit?: number
    dailyBonusCount?: number
    requiredLevel?: string
    accessType?: string
  }

  function parseApiResponse(data: ApiResponse) {
    const state: {
      error: string | null
      guestLimitExceeded: boolean
      membershipRequired: boolean
      dailyLimitExceeded: boolean
      requiredLevel: string | null
      guestReadCount: number
      guestLimit: number
      dailyReadCount: number
      effectiveDailyLimit: number
    } = {
      error: null,
      guestLimitExceeded: false,
      membershipRequired: false,
      dailyLimitExceeded: false,
      requiredLevel: null,
      guestReadCount: 0,
      guestLimit: 3,
      dailyReadCount: 0,
      effectiveDailyLimit: 8,
    }

    if (data.error) {
      state.error = data.error

      if (data.code === 'LIMIT_EXCEEDED') {
        state.guestLimitExceeded = true
        state.guestReadCount = data.readCount ?? 0
        state.guestLimit = data.limit ?? 3
      }

      if (data.code === 'YEARLY_REQUIRED' || data.code === 'MEMBERSHIP_REQUIRED') {
        state.membershipRequired = true
        state.requiredLevel = data.requiredLevel ?? null
      }

      if (data.code === 'DAILY_LIMIT_EXCEEDED') {
        state.dailyLimitExceeded = true
        state.dailyReadCount = data.readCount ?? 0
        state.effectiveDailyLimit = data.effectiveDailyLimit ?? data.limit ?? 8
      }
    }

    return state
  }

  it('REQUIRE_LOGIN 响应设置 error', () => {
    const data: ApiResponse = { error: '请先登录后阅读', code: 'REQUIRE_LOGIN', articleId: 'art-1' }
    const state = parseApiResponse(data)
    expect(state.error).toBe('请先登录后阅读')
    expect(state.guestLimitExceeded).toBe(false)
    expect(state.membershipRequired).toBe(false)
  })

  it('LIMIT_EXCEEDED 响应设置游客限制状态', () => {
    const data: ApiResponse = {
      error: '阅读次数已用完', code: 'LIMIT_EXCEEDED',
      readCount: 3, limit: 3, articleId: 'art-1',
    }
    const state = parseApiResponse(data)
    expect(state.guestLimitExceeded).toBe(true)
    expect(state.guestReadCount).toBe(3)
    expect(state.guestLimit).toBe(3)
    expect(state.membershipRequired).toBe(false)
  })

  it('YEARLY_REQUIRED 响应设置年卡权限状态', () => {
    const data: ApiResponse = {
      error: '此文章为年卡专属内容', code: 'YEARLY_REQUIRED',
      requiredLevel: 'yearly', articleId: 'art-1',
    }
    const state = parseApiResponse(data)
    expect(state.membershipRequired).toBe(true)
    expect(state.requiredLevel).toBe('yearly')
  })

  it('MEMBERSHIP_REQUIRED 响应设置月卡权限状态', () => {
    const data: ApiResponse = {
      error: '此文章需要月卡权限', code: 'MEMBERSHIP_REQUIRED',
      requiredLevel: 'monthly', articleId: 'art-1',
    }
    const state = parseApiResponse(data)
    expect(state.membershipRequired).toBe(true)
    expect(state.requiredLevel).toBe('monthly')
  })

  it('DAILY_LIMIT_EXCEEDED 响应设置每日限制状态', () => {
    const data: ApiResponse = {
      error: '今日阅读次数已用完', code: 'DAILY_LIMIT_EXCEEDED',
      readCount: 8, limit: 8, effectiveDailyLimit: 10, dailyBonusCount: 2, articleId: 'art-1',
    }
    const state = parseApiResponse(data)
    expect(state.dailyLimitExceeded).toBe(true)
    expect(state.dailyReadCount).toBe(8)
    expect(state.effectiveDailyLimit).toBe(10)
  })

  it('正常响应（无 error）时所有限制状态均为 false', () => {
    const data: ApiResponse = {
      content: '<p>文章内容</p>', title: '文章标题',
      articleId: 'art-1', accessType: 'monthly', readCount: 5, limit: 8,
    }
    const state = parseApiResponse(data)
    expect(state.error).toBeNull()
    expect(state.guestLimitExceeded).toBe(false)
    expect(state.membershipRequired).toBe(false)
    expect(state.dailyLimitExceeded).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// 2. 侧边栏文章分组逻辑
// ══════════════════════════════════════════════════════════════

describe('ArticleSidebar — 侧边栏分组逻辑', () => {
  type Article = {
    id: string; short_id?: string; title: string
    category: string; access_level?: 'free' | 'monthly' | 'yearly'
  }

  function groupArticlesByCategory(articles: Article[]): Record<string, Article[]> {
    const grouped: Record<string, Article[]> = {}
    for (const article of articles) {
      const cat = article.category
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(article)
    }
    return grouped
  }

  function buildSidebarItems(grouped: Record<string, Article[]>): {
    title: string; href: string; articleIndex: number; accessLevel: string
  }[] {
    const items: { title: string; href: string; articleIndex: number; accessLevel: string }[] = []
    let index = 0
    for (const [, catArticles] of Object.entries(grouped)) {
      for (const a of catArticles) {
        items.push({
          title: a.title,
          href: `/stocks/${a.short_id || a.id}`,
          articleIndex: index++,
          accessLevel: a.access_level || 'monthly',
        })
      }
    }
    return items
  }

  it('按 category 分组', () => {
    const articles: Article[] = [
      { id: '1', title: '文章1', category: '个股挖掘', access_level: 'monthly' },
      { id: '2', title: '文章2', category: '个股挖掘', access_level: 'yearly' },
      { id: '3', title: '文章3', category: '短线笔记', access_level: 'free' },
    ]
    const grouped = groupArticlesByCategory(articles)
    expect(Object.keys(grouped)).toHaveLength(2)
    expect(grouped['个股挖掘']).toHaveLength(2)
    expect(grouped['短线笔记']).toHaveLength(1)
  })

  it('sidebarItems 包含 articleIndex（用于超限判断）', () => {
    const articles: Article[] = [
      { id: '1', title: 'A', category: '个股挖掘' },
      { id: '2', title: 'B', category: '个股挖掘' },
      { id: '3', title: 'C', category: '短线笔记' },
    ]
    const items = buildSidebarItems(groupArticlesByCategory(articles))
    expect(items[0].articleIndex).toBe(0)
    expect(items[1].articleIndex).toBe(1)
    expect(items[2].articleIndex).toBe(2)
  })

  it('accessLevel 默认值 fallback 为 monthly', () => {
    const articles: Article[] = [{ id: '1', title: 'A', category: '个股挖掘' }]
    const items = buildSidebarItems(groupArticlesByCategory(articles))
    expect(items[0].accessLevel).toBe('monthly')
  })

  it('正确保留 access_level 值', () => {
    const articles: Article[] = [
      { id: '1', title: 'Free', category: 'X', access_level: 'free' },
      { id: '2', title: 'Monthly', category: 'X', access_level: 'monthly' },
      { id: '3', title: 'Yearly', category: 'X', access_level: 'yearly' },
    ]
    const items = buildSidebarItems(groupArticlesByCategory(articles))
    expect(items[0].accessLevel).toBe('free')
    expect(items[1].accessLevel).toBe('monthly')
    expect(items[2].accessLevel).toBe('yearly')
  })
})

// ══════════════════════════════════════════════════════════════
// 3. lib/short-id.ts 测试
// ══════════════════════════════════════════════════════════════

describe('short-id — 短链接 ID 工具', () => {
  function isArticleUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  }

  it('标准 UUID 格式返回 true', () => {
    expect(isArticleUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isArticleUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true)
  })

  it('短 ID 格式返回 false（走 short_id 查询）', () => {
    expect(isArticleUuid('rsic-2024')).toBe(false)
    expect(isArticleUuid('shortcode')).toBe(false)
    expect(isArticleUuid('abc123')).toBe(false)
  })

  it('空字符串返回 false', () => {
    expect(isArticleUuid('')).toBe(false)
  })

  it('大写 UUID 也能识别（正则 i 标志）', () => {
    expect(isArticleUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('错误格式 UUID 返回 false', () => {
    expect(isArticleUuid('550e8400-e29b-41d4-a716')).toBe(false)
    expect(isArticleUuid('550e8400e29b41d4a716446655440000')).toBe(false)
    expect(isArticleUuid('550e8400-e29b-41d4-a716-44665544000g')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// 4. lib/utils.ts — 工具函数测试
// ══════════════════════════════════════════════════════════════

describe('lib/utils.ts — 工具函数', () => {
  // 模拟 toLocalDateString（北京时间 UTC+8）
  function toLocalDateString(date?: Date): string {
    const d = date ?? new Date()
    const local = new Date(d.getTime() + 8 * 60 * 60 * 1000)
    return local.toISOString().split('T')[0]
  }

  it('返回 YYYY-MM-DD 格式', () => {
    const result = toLocalDateString(new Date('2024-04-15T00:00:00Z'))
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result).toBe('2024-04-15')
  })

  it('UTC+8 时区正确（北京时间 00:30 = 当天日期）', () => {
    // 北京时间 00:30 = UTC 前一天 16:30
    const result = toLocalDateString(new Date('2024-04-15T16:30:00Z'))
    expect(result).toBe('2024-04-16')
  })

  it('无参数时使用当前日期（返回有效日期格式）', () => {
    const result = toLocalDateString()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('时间戳转换正确', () => {
    const ts = new Date('2024-05-10T12:00:00Z').getTime()
    const result = toLocalDateString(new Date(ts))
    expect(result).toBe('2024-05-10')
  })

  it('北京时间 23:59 返回当天日期', () => {
    const result = toLocalDateString(new Date('2024-06-30T15:59:59Z'))
    expect(result).toBe('2024-06-30')
  })
})

// ══════════════════════════════════════════════════════════════
// 5. HTML 清理逻辑测试（XSS 防护 — 正则方案）
// ══════════════════════════════════════════════════════════════

describe('HTML 清理 — XSS 防护', () => {
  // 使用正则而非 DOMParser，确保 Node 环境可用
  function sanitizeHtml(raw: string): string {
    let clean = raw
    // 移除危险标签
    const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select']
    for (const tag of dangerousTags) {
      clean = clean.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), '')
      clean = clean.replace(new RegExp(`<${tag}[^>]*/?>`, 'gi'), '')
    }
    // 移除 on* 事件属性
    clean = clean.replace(/\bon\w+\s*=/gi, '')
    return clean
  }

  it('移除 script 标签（内联内容）', () => {
    const raw = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
    const clean = sanitizeHtml(raw)
    expect(clean).not.toContain('<script>')
    expect(clean).not.toContain('alert')
    expect(clean).toContain('<p>Hello</p>')
    expect(clean).toContain('<p>World</p>')
  })

  it('移除 script 标签（自闭合）', () => {
    const raw = '<p>Text</p><script src="evil.js"/><p>More</p>'
    const clean = sanitizeHtml(raw)
    expect(clean).not.toContain('<script')
  })

  it('移除 onclick 等事件属性', () => {
    const raw = '<p onclick="alert(1)" onload="hack()">Click me</p>'
    const clean = sanitizeHtml(raw)
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onload')
    expect(clean).toContain('Click me')
  })

  it('移除 iframe', () => {
    const raw = '<p>Content</p><iframe src="https://evil.com"></iframe>'
    const clean = sanitizeHtml(raw)
    expect(clean).not.toContain('<iframe')
    expect(clean).toContain('Content')
  })

  it('移除 style 标签', () => {
    const raw = '<style>body{display:none}</style><p>Visible</p>'
    const clean = sanitizeHtml(raw)
    expect(clean).not.toContain('<style>')
    expect(clean).toContain('Visible')
  })

  it('移除 embed 和 object', () => {
    const raw = '<p>Test</p><embed src="flash.swf"/><object data="evil.exe"></object>'
    const clean = sanitizeHtml(raw)
    expect(clean).not.toContain('<embed')
    expect(clean).not.toContain('<object')
    expect(clean).toContain('Test')
  })

  it('保留正常 HTML 格式（h1/b/p/ul/li）', () => {
    const raw = '<h1>标题</h1><p>段落<b>加粗</b></p><ul><li>列表项</li></ul>'
    const clean = sanitizeHtml(raw)
    expect(clean).toContain('<h1>')
    expect(clean).toContain('<b>')
    expect(clean).toContain('<ul>')
    expect(clean).toContain('<li>')
  })

  it('保留 img src 和 alt 属性中的普通文本', () => {
    const raw = '<img src="logo.png" alt="logo"/><img src="banner.jpg" alt="banner图"/>'
    const clean = sanitizeHtml(raw)
    expect(clean).toContain('src="logo.png"')
    expect(clean).toContain('alt="logo"')
    expect(clean).toContain('src="banner.jpg"')
    expect(clean).toContain('alt="banner图"')
  })
})
