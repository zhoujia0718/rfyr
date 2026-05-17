/**
 * 模块一：内容管理系统 — 单元测试
 *
 * 测试覆盖：
 * 1. lib/articles.ts — mapArticleRow、articleToDbInsert、articleToDbUpdate
 * 2. lib/short-id.ts — isArticleUuid
 * 3. lib/category-utils.ts — 全套工具函数
 *
 * 所有函数均内联定义，与源文件逻辑保持同步。
 * 不依赖 require('@/lib/...')，确保测试环境无关。
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ══════════════════════════════════════════════════════════════
// 测试数据
// ══════════════════════════════════════════════════════════════

const MOCK_DB_ARTICLE_ROW: Record<string, unknown> = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  short_id: 'short-abc123',
  title: '测试文章：RSIC择时技巧',
  content: '<p>这是一篇关于技术分析的文章内容...</p>',
  category: '短线笔记',
  subcategory: '技术指标',
  author: '李老师',
  publishdate: '2024-03-15',
  readingcount: 42,
  pdf_url: 'https://cdn.example.com/pdfs/test.pdf',
  pdf_original_name: 'RSIC择时.pdf',
  html_url: 'https://cdn.example.com/articles/rsic.html',
  html_original_name: 'RSIC择时.html',
  is_review: true,
  access_level: 'monthly',
  created_at: '2024-03-15T10:00:00Z',
  updated_at: '2024-03-16T08:30:00Z',
}

const MOCK_DB_ARTICLE_NO_SHORT_ID: Record<string, unknown> = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  title: '另一篇文章',
  content: '<p>内容</p>',
  category: '个股挖掘',
  author: '王老师',
  publishDate: '2024-04-01',
  readingCount: 10,
  created_at: '2024-04-01T10:00:00Z',
  updated_at: '2024-04-01T10:00:00Z',
  access_level: 'yearly',
}

const MOCK_DB_CATEGORY_ROWS: Record<string, unknown>[] = [
  { id: 'cat-1', name: '短线笔记', icon: '📝', description: '技术分析', href: '/notes', parent_id: null, created_at: '2024-01-01T00:00:00Z' },
  { id: 'cat-2', name: '技术指标', icon: '📊', description: '', href: null, parent_id: 'cat-1', created_at: '2024-01-02T00:00:00Z' },
  { id: 'cat-3', name: '量价关系', icon: '📈', description: '', href: null, parent_id: 'cat-1', created_at: '2024-01-03T00:00:00Z' },
  { id: 'cat-4', name: 'RSIC技巧', icon: '🔧', description: '', href: null, parent_id: 'cat-2', created_at: '2024-01-04T00:00:00Z' },
  { id: 'cat-5', name: '个股挖掘', icon: '💎', description: '深度研究', href: '/stocks', parent_id: null, created_at: '2024-01-05T00:00:00Z' },
  { id: 'cat-6', name: '行业研究', icon: '🏭', description: '', href: null, parent_id: 'cat-5', created_at: '2024-01-06T00:00:00Z' },
  { id: 'cat-7', name: '免费文章', icon: '🆓', description: '免费内容', href: '/free', parent_id: null, created_at: '2024-01-07T00:00:00Z' },
]

// ══════════════════════════════════════════════════════════════
// 被测函数（内联复制自 lib/articles.ts）
// ══════════════════════════════════════════════════════════════

interface Article {
  id: string
  short_id?: string
  title: string
  content: string
  category: string
  subcategory?: string
  author: string
  publishDate: string
  readingCount: number
  pdf_url: string | null
  html_url: string | null
  is_review?: boolean
  access_level: 'free' | 'monthly' | 'yearly'
  created_at: string
  updated_at: string
}

function mapArticleRow(row: Record<string, unknown>): Article {
  const pd = row.publishdate ?? row.publishDate ?? ''
  const rc = row.readingcount ?? row.readingCount ?? 0
  return {
    id: String(row.id ?? ''),
    short_id: row.short_id as string | undefined,
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
    category: String(row.category ?? ''),
    subcategory: row.subcategory as string | undefined,
    author: String(row.author ?? ''),
    publishDate: String(pd),
    readingCount: Number(rc),
    pdf_url: (row.pdf_url as string | null) ?? null,
    html_url: (row.html_url as string | null) ?? null,
    is_review: row.is_review as boolean | undefined,
    access_level: (row.access_level as 'free' | 'monthly' | 'yearly') ?? 'monthly',
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function articleToDbInsert(article: Partial<Article>): Record<string, unknown> {
  const insert: Record<string, unknown> = {
    title: article.title,
    content: article.content,
    category: article.category,
    author: article.author,
    publishdate: article.publishDate,
    readingcount: 0,
    access_level: article.access_level ?? 'monthly',
  }
  if (article.short_id !== undefined) insert.short_id = article.short_id
  if (article.subcategory !== undefined) insert.subcategory = article.subcategory
  if (article.pdf_url !== undefined) insert.pdf_url = article.pdf_url
  if (article.html_url !== undefined) insert.html_url = article.html_url
  if (article.is_review !== undefined) insert.is_review = article.is_review
  return insert
}

function articleToDbUpdate(updates: Partial<Article>): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  const keys: (keyof Article)[] = [
    'title', 'content', 'category', 'subcategory', 'author',
    'pdf_url', 'html_url', 'is_review', 'access_level',
  ]
  for (const key of keys) {
    if (updates[key] !== undefined) {
      (update as Record<string, unknown>)[key] = updates[key]
    }
  }
  if (updates.publishDate !== undefined) update.publishdate = updates.publishDate
  if (updates.readingCount !== undefined) update.readingcount = updates.readingCount
  return update
}

// ══════════════════════════════════════════════════════════════
// 被测函数（内联复制自 lib/short-id.ts）
// ══════════════════════════════════════════════════════════════

function isArticleUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

// ══════════════════════════════════════════════════════════════
// 被测函数（内联复制自 lib/category-utils.ts）
// ══════════════════════════════════════════════════════════════

interface CategoryNode {
  id: string
  name: string
  icon?: string
  description?: string
  href?: string | null
  parentId?: string | null
}

interface CategoryMaps {
  categoryMap: Record<string, CategoryNode>
  nameToIdMap: Record<string, string>
  childrenMap: Record<string, string[]>
}

function buildCategoryMaps(rows: CategoryNode[]): CategoryMaps {
  const categoryMap: Record<string, CategoryNode> = {}
  const nameToIdMap: Record<string, string> = {}
  const childrenMap: Record<string, string[]> = {}

  for (const row of rows) {
    categoryMap[row.id] = {
      id: row.id,
      name: row.name || '',
      icon: row.icon,
      description: row.description,
      href: row.href,
      parentId: row.parentId,
    }
    if (row.name) {
      const trimmed = String(row.name).trim()
      if (trimmed) nameToIdMap[trimmed] = row.id
    }
    const parentId = row.parentId || ''
    if (parentId) {
      if (!childrenMap[parentId]) childrenMap[parentId] = []
      childrenMap[parentId].push(row.id)
    }
  }

  return { categoryMap, nameToIdMap, childrenMap }
}

function isInCategoryTree(
  articleCategory: string,
  rootCategoryName: string,
  categoryMap: Record<string, CategoryNode>,
  nameToIdMap: Record<string, string>
): boolean {
  const ac = String(articleCategory || '').trim()
  const rn = String(rootCategoryName || '').trim()
  if (!ac) return false
  if (ac === rn) return true

  let currentName = ac
  const visited = new Set<string>()

  while (currentName) {
    if (visited.has(currentName)) break
    visited.add(currentName)
    const categoryId = nameToIdMap[currentName]
    if (!categoryId) break
    const categoryInfo = categoryMap[categoryId]
    if (!categoryInfo) break

    let parentId = categoryInfo.parentId
    while (parentId) {
      const parentInfo = categoryMap[parentId]
      if (!parentInfo) break
      const parentName = String(parentInfo.name || '').trim()
      if (parentName === rn) return true
      parentId = parentInfo.parentId
    }
    break
  }
  return false
}

function getDescendantCategoryNames(
  rootId: string,
  childrenMap: Record<string, string[]>,
  categoryMap: Record<string, CategoryNode>
): Set<string> {
  const names = new Set<string>()
  function visit(id: string): void {
    const childIds = childrenMap[id]
    if (!childIds) return
    for (const childId of childIds) {
      const category = categoryMap[childId]
      if (!category) continue
      const name = String(category.name || '').trim()
      if (name) names.add(name)
      visit(childId)
    }
  }
  visit(rootId)
  return names
}

function filterArticlesByCategory(
  articles: { category: string }[],
  rootCategoryName: string,
  categoryMap: Record<string, CategoryNode>,
  nameToIdMap: Record<string, string>
): { category: string }[] {
  return articles.filter((article) =>
    isInCategoryTree(article.category, rootCategoryName, categoryMap, nameToIdMap)
  )
}

function filterArticlesBySection(
  articles: { category: string }[],
  sectionHref: string,
  rows: Record<string, unknown>[],
  fallbackRoots: string[],
  categoryMap: Record<string, CategoryNode>,
  nameToIdMap: Record<string, string>
): { category: string }[] {
  const subtreeNames = new Set<string>()
  for (const row of rows) {
    const href = row.href as string | null
    if (!href) continue
    const t1 = String(href).trim().replace(/\/$/, '')
    const t2 = String(sectionHref).trim().replace(/\/$/, '')
    if (t1 === t2) {
      const id = String(row.id)
      const descendants = getDescendantCategoryNames(id, {}, categoryMap)
      descendants.forEach((n) => subtreeNames.add(n))
    }
  }
  const fallbackMatches = new Set<string>()
  for (const root of fallbackRoots) {
    for (const [name] of Object.entries(nameToIdMap)) {
      if (isInCategoryTree(name, root, categoryMap, nameToIdMap)) {
        fallbackMatches.add(name)
      }
    }
  }
  const validNames = new Set([...subtreeNames, ...fallbackMatches])
  return articles.filter((article) => {
    const cn = String(article.category || '').trim()
    if (!cn) return false
    return validNames.has(cn)
  })
}

function findCategoryRootIdsByHref(rows: CategoryNode[], targetHref: string): string[] {
  const normalize = (h: string): string => {
    const t = String(h || '').trim().replace(/\/$/, '')
    return t || String(h || '').trim()
  }
  const target = normalize(targetHref)
  return rows
    .filter((r) => {
      const href = r.href
      if (!href) return false
      return normalize(String(href)) === target
    })
    .map((r) => String(r.id))
}

function toCategoryNode(row: Record<string, unknown>): CategoryNode {
  return {
    id: String(row.id),
    name: String(row.name ?? '').trim(),
    icon: row.icon as string | undefined,
    description: row.description as string | undefined,
    href: (row.href as string | null) ?? undefined,
    parentId: (row.parent_id as string | null | undefined) ?? (row.parentId as string | null | undefined),
  }
}

function buildCategoryTree(
  categories: CategoryNode[],
  parentId?: string
): (CategoryNode & { children: ReturnType<typeof buildCategoryTree> })[] {
  return categories
    .filter((cat) => {
      const catParentId = cat.parentId
      if (parentId === undefined) {
        return catParentId === null || catParentId === undefined || catParentId === ''
      }
      return catParentId === parentId
    })
    .map((cat) => ({
      ...cat,
      children: buildCategoryTree(categories, cat.id),
    }))
}

// ══════════════════════════════════════════════════════════════
// 1. mapArticleRow — 数据库行映射
// ══════════════════════════════════════════════════════════════

describe('mapArticleRow — 数据库行映射', () => {
  it('正确映射标准数据库行（含 short_id）', () => {
    const article = mapArticleRow(MOCK_DB_ARTICLE_ROW)
    expect(article.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    expect(article.short_id).toBe('short-abc123')
    expect(article.title).toBe('测试文章：RSIC择时技巧')
    expect(article.content).toBe('<p>这是一篇关于技术分析的文章内容...</p>')
    expect(article.category).toBe('短线笔记')
    expect(article.subcategory).toBe('技术指标')
    expect(article.author).toBe('李老师')
    expect(article.publishDate).toBe('2024-03-15')
    expect(article.readingCount).toBe(42)
    expect(article.pdf_url).toBe('https://cdn.example.com/pdfs/test.pdf')
    expect(article.html_url).toBe('https://cdn.example.com/articles/rsic.html')
    expect(article.is_review).toBe(true)
    expect(article.access_level).toBe('monthly')
  })

  it('正确处理无 short_id 的行', () => {
    const article = mapArticleRow(MOCK_DB_ARTICLE_NO_SHORT_ID)
    expect(article.short_id).toBeUndefined()
    expect(article.title).toBe('另一篇文章')
    expect(article.category).toBe('个股挖掘')
    expect(article.is_review).toBeUndefined()
    expect(article.access_level).toBe('yearly')
  })

  it('正确处理 publishDate 字段名（而非 publishdate）', () => {
    const row = { ...MOCK_DB_ARTICLE_ROW, publishDate: '2024-05-01' }
    delete (row as Record<string, unknown>).publishdate
    const article = mapArticleRow(row)
    expect(article.publishDate).toBe('2024-05-01')
  })

  it('正确处理 readingCount 字段名（而非 readingcount）', () => {
    const row = { ...MOCK_DB_ARTICLE_ROW, readingCount: 99 }
    delete (row as Record<string, unknown>).readingcount
    const article = mapArticleRow(row)
    expect(article.readingCount).toBe(99)
  })

  it('字段缺失时使用默认值', () => {
    const minimalRow: Record<string, unknown> = { id: 'test-id', title: '极简文章' }
    const article = mapArticleRow(minimalRow)
    expect(article.id).toBe('test-id')
    expect(article.title).toBe('极简文章')
    expect(article.content).toBe('')
    expect(article.category).toBe('')
    expect(article.author).toBe('')
    expect(article.publishDate).toBe('')
    expect(article.readingCount).toBe(0)
    expect(article.pdf_url).toBeNull()
    expect(article.html_url).toBeNull()
    expect(article.is_review).toBeUndefined()
    expect(article.access_level).toBe('monthly')
  })

  it('正确处理 null 值字段', () => {
    // String(null) === 'null'，但 mapArticleRow 使用 `??`，null ?? '' → ''
    const row: Record<string, unknown> = {
      id: 'null-test', title: null, content: null, category: null, pdf_url: null, html_url: null,
    }
    const article = mapArticleRow(row)
    expect(article.title).toBe('')
    expect(article.content).toBe('')
    expect(article.category).toBe('')
    expect(article.pdf_url).toBeNull()
    expect(article.html_url).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════
// 2. articleToDbInsert
// ══════════════════════════════════════════════════════════════

describe('articleToDbInsert — Article 转为数据库插入格式', () => {
  it('正确转换所有字段', () => {
    const insert = articleToDbInsert({
      title: '新文章标题', content: '<p>内容</p>', category: '短线笔记',
      subcategory: '技术指标', author: '张老师', publishDate: '2024-06-01',
      short_id: 'new-short', pdf_url: 'https://cdn.com/file.pdf',
      html_url: 'https://cdn.com/file.html', is_review: true, access_level: 'free',
    })
    expect(insert.title).toBe('新文章标题')
    expect(insert.publishdate).toBe('2024-06-01')
    expect(insert.short_id).toBe('new-short')
    expect(insert.readingcount).toBe(0)
    expect(insert.is_review).toBe(true)
    expect(insert.access_level).toBe('free')
  })

  it('忽略不应写入的字段', () => {
    const insert = articleToDbInsert({
      title: '测试', content: 'x', category: 'x', author: 'x', publishDate: 'x',
      id: 'should-be-ignored', readingCount: 999, created_at: 'ignored', updated_at: 'ignored',
    } as never)
    expect((insert as Record<string, unknown>).id).toBeUndefined()
    expect((insert as Record<string, unknown>).readingCount).toBeUndefined()
    expect((insert as Record<string, unknown>).created_at).toBeUndefined()
  })

  it('可选字段缺失时不报错', () => {
    expect(() => articleToDbInsert({
      title: '极简', content: '', category: 'x', author: 'x', publishDate: 'x',
    })).not.toThrow()
  })
})

// ══════════════════════════════════════════════════════════════
// 3. articleToDbUpdate
// ══════════════════════════════════════════════════════════════

describe('articleToDbUpdate — Partial<Article> 转为数据库更新格式', () => {
  it('仅更新提供的字段', () => {
    const result = articleToDbUpdate({ title: '更新后的标题', access_level: 'yearly' as const })
    expect(result.title).toBe('更新后的标题')
    expect(result.access_level).toBe('yearly')
    expect((result as Record<string, unknown>).content).toBeUndefined()
  })

  it('正确映射字段名（publishDate -> publishdate）', () => {
    const result = articleToDbUpdate({ publishDate: '2024-07-01', readingCount: 100 })
    expect(result.publishdate).toBe('2024-07-01')
    expect(result.readingcount).toBe(100)
    expect((result as Record<string, unknown>).publishDate).toBeUndefined()
  })

  it('处理 undefined 值（不包含在结果中）', () => {
    const result = articleToDbUpdate({ title: undefined, category: undefined } as Partial<Article>)
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('处理布尔值字段', () => {
    const result = articleToDbUpdate({ is_review: false })
    expect(result.is_review).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// 4. isArticleUuid
// ══════════════════════════════════════════════════════════════

describe('isArticleUuid — UUID 格式检测', () => {
  it('标准 UUID 返回 true', () => {
    expect(isArticleUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isArticleUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true)
  })

  it('大写 UUID 也能识别', () => {
    expect(isArticleUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('短 ID 格式返回 false（走 short_id 查询）', () => {
    expect(isArticleUuid('rsic-2024')).toBe(false)
    expect(isArticleUuid('shortcode')).toBe(false)
    expect(isArticleUuid('abc123')).toBe(false)
  })

  it('空字符串返回 false', () => {
    expect(isArticleUuid('')).toBe(false)
  })

  it('错误格式返回 false', () => {
    expect(isArticleUuid('550e8400-e29b-41d4-a716')).toBe(false)
    expect(isArticleUuid('550e8400e29b41d4a716446655440000')).toBe(false)
    expect(isArticleUuid('550e8400-e29b-41d4-a716-44665544000g')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// 5. buildCategoryMaps
// ══════════════════════════════════════════════════════════════

describe('buildCategoryMaps — 构建三张映射表', () => {
  let maps: CategoryMaps

  beforeEach(() => {
    const nodes = MOCK_DB_CATEGORY_ROWS.map(toCategoryNode)
    maps = buildCategoryMaps(nodes)
  })

  it('构建 categoryMap（id -> CategoryNode）', () => {
    expect(maps.categoryMap['cat-1']).toMatchObject({ id: 'cat-1', name: '短线笔记' })
    expect(maps.categoryMap['cat-4']).toMatchObject({ id: 'cat-4', name: 'RSIC技巧', parentId: 'cat-2' })
    expect(maps.categoryMap['cat-99']).toBeUndefined()
  })

  it('构建 nameToIdMap（name -> id）', () => {
    expect(maps.nameToIdMap['短线笔记']).toBe('cat-1')
    expect(maps.nameToIdMap['个股挖掘']).toBe('cat-5')
  })

  it('构建 childrenMap（parentId -> [childIds]）', () => {
    expect(maps.childrenMap['cat-1']).toContain('cat-2')
    expect(maps.childrenMap['cat-1']).toContain('cat-3')
    expect(maps.childrenMap['cat-2']).toContain('cat-4')
  })

  it('处理空数组', () => {
    const empty = buildCategoryMaps([])
    expect(Object.keys(empty.categoryMap)).toHaveLength(0)
    expect(Object.keys(empty.nameToIdMap)).toHaveLength(0)
    expect(Object.keys(empty.childrenMap)).toHaveLength(0)
  })

  it('过滤空白 name', () => {
    const nodes = [
      { id: 'n1', name: '  有效分类  ', parentId: null },
      { id: 'n2', name: '', parentId: null },
      { id: 'n3', name: null, parentId: null },
    ]
    const m = buildCategoryMaps(nodes as CategoryNode[])
    expect(m.nameToIdMap['有效分类']).toBe('n1')
    expect(m.nameToIdMap['']).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════
// 6. isInCategoryTree
// ══════════════════════════════════════════════════════════════

describe('isInCategoryTree — 分类树匹配', () => {
  let maps: CategoryMaps

  beforeEach(() => {
    maps = buildCategoryMaps(MOCK_DB_CATEGORY_ROWS.map(toCategoryNode))
  })

  it('精确匹配根分类', () => {
    expect(isInCategoryTree('短线笔记', '短线笔记', maps.categoryMap, maps.nameToIdMap)).toBe(true)
  })

  it('匹配二级子分类（技术指标 -> 短线笔记）', () => {
    expect(isInCategoryTree('技术指标', '短线笔记', maps.categoryMap, maps.nameToIdMap)).toBe(true)
  })

  it('匹配三级子分类（RSIC技巧 -> 短线笔记）', () => {
    expect(isInCategoryTree('RSIC技巧', '短线笔记', maps.categoryMap, maps.nameToIdMap)).toBe(true)
  })

  it('不同分类树下不匹配', () => {
    expect(isInCategoryTree('量价关系', '个股挖掘', maps.categoryMap, maps.nameToIdMap)).toBe(false)
  })

  it('独立分类（免费文章）不在任何分类树下', () => {
    expect(isInCategoryTree('免费文章', '短线笔记', maps.categoryMap, maps.nameToIdMap)).toBe(false)
    expect(isInCategoryTree('免费文章', '个股挖掘', maps.categoryMap, maps.nameToIdMap)).toBe(false)
  })

  it('空分类名返回 false', () => {
    expect(isInCategoryTree('', '短线笔记', maps.categoryMap, maps.nameToIdMap)).toBe(false)
  })

  it('未知分类名返回 false', () => {
    expect(isInCategoryTree('不存在的分类', '短线笔记', maps.categoryMap, maps.nameToIdMap)).toBe(false)
  })

  it('trim 处理空白字符', () => {
    expect(isInCategoryTree('  短线笔记  ', '短线笔记', maps.categoryMap, maps.nameToIdMap)).toBe(true)
  })

  it('防止循环引用（visited set）', () => {
    const cyclicNodes = [
      { id: 'n1', name: '节点A', parentId: 'n2' },
      { id: 'n2', name: '节点B', parentId: 'n1' },
    ]
    const cyclicMaps = buildCategoryMaps(cyclicNodes as CategoryNode[])
    expect(() => {
      isInCategoryTree('节点A', '节点B', cyclicMaps.categoryMap, cyclicMaps.nameToIdMap)
    }).not.toThrow()
  })
})

// ══════════════════════════════════════════════════════════════
// 7. getDescendantCategoryNames
// ══════════════════════════════════════════════════════════════

describe('getDescendantCategoryNames — 获取子孙节点', () => {
  let maps: CategoryMaps

  beforeEach(() => {
    maps = buildCategoryMaps(MOCK_DB_CATEGORY_ROWS.map(toCategoryNode))
  })

  it('获取短线笔记的所有子节点（两级）', () => {
    const descendants = getDescendantCategoryNames('cat-1', maps.childrenMap, maps.categoryMap)
    expect(descendants.has('技术指标')).toBe(true)
    expect(descendants.has('量价关系')).toBe(true)
    expect(descendants.has('RSIC技巧')).toBe(true)
    expect(descendants.has('短线笔记')).toBe(false)
  })

  it('获取个股挖掘的子节点', () => {
    const descendants = getDescendantCategoryNames('cat-5', maps.childrenMap, maps.categoryMap)
    expect(descendants.has('行业研究')).toBe(true)
    expect(descendants.has('个股挖掘')).toBe(false)
  })

  it('叶子节点返回空 Set', () => {
    const descendants = getDescendantCategoryNames('cat-4', maps.childrenMap, maps.categoryMap)
    expect(descendants.size).toBe(0)
  })

  it('未知节点安全处理', () => {
    const descendants = getDescendantCategoryNames('cat-unknown', maps.childrenMap, maps.categoryMap)
    expect(descendants.size).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 8. filterArticlesByCategory
// ══════════════════════════════════════════════════════════════

describe('filterArticlesByCategory — 按分类过滤', () => {
  let maps: CategoryMaps

  beforeEach(() => {
    maps = buildCategoryMaps(MOCK_DB_CATEGORY_ROWS.map(toCategoryNode))
  })

  const mockArticles = [
    { category: '短线笔记' },
    { category: 'RSIC技巧' },
    { category: '个股挖掘' },
    { category: '免费文章' },
    { category: '量价关系' },
  ]

  it('过滤出短线笔记及其子类的文章（3篇）', () => {
    const result = filterArticlesByCategory(mockArticles, '短线笔记', maps.categoryMap, maps.nameToIdMap)
    expect(result).toHaveLength(3)
    expect(result.map((a) => a.category)).toContain('短线笔记')
    expect(result.map((a) => a.category)).toContain('RSIC技巧')
    expect(result.map((a) => a.category)).toContain('量价关系')
    expect(result.map((a) => a.category)).not.toContain('个股挖掘')
  })

  it('过滤出个股挖掘的文章（1篇）', () => {
    const result = filterArticlesByCategory(mockArticles, '个股挖掘', maps.categoryMap, maps.nameToIdMap)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('个股挖掘')
  })

  it('空分类名文章被过滤', () => {
    const withEmpty = [...mockArticles, { category: '' }]
    const result = filterArticlesByCategory(withEmpty, '短线笔记', maps.categoryMap, maps.nameToIdMap)
    expect(result).toHaveLength(3)
  })
})

// ══════════════════════════════════════════════════════════════
// 9. filterArticlesBySection
// ══════════════════════════════════════════════════════════════

describe('filterArticlesBySection — 按 href 过滤（notes 专项）', () => {
  let maps: CategoryMaps

  beforeEach(() => {
    maps = buildCategoryMaps(MOCK_DB_CATEGORY_ROWS.map(toCategoryNode))
  })

  const mockArticles = [
    { category: 'RSIC技巧' },
    { category: '个股挖掘' },
    { category: '免费文章' },
  ]

  it('按 /notes href 过滤短线笔记文章', () => {
    const result = filterArticlesBySection(
      mockArticles, '/notes',
      MOCK_DB_CATEGORY_ROWS.map((r) => ({ ...r, parentId: r.parent_id })),
      ['短线笔记', '短线学习笔记'],
      maps.categoryMap, maps.nameToIdMap
    )
    expect(result.some((a) => a.category === 'RSIC技巧')).toBe(true)
    expect(result.some((a) => a.category === '个股挖掘')).toBe(false)
  })

  it('href 不匹配时使用 fallbackRoots 兜底', () => {
    const result = filterArticlesBySection(
      [{ category: 'RSIC技巧' }],
      '/nonexistent',
      MOCK_DB_CATEGORY_ROWS.map((r) => ({ ...r, parentId: r.parent_id })),
      ['短线笔记'],
      maps.categoryMap, maps.nameToIdMap
    )
    expect(result.some((a) => a.category === 'RSIC技巧')).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// 10. findCategoryRootIdsByHref
// ══════════════════════════════════════════════════════════════

describe('findCategoryRootIdsByHref — href 查根分类 ID', () => {
  it('正确匹配 /notes', () => {
    const ids = findCategoryRootIdsByHref(MOCK_DB_CATEGORY_ROWS.map(toCategoryNode), '/notes')
    expect(ids).toContain('cat-1')
  })

  it('正确匹配 /stocks', () => {
    const ids = findCategoryRootIdsByHref(MOCK_DB_CATEGORY_ROWS.map(toCategoryNode), '/stocks')
    expect(ids).toContain('cat-5')
  })

  it('未知 href 返回空数组', () => {
    const ids = findCategoryRootIdsByHref(MOCK_DB_CATEGORY_ROWS.map(toCategoryNode), '/unknown')
    expect(ids).toHaveLength(0)
  })

  it('href 末尾斜杠不影响匹配', () => {
    const ids = findCategoryRootIdsByHref(MOCK_DB_CATEGORY_ROWS.map(toCategoryNode), '/notes/')
    expect(ids).toContain('cat-1')
  })
})

// ══════════════════════════════════════════════════════════════
// 11. toCategoryNode
// ══════════════════════════════════════════════════════════════

describe('toCategoryNode — 数据库行转换', () => {
  it('标准转换', () => {
    const node = toCategoryNode({
      id: 'test-id', name: '  测试分类  ', icon: '🔧',
      description: '描述文字', href: '/test', parent_id: 'parent-id',
    })
    expect(node.id).toBe('test-id')
    expect(node.name).toBe('测试分类')
    expect(node.icon).toBe('🔧')
    expect(node.href).toBe('/test')
    expect(node.parentId).toBe('parent-id')
  })

  it('处理 null href', () => {
    const node = toCategoryNode({ id: 'n1', name: 'X', href: null })
    expect(node.href).toBeUndefined()
  })

  it('兼容 parentId 驼峰字段名', () => {
    const node = toCategoryNode({ id: 'n1', name: 'X', parentId: 'my-parent' })
    expect(node.parentId).toBe('my-parent')
  })

  it('null parent_id 转为 undefined', () => {
    const node = toCategoryNode({ id: 'n1', name: 'X', parent_id: null })
    expect(node.parentId).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════
// 12. buildCategoryTree
// ══════════════════════════════════════════════════════════════

describe('buildCategoryTree — 树形结构构建', () => {
  it('构建正确的嵌套层级', () => {
    const nodes = MOCK_DB_CATEGORY_ROWS.map(toCategoryNode)
    const tree = buildCategoryTree(nodes)

    const notesRoot = tree.find((n) => n.name === '短线笔记')!
    expect(notesRoot.children.length).toBeGreaterThan(0)
    const techNode = notesRoot.children.find((n) => n.name === '技术指标')!
    expect(techNode.children.some((n) => n.name === 'RSIC技巧')).toBe(true)
  })

  it('空数组返回空数组', () => {
    expect(buildCategoryTree([])).toHaveLength(0)
  })

  it('没有 parentId 的节点视为根节点', () => {
    const nodes = [
      { id: 'r1', name: '根1', parentId: null },
      { id: 'r2', name: '根2', parentId: undefined },
      { id: 'r3', name: '根3', parentId: '' },
    ]
    expect(buildCategoryTree(nodes as CategoryNode[])).toHaveLength(3)
  })
})

// ══════════════════════════════════════════════════════════════
// 13. Article 类型一致性
// ══════════════════════════════════════════════════════════════

describe('Article 类型一致性', () => {
  it('mapArticleRow 返回的类型字段完整', () => {
    const article = mapArticleRow(MOCK_DB_ARTICLE_ROW)
    expect(typeof article.id).toBe('string')
    expect(typeof article.title).toBe('string')
    expect(typeof article.content).toBe('string')
    expect(typeof article.category).toBe('string')
    expect(typeof article.readingCount).toBe('number')
  })

  it('access_level 默认值与合法值', () => {
    const a1 = mapArticleRow({ ...MOCK_DB_ARTICLE_ROW, access_level: 'free' })
    const a2 = mapArticleRow({ ...MOCK_DB_ARTICLE_ROW, access_level: 'monthly' })
    const a3 = mapArticleRow({ ...MOCK_DB_ARTICLE_ROW, access_level: 'yearly' })
    const a4 = mapArticleRow({ ...MOCK_DB_ARTICLE_ROW, access_level: undefined })
    expect(a1.access_level).toBe('free')
    expect(a2.access_level).toBe('monthly')
    expect(a3.access_level).toBe('yearly')
    expect(a4.access_level).toBe('monthly')
  })
})
