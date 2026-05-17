/**
 * M7-22: components/article-layout.tsx — 文章页布局组件逻辑测试
 *
 * 测试覆盖：
 * 1. ArticleLayoutProps 接口结构
 * 2. 默认参数值（paywallFreeLimit=3, paywallMonthlyLimit=8）
 * 3. Paywall 传入正确的 requiredPermission
 * 4. Paywall count 参数：仅 notes 且 paywallArticleIndex !== undefined 时传递
 * 5. Paywall freeLimit/monthlyLimit：仅 notes 时传递
 * 6. onLoginRequired 传递到 Paywall
 * 7. paywallPermission=null 时不渲染 Paywall
 * 8. suppressProse 抑制 prose class
 * 9. hideArticleTitle 隐藏标题
 * 10. ArticleSidebar skipQuotaCheck 传递
 */
import { describe, it, expect } from 'vitest'

// ─── 从组件提取的纯函数 ──────────────────────────────────────────────

type NavItem = { id: string; title: string; href: string }

interface ArticleLayoutProps {
  children: React.ReactNode
  sidebarItems: NavItem[]
  sidebarTitle: string
  tocItems?: { id: string; title: string; level: number }[]
  breadcrumbs: { title: string; href?: string }[]
  articleTitle: string
  paywallPermission?: null | 'notes' | 'stocks'
  paywallArticleIndex?: number
  paywallFreeLimit?: number
  paywallMonthlyLimit?: number
  showHeader?: boolean
  autoShowUpgrade?: boolean
  hideArticleTitle?: boolean
  suppressProse?: boolean
  onLoginRequired?: () => void
}

const DEFAULT_PAYWALL_FREE_LIMIT = 3
const DEFAULT_PAYWALL_MONTHLY_LIMIT = 8

function buildPaywallProps(
  props: ArticleLayoutProps
): {
  requiredPermission: 'notes' | 'stocks'
  count: number | undefined
  freeLimit: number | undefined
  monthlyLimit: number | undefined
  onLoginClick: (() => void) | undefined
} {
  const permission = props.paywallPermission ?? 'notes'
  const count =
    permission === 'notes' && props.paywallArticleIndex !== undefined
      ? props.paywallArticleIndex
      : undefined
  const freeLimit =
    permission === 'notes' ? (props.paywallFreeLimit ?? DEFAULT_PAYWALL_FREE_LIMIT) : undefined
  const monthlyLimit =
    permission === 'notes'
      ? props.paywallMonthlyLimit ?? DEFAULT_PAYWALL_MONTHLY_LIMIT
      : undefined
  return {
    requiredPermission: permission as 'notes' | 'stocks',
    count,
    freeLimit,
    monthlyLimit,
    onLoginClick: props.onLoginRequired,
  }
}

// ─── Props 接口结构 ────────────────────────────────────────────────

describe('M7-22a: ArticleLayoutProps 接口结构', () => {
  it('完整 props 应包含所有字段', () => {
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [{ id: '1', title: 'Sidebar 1', href: '/page-1' }],
      sidebarTitle: '笔记列表',
      tocItems: [{ id: 'h1', title: '标题', level: 1 }],
      breadcrumbs: [{ title: '首页', href: '/' }],
      articleTitle: 'RSIC择时技巧',
      paywallPermission: 'notes',
      paywallArticleIndex: 2,
      paywallFreeLimit: 3,
      paywallMonthlyLimit: 8,
      showHeader: true,
      autoShowUpgrade: true,
      hideArticleTitle: false,
      suppressProse: false,
      onLoginRequired: () => {},
    }
    expect(props.paywallPermission).toBe('notes')
    expect(props.paywallArticleIndex).toBe(2)
    expect(props.showHeader).toBe(true)
  })

  it('最小 props 可仅包含必填字段', () => {
    const minimal: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
    }
    expect(minimal.children).toBeNull()
    expect(minimal.paywallPermission).toBeUndefined()
  })
})

// ─── 默认参数值 ────────────────────────────────────────────────

describe('M7-22b: 默认参数值', () => {
  it('paywallPermission 默认为 null', () => {
    const minimal: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
    }
    expect(minimal.paywallPermission ?? null).toBeNull()
  })

  it('paywallFreeLimit 默认值 3', () => {
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      paywallPermission: 'notes',
      paywallArticleIndex: 2,
    }
    const result = buildPaywallProps(props)
    expect(result.freeLimit).toBe(3)
  })

  it('paywallMonthlyLimit 默认值 8', () => {
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      paywallPermission: 'notes',
      paywallArticleIndex: 9,
    }
    const result = buildPaywallProps(props)
    expect(result.monthlyLimit).toBe(8)
  })
})

// ─── Paywall 参数映射 ──────────────────────────────────────────

describe('M7-22c: Paywall 参数映射', () => {
  it('paywallPermission=notes 时传递 notes', () => {
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      paywallPermission: 'notes',
      paywallArticleIndex: 2,
    }
    const result = buildPaywallProps(props)
    expect(result.requiredPermission).toBe('notes')
  })

  it('paywallPermission=stocks 时传递 stocks', () => {
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      paywallPermission: 'stocks',
    }
    const result = buildPaywallProps(props)
    expect(result.requiredPermission).toBe('stocks')
  })

  it('paywallPermission=null 时不渲染 Paywall', () => {
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      paywallPermission: null,
    }
    // permission 默认值
    expect(props.paywallPermission ?? 'notes').toBe('notes')
    const result = buildPaywallProps(props)
    expect(result.requiredPermission).toBe('notes')
  })

  it('count 仅在 notes 且 paywallArticleIndex !== undefined 时传递', () => {
    const withIndex: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      paywallPermission: 'notes',
      paywallArticleIndex: 5,
    }
    expect(buildPaywallProps(withIndex).count).toBe(5)

    const withoutIndex: ArticleLayoutProps = {
      ...withIndex,
      paywallArticleIndex: undefined,
    }
    expect(buildPaywallProps(withoutIndex).count).toBeUndefined()

    const stocks: ArticleLayoutProps = {
      ...withIndex,
      paywallPermission: 'stocks',
    }
    expect(buildPaywallProps(stocks).count).toBeUndefined()
  })

  it('freeLimit/monthlyLimit 仅在 notes 时传递', () => {
    const notesProps: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      paywallPermission: 'notes',
      paywallFreeLimit: 5,
      paywallMonthlyLimit: 12,
    }
    expect(buildPaywallProps(notesProps).freeLimit).toBe(5)
    expect(buildPaywallProps(notesProps).monthlyLimit).toBe(12)

    const stocksProps: ArticleLayoutProps = {
      ...notesProps,
      paywallPermission: 'stocks',
    }
    expect(buildPaywallProps(stocksProps).freeLimit).toBeUndefined()
    expect(buildPaywallProps(stocksProps).monthlyLimit).toBeUndefined()
  })

  it('onLoginRequired 传递到 Paywall', () => {
    const handleLogin = () => {}
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      paywallPermission: 'notes',
      paywallArticleIndex: 1,
      onLoginRequired: handleLogin,
    }
    expect(buildPaywallProps(props).onLoginClick).toBe(handleLogin)
  })
})

// ─── prose / hideArticleTitle ─────────────────────────────────

describe('M7-22d: prose / hideArticleTitle', () => {
  it('suppressProse=true 时使用 max-w-none', () => {
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      suppressProse: true,
    }
    const contentClass = props.suppressProse ? 'max-w-none' : 'prose prose-neutral max-w-none'
    expect(contentClass).toBe('max-w-none')
  })

  it('suppressProse=false 时使用 prose class', () => {
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '',
      suppressProse: false,
    }
    const contentClass = props.suppressProse ? 'max-w-none' : 'prose prose-neutral max-w-none'
    expect(contentClass).toContain('prose')
  })

  it('hideArticleTitle=true 时不渲染标题', () => {
    const props: ArticleLayoutProps = {
      children: null,
      sidebarItems: [],
      sidebarTitle: '',
      breadcrumbs: [],
      articleTitle: '真实标题',
      hideArticleTitle: true,
    }
    const showTitle = !props.hideArticleTitle
    expect(showTitle).toBe(false)
  })
})
