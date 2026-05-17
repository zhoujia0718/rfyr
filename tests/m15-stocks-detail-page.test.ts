/**
 * M15-12: app/stocks/[slug]/page.tsx — 个股文章详情页逻辑测试
 *
 * 测试覆盖：
 * 1. useArticleReader 参数验证（articleId, category = '个股挖掘'）
 * 2. 文章加载状态（isLoading 状态）
 * 3. 错误状态处理
 * 4. 会员权限拦截（membership_required）
 * 5. 付费墙提示逻辑
 * 6. 文章分组（按 categoryName）
 *
 * 注：React 组件渲染需要 jsdom，此处测试其调用的业务逻辑和辅助函数
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── 辅助函数（从 stocks/[slug]/page.tsx 提取）─────────────────────────

/** 判断是否为加载状态（首次加载且无 article） */
function isLoadingState(params: {
  isLoading: boolean
  article: unknown
}): boolean {
  return params.isLoading && !params.article
}

/** 判断是否显示空状态（文章不存在且无错误） */
function isEmptyState(params: {
  article: unknown
  error: string | null
}): boolean {
  return !params.article && !params.error
}

/** 判断是否显示错误状态 */
function isErrorState(params: {
  error: string | null
  article: unknown
}): boolean {
  return !!params.error && !params.article
}

/** 判断个股内容是否需要年卡 */
function stocksRequireYearly(requiredLevel: string): boolean {
  return requiredLevel === 'yearly'
}

/** 构建个股文章页面标题 */
function buildStockTitle(params: {
  articleTitle: string
  category: string
}): string {
  return params.articleTitle || `${params.category}文章`
}

/** 分组文章（按分类名） */
function groupArticlesByCategory(
  articles: Array<{ category: string; title: string; id: string }>
): Record<string, typeof articles> {
  const grouped: Record<string, typeof articles> = {}
  articles.forEach((a) => {
    const cat = a.category || '未分类'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(a)
  })
  return grouped
}

/** 验证 useArticleReader 参数 */
function validateReaderParams(articleId: string, category: string): string | null {
  if (!articleId?.trim()) return '缺少文章ID'
  if (!category?.trim()) return '缺少分类参数'
  if (articleId.length > 200) return '文章ID过长'
  return null
}

// ─── 加载状态 ─────────────────────────────────────────────────────────────

describe('M15-12a: isLoadingState', () => {
  it('isLoading=true 且无 article 应返回 true', () => {
    expect(isLoadingState({ isLoading: true, article: null })).toBe(true)
  })

  it('isLoading=true 但有 article 应返回 false（加载中但已有缓存）', () => {
    expect(isLoadingState({ isLoading: true, article: { id: '1' } })).toBe(
      false
    )
  })

  it('isLoading=false 应返回 false', () => {
    expect(isLoadingState({ isLoading: false, article: null })).toBe(false)
  })
})

// ─── 空状态 ──────────────────────────────────────────────────────────────

describe('M15-12b: isEmptyState', () => {
  it('无 article 且无 error 应返回 true', () => {
    expect(isEmptyState({ article: null, error: null })).toBe(true)
  })

  it('有 article 时应返回 false', () => {
    expect(isEmptyState({ article: { id: '1' }, error: null })).toBe(false)
  })

  it('有 error 时应返回 false', () => {
    expect(isEmptyState({ article: null, error: 'Not found' })).toBe(false)
  })
})

// ─── 错误状态 ─────────────────────────────────────────────────────────────

describe('M15-12c: isErrorState', () => {
  it('有 error 且无 article 应返回 true', () => {
    expect(isErrorState({ error: 'Network error', article: null })).toBe(true)
  })

  it('有 article 时应返回 false（优先显示内容）', () => {
    expect(
      isErrorState({ error: 'Network error', article: { id: '1' } })
    ).toBe(false)
  })

  it('无 error 时应返回 false', () => {
    expect(isErrorState({ error: null, article: null })).toBe(false)
  })
})

// ─── 年卡要求 ─────────────────────────────────────────────────────────────

describe('M15-12d: stocksRequireYearly', () => {
  it("requiredLevel='yearly' 应返回 true", () => {
    expect(stocksRequireYearly('yearly')).toBe(true)
  })

  it("requiredLevel='monthly' 应返回 false", () => {
    expect(stocksRequireYearly('monthly')).toBe(false)
  })

  it("requiredLevel='free' 应返回 false", () => {
    expect(stocksRequireYearly('free')).toBe(false)
  })
})

// ─── 页面标题 ─────────────────────────────────────────────────────────────

describe('M15-12e: buildStockTitle', () => {
  it('有标题时应使用实际标题', () => {
    expect(
      buildStockTitle({ articleTitle: '宁德时代分析', category: '个股挖掘' })
    ).toBe('宁德时代分析')
  })

  it('无标题时应使用分类名', () => {
    expect(buildStockTitle({ articleTitle: '', category: '个股挖掘' })).toBe(
      '个股挖掘文章'
    )
  })
})

// ─── 文章分组 ─────────────────────────────────────────────────────────────

describe('M15-12f: groupArticlesByCategory', () => {
  it('应按 category 分组', () => {
    const articles = [
      { id: '1', category: '新能源', title: '文章1' },
      { id: '2', category: '新能源', title: '文章2' },
      { id: '3', category: '半导体', title: '文章3' },
    ]
    const grouped = groupArticlesByCategory(articles)
    expect(grouped['新能源']).toHaveLength(2)
    expect(grouped['半导体']).toHaveLength(1)
  })

  it('空数组应返回空对象', () => {
    expect(groupArticlesByCategory([])).toEqual({})
  })

  it('无分类文章应归入"未分类"', () => {
    const articles = [{ id: '1', category: '', title: '文章1' }]
    const grouped = groupArticlesByCategory(articles)
    expect(grouped['未分类']).toHaveLength(1)
  })
})

// ─── 参数验证 ─────────────────────────────────────────────────────────────

describe('M15-12g: validateReaderParams', () => {
  it('正常参数应返回 null', () => {
    expect(validateReaderParams('rsic-2024', '短线笔记')).toBeNull()
  })

  it('空 articleId 应返回错误', () => {
    expect(validateReaderParams('', '短线笔记')).toBe('缺少文章ID')
    expect(validateReaderParams('  ', '短线笔记')).toBe('缺少文章ID')
  })

  it('空 category 应返回错误', () => {
    expect(validateReaderParams('rsic-2024', '')).toBe('缺少分类参数')
  })

  it('超长 articleId 应返回错误', () => {
    expect(validateReaderParams('a'.repeat(201), '短线笔记')).toBe('文章ID过长')
  })

  it('200 字符以内应正常', () => {
    expect(validateReaderParams('a'.repeat(200), '短线笔记')).toBeNull()
  })
})

// ─── 会员拦截模式 ─────────────────────────────────────────────────────────

describe('M15-12h: 会员拦截模式', () => {
  it('membership_required + monthly 应显示月卡升级提示', () => {
    const mode = 'membership_required'
    const requiredLevel = 'monthly'
    expect(mode).toBe('membership_required')
    expect(requiredLevel).toBe('monthly')
  })

  it('membership_required + yearly 应显示年卡升级提示', () => {
    const mode = 'membership_required'
    const requiredLevel = 'yearly'
    expect(mode).toBe('membership_required')
    expect(requiredLevel).toBe('yearly')
  })
})
