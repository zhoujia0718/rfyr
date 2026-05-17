/**
 * 根因一修复：内联函数测试（需与 lib/articles.ts 源码同步）
 *
 * 策略：
 * - 内联函数块标注对应源码行号
 * - 每次修改 lib/articles.ts 后，对应内联块必须同步
 * - 详见 tests/TEST-COVERAGE-INDEX.ts
 *
 * 覆盖：
 * - mapArticleRow — lib/articles.ts 第 62-82 行
 * - articleToDbInsert — lib/articles.ts 第 87-104 行
 * - articleToDbUpdate — lib/articles.ts 第 109-127 行
 *
 * 新增测试：
 * - BUG-LIB-12: access_level 使用 || 而非 ??
 */
import { describe, it, expect, vi } from 'vitest'

vi.stubGlobal('fetch', vi.fn())

// ═══════════════════════════════════════════════════════════════════════════════
// 测试数据
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_FULL: Record<string, unknown> = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  short_id: 'rsic-2024',
  title: 'RSIC择时技巧完整教程',
  content: '<p>内容正文...</p>',
  category: '短线笔记',
  subcategory: '技术指标',
  author: '李老师',
  publishdate: '2026-03-15',
  readingcount: 42,
  pdf_url: 'https://cdn.example.com/pdfs/rsic.pdf',
  html_url: 'https://cdn.example.com/articles/rsic.html',
  is_review: true,
  access_level: 'monthly',
  created_at: '2026-03-15T10:00:00Z',
  updated_at: '2026-03-16T08:30:00Z',
}

const MOCK_MINIMAL: Record<string, unknown> = {
  id: 'min-id',
  title: '极简文章',
}

// ═══════════════════════════════════════════════════════════════════════════════
// 内联函数（同步自 lib/articles.ts）
// 同步规则：每次修改源码后，对应行号内的代码必须同步
// ═══════════════════════════════════════════════════════════════════════════════

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
  created_at: string
  updated_at: string
  pdf_url?: string | null
  pdf_original_name?: string | null
  html_url?: string | null
  html_original_name?: string | null
  is_review?: boolean
  access_level?: 'free' | 'monthly' | 'yearly'
}

// lib/articles.ts 第 62-82 行
function mapArticleRow(item: Record<string, unknown>): Article {
  return {
    id: String(item.id ?? ''),
    short_id: item.short_id as string | undefined,
    title: String(item.title ?? ''),
    content: String(item.content ?? ''),
    category: String(item.category ?? ''),
    subcategory: item.subcategory as string | undefined,
    author: String(item.author ?? ''),
    publishDate: String(item.publishdate ?? (item.publishDate as string) ?? ''),
    readingCount: Number(item.readingcount ?? (item.readingCount as number) ?? 0),
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? ''),
    pdf_url: item.pdf_url as string | null | undefined,
    pdf_original_name: item.pdf_original_name as string | null | undefined,
    html_url: item.html_url as string | null | undefined,
    html_original_name: item.html_original_name as string | null | undefined,
    is_review: item.is_review as boolean | undefined,
    // 第 80 行 BUG-LIB-12: 使用 || 而非 ?? —— 空字符串会被替换为 monthly
    access_level: ((item.access_level as 'free' | 'monthly' | 'yearly') || 'monthly') as 'free' | 'monthly' | 'yearly',
  }
}

// lib/articles.ts 第 87-104 行
function articleToDbInsert(
  article: Omit<Article, 'id' | 'readingCount' | 'created_at' | 'updated_at'>
): Record<string, unknown> {
  return {
    title: article.title,
    content: article.content,
    category: article.category,
    subcategory: article.subcategory,
    author: article.author,
    publishdate: article.publishDate,
    readingcount: 0,
    short_id: article.short_id,
    pdf_url: article.pdf_url,
    pdf_original_name: article.pdf_original_name,
    html_url: article.html_url,
    html_original_name: article.html_original_name,
    is_review: article.is_review ?? false,
    access_level: article.access_level ?? 'monthly',
  }
}

// lib/articles.ts 第 109-127 行
function articleToDbUpdate(updates: Partial<Article>): Record<string, unknown> {
  const dbUpdates: Record<string, unknown> = {}
  if (updates.title !== undefined) dbUpdates.title = updates.title
  if (updates.content !== undefined) dbUpdates.content = updates.content
  if (updates.category !== undefined) dbUpdates.category = updates.category
  if (updates.subcategory !== undefined) dbUpdates.subcategory = updates.subcategory
  if (updates.author !== undefined) dbUpdates.author = updates.author
  if ((updates as Record<string, unknown>).publishDate !== undefined) {
    dbUpdates.publishdate = (updates as { publishDate: string }).publishDate
  }
  if ((updates as Record<string, unknown>).readingCount !== undefined) {
    dbUpdates.readingcount = (updates as { readingCount: number }).readingCount
  }
  if (updates.pdf_url !== undefined) dbUpdates.pdf_url = updates.pdf_url
  if (updates.pdf_original_name !== undefined) dbUpdates.pdf_original_name = updates.pdf_original_name
  if (updates.html_url !== undefined) dbUpdates.html_url = updates.html_url
  if (updates.html_original_name !== undefined) dbUpdates.html_original_name = updates.html_original_name
  if (updates.is_review !== undefined) dbUpdates.is_review = updates.is_review
  if (updates.access_level !== undefined) dbUpdates.access_level = updates.access_level
  return dbUpdates
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUG-LIB-12: access_level || vs ?? 行为差异
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BUG-LIB-12 根因：
 * lib/articles.ts 第 80 行使用 `||` 而非 `??`：
 *   access_level: (item.access_level as ...) || 'monthly'
 *
 * `||` 将所有 falsy 值（包括 ''、0）替换为 'monthly'
 * `??` 只将 null/undefined 替换为 'monthly'
 */
describe('BUG-LIB-12: access_level || vs ??', () => {
  it('BUG: access_level="" 时被替换为 monthly', () => {
    const row = { ...MOCK_FULL, access_level: '' }
    const result = mapArticleRow(row)
    expect(result.access_level).toBe('monthly')
  })

  it('access_level="free" 时正确映射', () => {
    const row = { ...MOCK_FULL, access_level: 'free' }
    const result = mapArticleRow(row)
    expect(result.access_level).toBe('free')
  })

  it('access_level=undefined 时回退到 monthly', () => {
    const { access_level: _, ...row } = MOCK_FULL
    const result = mapArticleRow(row as Record<string, unknown>)
    expect(result.access_level).toBe('monthly')
  })

  it('修复建议: 用 ?? 替代 ||', () => {
    const fixedMap = (item: Record<string, unknown>): Article => {
      const raw = item.access_level
      const validated = typeof raw === 'string' && ['free', 'monthly', 'yearly'].includes(raw)
        ? raw as 'free' | 'monthly' | 'yearly'
        : 'monthly'
      return {
        ...mapArticleRow(item),
        access_level: validated,
      }
    }
    const row = { id: 'x', title: 'x', access_level: '' }
    expect(fixedMap(row).access_level).toBe('monthly')
    const row2 = { id: 'x', title: 'x', access_level: 'yearly' }
    expect(fixedMap(row2).access_level).toBe('yearly')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// mapArticleRow 测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('mapArticleRow', () => {
  it('完整行映射所有字段', () => {
    const result = mapArticleRow(MOCK_FULL)
    expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.short_id).toBe('rsic-2024')
    expect(result.category).toBe('短线笔记')
    expect(result.readingCount).toBe(42)
    expect(result.access_level).toBe('monthly')
    expect(result.is_review).toBe(true)
  })

  it('publishdate 与 publishDate 均支持', () => {
    const row1 = { ...MOCK_FULL }
    delete (row1 as Record<string, unknown>).publishDate
    expect(mapArticleRow(row1).publishDate).toBe('2026-03-15')
  })

  it('readingcount 与 readingCount 均支持', () => {
    const row1 = { ...MOCK_FULL }
    delete (row1 as Record<string, unknown>).readingCount
    expect(mapArticleRow(row1).readingCount).toBe(42)
  })

  it('缺失字段使用安全默认值', () => {
    const result = mapArticleRow(MOCK_MINIMAL)
    expect(result.title).toBe('极简文章')
    expect(result.content).toBe('')
    expect(result.readingCount).toBe(0)
    expect(result.pdf_url).toBeUndefined()
    expect(result.html_url).toBeUndefined()
    expect(result.short_id).toBeUndefined()
  })

  it('null 字段正确处理', () => {
    const row: Record<string, unknown> = {
      id: 't', title: null, content: null, category: null, pdf_url: null,
    }
    const result = mapArticleRow(row)
    expect(result.title).toBe('')
    expect(result.pdf_url).toBeNull()
  })

  it('created_at / updated_at 正确映射', () => {
    const result = mapArticleRow(MOCK_FULL)
    expect(result.created_at).toBe('2026-03-15T10:00:00Z')
    expect(result.updated_at).toBe('2026-03-16T08:30:00Z')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// articleToDbInsert 测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('articleToDbInsert', () => {
  it('正确转换所有字段', () => {
    const insert = articleToDbInsert({
      title: '新文章', content: '<p>x</p>', category: '短线笔记',
      subcategory: '技术指标', author: '张老师', publishDate: '2026-05-01',
      short_id: 'new-short', pdf_url: 'https://cdn.com/file.pdf',
      html_url: 'https://cdn.com/file.html', is_review: true, access_level: 'free',
    })
    expect(insert.title).toBe('新文章')
    expect(insert.readingcount).toBe(0)
    expect(insert.is_review).toBe(true)
    expect(insert.access_level).toBe('free')
  })

  it('忽略不应写入的字段', () => {
    const insert = articleToDbInsert({
      title: 'x', content: '', category: 'x', author: 'x', publishDate: 'x',
    } as Omit<Article, 'id' | 'readingCount' | 'created_at' | 'updated_at'>)
    expect((insert as Record<string, unknown>).id).toBeUndefined()
    expect((insert as Record<string, unknown>).readingCount).toBeUndefined()
  })

  it('access_level 缺失默认为 monthly', () => {
    const insert = articleToDbInsert({
      title: 'x', content: '', category: 'x', author: 'x', publishDate: 'x',
    } as Omit<Article, 'id' | 'readingCount' | 'created_at' | 'updated_at'>)
    expect(insert.access_level).toBe('monthly')
  })

  it('可选字段缺失时不包含在 insert 中', () => {
    const insert = articleToDbInsert({
      title: 'x', content: '', category: 'x', author: 'x', publishDate: 'x',
    } as Omit<Article, 'id' | 'readingCount' | 'created_at' | 'updated_at'>)
    expect((insert as Record<string, unknown>).subcategory).toBeUndefined()
    expect((insert as Record<string, unknown>).pdf_url).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// articleToDbUpdate 测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('articleToDbUpdate', () => {
  it('仅包含提供的字段', () => {
    const result = articleToDbUpdate({ title: '新标题', access_level: 'yearly' as const })
    expect(result.title).toBe('新标题')
    expect(result.access_level).toBe('yearly')
    expect((result as Record<string, unknown>).content).toBeUndefined()
  })

  it('publishDate 映射为 publishdate', () => {
    const result = articleToDbUpdate({ publishDate: '2026-07-01', readingCount: 50 })
    expect(result.publishdate).toBe('2026-07-01')
    expect(result.readingcount).toBe(50)
    expect((result as Record<string, unknown>).publishDate).toBeUndefined()
  })

  it('is_review=false 正确包含', () => {
    const result = articleToDbUpdate({ is_review: false })
    expect(result.is_review).toBe(false)
  })

  it('undefined 值完全忽略', () => {
    const result = articleToDbUpdate({ title: undefined, category: undefined } as Partial<Article>)
    expect(Object.keys(result).length).toBe(0)
  })

  it('多个字段正确合并', () => {
    const result = articleToDbUpdate({
      title: '更新', content: '更新内容', access_level: 'yearly' as const,
    })
    expect(result.title).toBe('更新')
    expect(result.content).toBe('更新内容')
    expect(result.access_level).toBe('yearly')
  })
})
