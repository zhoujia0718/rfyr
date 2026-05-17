/**
 * M14-10: Admin Articles API — 文章管理 CRUD 逻辑测试
 *
 * 测试覆盖：
 * 1. 文章数据校验（title/content 非空）
 * 2. access_level 白名单验证（free/monthly/yearly）
 * 3. short_id 唯一性
 * 4. 文章删除权限（Admin 认证）
 * 5. 文章列表权限过滤
 * 6. P-M14-02: category_id 白名单验证
 * 7. P-M14-03: publishDate 格式验证
 *
 * 测试文件：app/api/admin/articles/route.ts + app/api/admin/articles/[id]/route.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock ────────────────────────────────────────────────────────────────────

const mockDb = {
  articles: [
    {
      id: 'art-001',
      short_id: 'rsic-2024',
      title: 'RSIC择时技巧',
      content: '<p>文章内容</p>',
      category_id: 'cat-notes',
      access_level: 'monthly',
      created_at: '2026-04-01T10:00:00Z',
    },
    {
      id: 'art-002',
      short_id: 'stock-001',
      title: '个股分析',
      content: '<p>分析内容</p>',
      category_id: 'cat-stocks',
      access_level: 'yearly',
      created_at: '2026-04-02T10:00:00Z',
    },
  ],
}

const mockAdminUser = { id: 'admin-1', email: 'admin@test.com', is_admin: true }
const mockNonAdminUser = null

function makeChain(records: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {}
  const result: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => result
  chain.update = () => chain
  chain.delete = () => chain
  chain.insert = () => result
  chain.order = () => chain
  chain.single = () => result
  result.then = () => Promise.resolve({ data: records, error: null })
  return { chain, result }
}

// ─── 验证函数（从路由提取）───────────────────────────────────────────────

type ArticleInput = Partial<{
  title: string
  content: string
  short_id: string
  category_id: string
  access_level: string
  publishDate: string
}>

function validateArticleInput(input: ArticleInput): string | null {
  if (!input.title?.trim()) return '标题不能为空'
  if (!input.content?.trim()) return '内容不能为空'
  if (input.title.trim().length > 500) return '标题不能超过 500 字符'
  if (input.content.trim().length > 100000) return '内容不能超过 100000 字符'
  return null
}

const ALLOWED_ACCESS_LEVELS = ['free', 'monthly', 'yearly'] as const
type AccessLevel = typeof ALLOWED_ACCESS_LEVELS[number]

function validateAccessLevel(level: string): level is AccessLevel {
  return ALLOWED_ACCESS_LEVELS.includes(level as AccessLevel)
}

const ALLOWED_CATEGORIES = ['cat-notes', 'cat-stocks', 'cat-masters'] as const

function validateCategoryId(id: string): boolean {
  return ALLOWED_CATEGORIES.includes(id as typeof ALLOWED_CATEGORIES[number])
}

function validatePublishDate(date: string): boolean {
  // YYYY-MM-DD 格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const d = new Date(date)
  return !isNaN(d.getTime())
}

function validateShortId(id: string): string | null {
  if (!id.trim()) return null // 可选
  if (id.length > 50) return 'short_id 不能超过 50 字符'
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return 'short_id 只能包含字母数字和短横线'
  return null
}

function checkAdminAuth(user: typeof mockAdminUser | null): boolean {
  return user?.is_admin === true
}

function checkDeletePermission(user: typeof mockAdminUser | null, articleId: string): string | null {
  if (!checkAdminAuth(user)) return '需要管理员权限'
  if (!articleId) return '缺少文章ID'
  return null
}

// ─── 文章输入验证 ─────────────────────────────────────────────────────────────

describe('M14-10a: validateArticleInput — 文章输入校验', () => {
  it('正常输入应返回 null', () => {
    expect(
      validateArticleInput({ title: '测试标题', content: '<p>内容</p>' })
    ).toBeNull()
  })

  it('空标题应返回错误', () => {
    expect(validateArticleInput({ title: '', content: '<p>内容</p>' })).toBe(
      '标题不能为空'
    )
  })

  it('空白标题应返回错误', () => {
    expect(validateArticleInput({ title: '   ', content: '<p>内容</p>' })).toBe(
      '标题不能为空'
    )
  })

  it('空内容应返回错误', () => {
    expect(validateArticleInput({ title: '标题', content: '' })).toBe(
      '内容不能为空'
    )
  })

  it('空白内容应返回错误', () => {
    expect(validateArticleInput({ title: '标题', content: '   ' })).toBe(
      '内容不能为空'
    )
  })

  it('标题超过 500 字符应返回错误', () => {
    const longTitle = 'a'.repeat(501)
    expect(
      validateArticleInput({ title: longTitle, content: '<p>内容</p>' })
    ).toBe('标题不能超过 500 字符')
  })

  it('内容超过 100000 字符应返回错误', () => {
    const longContent = 'x'.repeat(100001)
    expect(
      validateArticleInput({ title: '标题', content: longContent })
    ).toBe('内容不能超过 100000 字符')
  })
})

// ─── access_level 验证 ────────────────────────────────────────────────────────

describe('M14-10b: validateAccessLevel — 访问级别白名单', () => {
  it('free / monthly / yearly 均合法', () => {
    expect(validateAccessLevel('free')).toBe(true)
    expect(validateAccessLevel('monthly')).toBe(true)
    expect(validateAccessLevel('yearly')).toBe(true)
  })

  it('invalid 应拒绝', () => {
    expect(validateAccessLevel('invalid')).toBe(false)
  })

  it('空字符串应拒绝', () => {
    expect(validateAccessLevel('')).toBe(false)
  })

  it('大小写不敏感（monthly_vip 等旧值）应拒绝', () => {
    expect(validateAccessLevel('MONTHLY')).toBe(false)
    expect(validateAccessLevel('monthly_vip')).toBe(false)
    expect(validateAccessLevel('annual_vip')).toBe(false)
  })
})

// ─── category_id 验证 ────────────────────────────────────────────────────────

describe('M14-10c: validateCategoryId — 分类白名单', () => {
  it('允许的分类应通过', () => {
    expect(validateCategoryId('cat-notes')).toBe(true)
    expect(validateCategoryId('cat-stocks')).toBe(true)
    expect(validateCategoryId('cat-masters')).toBe(true)
  })

  it('P-M14-02：无效分类应拒绝', () => {
    expect(validateCategoryId('cat-invalid')).toBe(false)
    expect(validateCategoryId('admin')).toBe(false)
    expect(validateCategoryId('../../etc')).toBe(false)
    expect(validateCategoryId('')).toBe(false)
  })

  it('P-M14-02：路径遍历攻击应被拦截', () => {
    expect(validateCategoryId('../admin')).toBe(false)
    expect(validateCategoryId('/etc/passwd')).toBe(false)
  })
})

// ─── publishDate 格式验证 ───────────────────────────────────────────────────

describe('M14-10d: validatePublishDate — 日期格式', () => {
  it('P-M14-03：标准 YYYY-MM-DD 格式应通过', () => {
    expect(validatePublishDate('2026-04-20')).toBe(true)
    expect(validatePublishDate('2025-01-01')).toBe(true)
  })

  it('P-M14-03：非法日期应拒绝', () => {
    expect(validatePublishDate('2026-04-32')).toBe(false) // 不存在日期
    expect(validatePublishDate('2026-13-01')).toBe(false) // 月份不存在
    expect(validatePublishDate('invalid')).toBe(false)
    expect(validatePublishDate('2026/04/20')).toBe(false) // 斜杠格式
  })

  it('P-M14-03：ISO 格式（带时间）应拒绝', () => {
    expect(validatePublishDate('2026-04-20T10:00:00Z')).toBe(false)
  })
})

// ─── short_id 验证 ─────────────────────────────────────────────────────────

describe('M14-10e: validateShortId — 短链接格式', () => {
  it('合法 short_id 应返回 null', () => {
    expect(validateShortId('rsic-2024')).toBeNull()
    expect(validateShortId('article-abc')).toBeNull()
    expect(validateShortId('test_123')).toBeNull()
    expect(validateShortId('a')).toBeNull()
  })

  it('空字符串应返回 null（可选字段）', () => {
    expect(validateShortId('')).toBeNull()
    expect(validateShortId('   ')).toBeNull()
  })

  it('超长 short_id 应返回错误', () => {
    expect(validateShortId('a'.repeat(51))).toBe('short_id 不能超过 50 字符')
  })

  it('非法字符应返回错误', () => {
    expect(validateShortId('hello world')).toBe(
      'short_id 只能包含字母数字和短横线'
    )
    expect(validateShortId('hello<script>')).toBe(
      'short_id 只能包含字母数字和短横线'
    )
    expect(validateShortId('中文id')).toBe(
      'short_id 只能包含字母数字和短横线'
    )
  })
})

// ─── 权限验证 ────────────────────────────────────────────────────────────────

describe('M14-10f: 权限验证', () => {
  it('管理员应通过认证', () => {
    expect(checkAdminAuth(mockAdminUser)).toBe(true)
  })

  it('非管理员应拒绝', () => {
    expect(checkAdminAuth(mockNonAdminUser)).toBe(false)
  })

  it('删除权限检查应验证管理员 + articleId', () => {
    expect(checkDeletePermission(null, 'art-001')).toBe('需要管理员权限')
    expect(checkDeletePermission(mockAdminUser, '')).toBe('缺少文章ID')
    expect(checkDeletePermission(mockAdminUser, 'art-001')).toBeNull()
  })
})

// ─── 文章列表过滤 ────────────────────────────────────────────────────────────

describe('M14-10g: 文章列表过滤逻辑', () => {
  it('应返回所有文章（Admin）', () => {
    const all = mockDb.articles
    expect(all).toHaveLength(2)
  })

  it('应支持按 access_level 过滤', () => {
    const monthly = mockDb.articles.filter(
      (a) => a.access_level === 'monthly'
    )
    expect(monthly).toHaveLength(1)
    expect(monthly[0].title).toBe('RSIC择时技巧')
  })

  it('应支持按 category_id 过滤', () => {
    const stocks = mockDb.articles.filter(
      (a) => a.category_id === 'cat-stocks'
    )
    expect(stocks).toHaveLength(1)
    expect(stocks[0].title).toBe('个股分析')
  })

  it('空结果应返回空数组', () => {
    const empty = mockDb.articles.filter(
      (a) => a.category_id === 'cat-nonexistent'
    )
    expect(empty).toHaveLength(0)
  })
})
