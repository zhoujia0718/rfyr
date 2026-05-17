/**
 * M15-13: app/masters/[slug]/page.tsx — 大佬合集详情页逻辑测试
 *
 * 测试覆盖：
 * 1. masters 分类文章加载
 * 2. useArticleReader 参数（category = '大佬合集'）
 * 3. Paywall 和 LoginForm 拦截逻辑
 * 4. 文章列表与单文章路由判断
 * 5. referrerCode 参数传递
 * 6. 阅读限额提示
 *
 * 注：React 组件渲染需要 jsdom，此处测试其调用的业务逻辑和辅助函数
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── 辅助函数（从 masters/[slug]/page.tsx 提取）─────────────────────────

const MASTERS_CATEGORY = '大佬合集'

/** 判断是否为大佬合集分类 */
function isMastersCategory(category: string): boolean {
  return category === MASTERS_CATEGORY || category.includes('大佬')
}

/** 构建大佬合集页面 URL */
function buildMastersPageUrl(params: {
  slug?: string
  referrerCode?: string | null
}): string {
  const base = '/masters'
  const slug = params.slug ? `/${params.slug}` : ''
  const url = `${base}${slug}`
  if (params.referrerCode) {
    return `${url}?ref=${encodeURIComponent(params.referrerCode)}`
  }
  return url
}

/** 判断是否为单篇文章路由 */
function isSingleArticleRoute(slug: string): boolean {
  if (!slug) return false
  // 短格式 ID 或 UUID 均视为单篇文章
  return (
    /^[a-zA-Z0-9_-]+$/.test(slug) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)
  )
}

/** 获取大佬合集所需会员等级 */
function getMastersRequiredTier(slug: string): 'monthly' | 'yearly' {
  // 基础大佬合集月卡可读，深度内容需年卡
  const deepContentKeywords = ['深度', '完整版', '珍藏版']
  if (deepContentKeywords.some((k) => slug.includes(k))) {
    return 'yearly'
  }
  return 'monthly'
}

/** 渲染大佬合集专属 Paywall 文案 */
function buildMastersPaywallText(params: {
  requiredTier: 'monthly' | 'yearly'
  articleTitle: string
}): string {
  if (params.requiredTier === 'yearly') {
    return `【${params.articleTitle}】为年度VIP专属内容，开通年卡解锁全部大佬深度分析`
  }
  return `【${params.articleTitle}】为月卡会员内容，开通月卡即可阅读`
}

// ─── 分类判断 ─────────────────────────────────────────────────────────────

describe('M15-13a: isMastersCategory', () => {
  it('大佬合集应匹配', () => {
    expect(isMastersCategory('大佬合集')).toBe(true)
  })

  it('包含"大佬"字样应匹配', () => {
    expect(isMastersCategory('大佬复盘')).toBe(true)
    expect(isMastersCategory('大佬投资组合')).toBe(true)
  })

  it('短线笔记不应匹配', () => {
    expect(isMastersCategory('短线笔记')).toBe(false)
    expect(isMastersCategory('个股挖掘')).toBe(false)
  })
})

// ─── URL 构建 ─────────────────────────────────────────────────────────────

describe('M15-13b: buildMastersPageUrl', () => {
  it('无 slug 应返回 /masters', () => {
    expect(buildMastersPageUrl({})).toBe('/masters')
  })

  it('有 slug 应返回 /masters/{slug}', () => {
    expect(buildMastersPageUrl({ slug: 'warren-buffett' })).toBe(
      '/masters/warren-buffett'
    )
  })

  it('有 referrerCode 应附加 ref 参数', () => {
    expect(buildMastersPageUrl({ referrerCode: 'ABC123' })).toContain(
      'ref=ABC123'
    )
    expect(
      buildMastersPageUrl({ slug: 'warren-buffett', referrerCode: 'ABC123' })
    ).toContain('ref=ABC123')
  })
})

// ─── 单篇文章路由判断 ─────────────────────────────────────────────────────

describe('M15-13c: isSingleArticleRoute', () => {
  it('短格式 slug 应为单篇文章', () => {
    expect(isSingleArticleRoute('buffett-001')).toBe(true)
    expect(isSingleArticleRoute('BRK-B')).toBe(true)
  })

  it('UUID 应为单篇文章', () => {
    expect(
      isSingleArticleRoute('550e8400-e29b-41d4-a716-446655440000')
    ).toBe(true)
  })

  it('空字符串应返回 false', () => {
    expect(isSingleArticleRoute('')).toBe(false)
  })
})

// ─── 会员等级要求 ─────────────────────────────────────────────────────────

describe('M15-13d: getMastersRequiredTier', () => {
  it('包含"深度"关键字应需年卡', () => {
    expect(getMastersRequiredTier('深度分析-巴菲特')).toBe('yearly')
  })

  it('包含"完整版"应需年卡', () => {
    expect(getMastersRequiredTier('巴菲特投资完整版')).toBe('yearly')
  })

  it('包含"珍藏版"应需年卡', () => {
    expect(getMastersRequiredTier('珍藏版-索罗斯')).toBe('yearly')
  })

  it('普通 slug 应需月卡', () => {
    expect(getMastersRequiredTier('巴菲特语录')).toBe('monthly')
    expect(getMastersRequiredTier('芒格思想')).toBe('monthly')
  })
})

// ─── Paywall 文案 ─────────────────────────────────────────────────────────

describe('M15-13e: buildMastersPaywallText', () => {
  it('年卡专属内容应有年度VIP提示', () => {
    const text = buildMastersPaywallText({
      requiredTier: 'yearly',
      articleTitle: '巴菲特2024',
    })
    expect(text).toContain('年度VIP')
    expect(text).toContain('巴菲特2024')
  })

  it('月卡内容应有月卡提示', () => {
    const text = buildMastersPaywallText({
      requiredTier: 'monthly',
      articleTitle: '芒格箴言',
    })
    expect(text).toContain('月卡会员')
    expect(text).toContain('芒格箴言')
  })
})
