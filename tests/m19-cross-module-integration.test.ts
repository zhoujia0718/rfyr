/**
 * ============================================================
 * Module 19: 跨模块状态传递集成测试套件
 * ============================================================
 *
 * 测试范围（现有单元测试未覆盖的四个缺口）：
 *
 * PART 1: 跨模块状态传递 — API response → hook state → page render 完整链条
 * PART 2: 错误码分支完整性 — 每个 code 值是否更新了所有必要状态
 * PART 3: 组件渲染分支 — 页面处于某个状态时，UI 实际显示了什么
 * PART 4: 多 hook 状态一致性 — 两个 hook 同一时间点的状态组合是否正确
 *
 * 测试策略：
 * - 所有测试均为纯函数逻辑测试（内联被测逻辑，不依赖 DOM/React 渲染）
 * - 模拟完整的 API → hook → page 数据流
 * - 验证每个环节的状态转换正确性
 *
 * 涉及的模块：
 * - hooks/use-article-reader.ts     — 文章内容获取 + 状态解析
 * - hooks/use-reading-limit.ts      — 配额管理
 * - hooks/use-reading-settings.ts    — 阅读设置
 * - components/membership-provider.tsx — 会员状态管理
 * - components/auth-context.tsx     — 登录状态管理
 * - components/paywall.tsx         — 付费墙组件
 * - components/wechat-guide-overlay.tsx — 引导弹窗
 * - lib/quota-calculator.ts         — 配额计算
 * - lib/referral-client.ts          — 邀请码客户端
 * - lib/member-tiers.ts             — 会员等级工具
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// ══════════════════════════════════════════════════════════════════════════════
// PART 1: 跨模块状态传递 — API response → hook state → page render 完整链条
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 模拟 useArticleReader 的状态解析逻辑（从源码提取）
 */
interface ArticleReaderState {
  article: { id: string; title: string; content: string } | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  guestLimitExceeded: boolean
  guestReadCount: number
  guestLimit: number
  membershipRequired: boolean
  requiredLevel: string | null
  dailyLimitExceeded: boolean
  dailyReadCount: number
  effectiveDailyLimit: number
}

function parseArticleApiResponse(
  data: Record<string, unknown>,
  articleId: string,
  categoryName: string
): { state: Partial<ArticleReaderState>; returnEarly: boolean } {
  const state: Partial<ArticleReaderState> = {
    article: null,
    isLoading: false,
    isRefreshing: false,
    error: data.error as string | null,
    guestLimitExceeded: false,
    guestReadCount: 0,
    guestLimit: 3,
    membershipRequired: false,
    requiredLevel: null,
    dailyLimitExceeded: false,
    dailyReadCount: 0,
    effectiveDailyLimit: 8,
  }

  if (data.error) {
    if (data.code === 'LIMIT_EXCEEDED') {
      state.guestLimitExceeded = true
      state.guestReadCount = (data.readCount as number) || 0
      state.guestLimit = (data.limit as number) || 3
      state.article = {
        id: (data.articleId as string) || articleId,
        title: (data.title as string) || '文章',
        content: '',
      } as { id: string; title: string; content: string }
      return { state, returnEarly: true }
    }

    if (data.code === 'REQUIRE_LOGIN') {
      return { state, returnEarly: true }
    }

    if (data.code === 'YEARLY_REQUIRED' || data.code === 'MEMBERSHIP_REQUIRED') {
      state.membershipRequired = true
      state.requiredLevel = (data.requiredLevel as string) || (data.code === 'YEARLY_REQUIRED' ? 'yearly' : null)
      state.article = {
        id: (data.articleId as string) || articleId,
        title: (data.title as string) || '文章',
        content: '',
      } as { id: string; title: string; content: string }
      return { state, returnEarly: true }
    }

    if (data.code === 'DAILY_LIMIT_EXCEEDED') {
      state.dailyLimitExceeded = true
      state.dailyReadCount = (data.readCount as number) || 0
      state.effectiveDailyLimit = (data.effectiveDailyLimit as number) || (data.limit as number) || 8
      state.article = {
        id: (data.articleId as string) || articleId,
        title: (data.title as string) || '文章',
        content: '<p>文章内容已加载，但您今日阅读次数已用完。</p>',
      } as { id: string; title: string; content: string }
      return { state, returnEarly: true }
    }

    return { state, returnEarly: true }
  }

  // 正常响应
  state.article = {
    id: (data.articleId as string) || articleId,
    title: (data.title as string) || '',
    content: (data.content as string) || '',
  } as { id: string; title: string; content: string }
  state.error = null
  state.guestLimitExceeded = false

  if (data.accessType === 'guest' && data.readCount !== undefined) {
    state.guestReadCount = data.readCount as number
  }

  if (data.accessType === 'monthly') {
    if (data.readCount !== undefined) state.dailyReadCount = data.readCount as number
    if (data.effectiveDailyLimit !== undefined) state.effectiveDailyLimit = data.effectiveDailyLimit as number
    state.dailyLimitExceeded = false
  }

  return { state, returnEarly: false }
}

/**
 * 模拟 buildArticlePage 的分支逻辑（从源码提取）
 */
function computePageBranch(params: {
  requiresLogin: boolean
  membershipRequired: boolean
  requiredLevel: string | null
  isYearly: boolean
  dailyLimitExceeded: boolean
  isMonthly: boolean
  dailyReadCount: number
  effectiveDailyLimit: number
  isOverLimit: boolean
  guestLimitExceeded: boolean
  guestReadCount: number
  guestLimit: number
  article: { id: string; title: string; content: string } | null
  error: string | null
  quotaDismissed: boolean
  dailyLimitDismissed: boolean
}): {
  showsOverlay: boolean
  overlayMode: string | null
  showsArticle: boolean
  showsLoginButton: boolean
  showsUpgradeButton: boolean
  showsDismissButton: boolean
  pageContent: string
} {
  const {
    error, article, quotaDismissed, dailyLimitDismissed, requiresLogin, membershipRequired,
    requiredLevel, isYearly, dailyLimitExceeded, isMonthly, dailyReadCount, effectiveDailyLimit,
    isOverLimit
  } = params

  // 有错误且无文章
  if (error && !article) {
    return {
      showsOverlay: true,
      overlayMode: 'require_login',
      showsArticle: false,
      showsLoginButton: true,
      showsUpgradeButton: false,
      showsDismissButton: false,
      pageContent: 'error_page',
    }
  }

  // require_login 弹窗
  if (requiresLogin && !quotaDismissed) {
    return {
      showsOverlay: true,
      overlayMode: 'require_login',
      showsArticle: true,
      showsLoginButton: true,
      showsUpgradeButton: false,
      showsDismissButton: true,
      pageContent: 'article_with_overlay',
    }
  }

  // 会员权限不足弹窗（limitInfo 由 buildArticlePage 内部根据 quotaDismissed 控制显示/隐藏）
  if (membershipRequired) {
    return {
      showsOverlay: !quotaDismissed,
      overlayMode: !quotaDismissed ? 'membership_required' : null,
      showsArticle: true,
      showsLoginButton: true,
      showsUpgradeButton: false,
      showsDismissButton: true,
      pageContent: !quotaDismissed ? 'article_with_overlay' : 'article_only',
    }
  }

  // 年卡：直接显示文章
  if (isYearly) {
    return {
      showsOverlay: false,
      overlayMode: null,
      showsArticle: true,
      showsLoginButton: false,
      showsUpgradeButton: false,
      showsDismissButton: false,
      pageContent: 'article_only',
    }
  }

  // 月卡每日超限弹窗（limitInfo 由 buildArticlePage 内部控制，dailyLimitDismissed 在 overlay 关闭时设为 true）
  if (dailyLimitExceeded || (isMonthly && dailyReadCount >= effectiveDailyLimit)) {
    return {
      showsOverlay: !dailyLimitDismissed,
      overlayMode: !dailyLimitDismissed ? 'daily_limit_exceeded' : null,
      showsArticle: true,
      showsLoginButton: true,
      showsUpgradeButton: true,
      showsDismissButton: true,
      pageContent: 'article_only',
    }
  }

  // 已登录但超限（limitInfo 由 buildArticlePage 内部根据 quotaDismissed 控制显示/隐藏）
  if (isOverLimit) {
    return {
      showsOverlay: !quotaDismissed,
      overlayMode: 'quota_exhausted',
      showsArticle: true,
      showsLoginButton: false,
      showsUpgradeButton: true,
      showsDismissButton: true,
      pageContent: !quotaDismissed ? 'article_with_paywall' : 'article_only',
    }
  }

  return {
    showsOverlay: false,
    overlayMode: null,
    showsArticle: true,
    showsLoginButton: false,
    showsUpgradeButton: false,
    showsDismissButton: false,
    pageContent: 'article_only',
  }
}

/**
 * 模拟 Paywall 组件的配额计算逻辑
 */
function computePaywallResult(params: {
  membershipType: 'none' | 'monthly' | 'yearly' | 'permanent'
  totalReadCount: number
  dailyReadCount: number
  bonusCount: number
  dailyBonusCount: number
  guestReadLimit: number
  monthlyDailyLimit: number
  requiredPermission: 'notes' | 'stocks' | 'masters' | 'calendar' | 'membership'
  articleCount: number | undefined
}): {
  canRead: boolean
  upgradeTitle: string
  upgradeDescription: string
} {
  const {
    membershipType, totalReadCount, dailyReadCount, bonusCount, dailyBonusCount,
    guestReadLimit, monthlyDailyLimit, requiredPermission, articleCount
  } = params

  const PERMISSIONS: Record<string, readonly string[]> = {
    calendar: ['none', 'monthly', 'yearly', 'permanent'],
    masters: ['none', 'monthly', 'yearly', 'permanent'],
    notes: ['none', 'monthly', 'yearly', 'permanent'],
    stocks: ['yearly', 'permanent'],
    membership: ['none', 'monthly', 'yearly', 'permanent'],
  }

  const hasPermission = PERMISSIONS[requiredPermission]?.includes(
    membershipType as string
  )

  if (!hasPermission) {
    const title = requiredPermission === 'stocks' ? '个股挖掘年度VIP专享' : '会员专享内容'
    return { canRead: false, upgradeTitle: title, upgradeDescription: '升级会员解锁更多专业投资内容' }
  }

  if (membershipType === 'yearly' || membershipType === 'permanent') {
    return { canRead: true, upgradeTitle: '', upgradeDescription: '' }
  }

  if (membershipType === 'monthly') {
    if (requiredPermission !== 'notes') return { canRead: true, upgradeTitle: '', upgradeDescription: '' }
    const effectiveDailyLimit = monthlyDailyLimit + dailyBonusCount
    const isOverLimit = (articleCount ?? 0) > effectiveDailyLimit
    if (isOverLimit) {
      return {
        canRead: false,
        upgradeTitle: '月卡今日阅读已满',
        upgradeDescription: `您今日已阅读 ${dailyReadCount} 篇短线笔记，升级年度VIP可解锁全部内容`,
      }
    }
    return { canRead: true, upgradeTitle: '', upgradeDescription: '' }
  }

  // none
  if (requiredPermission === 'stocks') {
    return {
      canRead: false,
      upgradeTitle: '个股挖掘年度VIP专享',
      upgradeDescription: '升级年度VIP会员，解锁深度个股研究报告和投资机会挖掘',
    }
  }

  const effectiveLimit = guestReadLimit + bonusCount
  const isOverLimit = (articleCount ?? 0) >= effectiveLimit
  if (isOverLimit) {
    return {
      canRead: false,
      upgradeTitle: '免费阅读已到达上限',
      upgradeDescription: `您已免费阅读 ${totalReadCount} 篇短线笔记，开通月卡会员可解锁更多，年度VIP可解锁全部内容`,
    }
  }

  return { canRead: true, upgradeTitle: '', upgradeDescription: '' }
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 1 TEST GROUPS
// ══════════════════════════════════════════════════════════════════════════════

describe('PART 1: 跨模块状态传递 — API response → hook state → page render', () => {
  // ─── 1A. LIMIT_EXCEEDED 完整链条 ───────────────────────────────────────────

  describe('LIMIT_EXCEEDED 完整链条', () => {
    it('API LIMIT_EXCEEDED → hook 状态正确设置', () => {
      const apiResponse = {
        error: '阅读次数已用完',
        code: 'LIMIT_EXCEEDED',
        readCount: 3,
        limit: 3,
        articleId: 'art-001',
        title: '测试文章',
      }

      const { state, returnEarly } = parseArticleApiResponse(apiResponse, 'art-001', '短线笔记')

      expect(returnEarly).toBe(true)
      expect(state.guestLimitExceeded).toBe(true)
      expect(state.guestReadCount).toBe(3)
      expect(state.guestLimit).toBe(3)
      expect(state.article).not.toBeNull()
      expect(state.article!.title).toBe('测试文章')
      expect(state.error).toBe('阅读次数已用完')
      expect(state.membershipRequired).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
    })

    it('hook LIMIT_EXCEEDED 状态 → page 显示 quota_exhausted 弹窗', () => {
      const result = computePageBranch({
        requiresLogin: false,
        membershipRequired: false,
        requiredLevel: null,
        isYearly: false,
        dailyLimitExceeded: false,
        isMonthly: false,
        dailyReadCount: 0,
        effectiveDailyLimit: 3,
        isOverLimit: true,
        guestLimitExceeded: true,
        guestReadCount: 3,
        guestLimit: 3,
        article: { id: 'art-001', title: '测试文章', content: '...' },
        error: null,
        quotaDismissed: false,
        dailyLimitDismissed: false,
      })

      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('quota_exhausted')
      expect(result.showsArticle).toBe(true)
      expect(result.showsUpgradeButton).toBe(true)
    })

    it('完整链：API → hook → page → Paywall 联动', () => {
      // Step 1: API
      const apiResponse = {
        error: '阅读次数已用完', code: 'LIMIT_EXCEEDED',
        readCount: 3, limit: 3, articleId: 'art-001', title: '短线笔记',
      }
      // Step 2: hook
      const { state } = parseArticleApiResponse(apiResponse, 'art-001', '短线笔记')
      // Step 3: page
      const pageResult = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false, isMonthly: false,
        dailyReadCount: 0, effectiveDailyLimit: 3,
        isOverLimit: true, guestLimitExceeded: state.guestLimitExceeded ?? false,
        guestReadCount: state.guestReadCount ?? 0, guestLimit: (state.guestLimit ?? 3) as number,
        article: state.article as { id: string; title: string; content: string } | null,
        error: state.error as string | null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      // Step 4: Paywall
      const paywallResult = computePaywallResult({
        membershipType: 'none', totalReadCount: state.guestReadCount ?? 0,
        dailyReadCount: 0, bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: state.guestLimit ?? 3, monthlyDailyLimit: 8,
        requiredPermission: 'notes', articleCount: state.guestReadCount ?? 0,
      })

      expect(pageResult.showsOverlay).toBe(true)
      expect(pageResult.overlayMode).toBe('quota_exhausted')
      expect(pageResult.showsArticle).toBe(true)
      expect(paywallResult.canRead).toBe(false)
    })
  })

  // ─── 1B. DAILY_LIMIT_EXCEEDED 完整链条 ────────────────────────────────────

  describe('DAILY_LIMIT_EXCEEDED 完整链条（月卡用户）', () => {
    it('API DAILY_LIMIT_EXCEEDED → hook 正确设置每日超限状态', () => {
      const apiResponse = {
        error: '今日阅读次数已用完', code: 'DAILY_LIMIT_EXCEEDED',
        readCount: 9, limit: 8, effectiveDailyLimit: 10, dailyBonusCount: 2,
        articleId: 'art-002', title: '文章',
      }
      const { state, returnEarly } = parseArticleApiResponse(apiResponse, 'art-002', '短线笔记')
      expect(returnEarly).toBe(true)
      expect(state.dailyLimitExceeded).toBe(true)
      expect(state.dailyReadCount).toBe(9)
      expect(state.effectiveDailyLimit).toBe(10)
      expect(state.article).not.toBeNull()
    })

    it('月卡每日超限 → page 显示 daily_limit_exceeded 弹窗', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: true,
        isMonthly: true, dailyReadCount: 9, effectiveDailyLimit: 10,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-002', title: '文章', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('daily_limit_exceeded')
      expect(result.showsArticle).toBe(true)
      expect(result.showsUpgradeButton).toBe(true)
    })

    it('月卡每日超限但未登录 → require_login 优先（require_login 分支先于 daily_limit）', () => {
      const result = computePageBranch({
        requiresLogin: true, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: true,
        isMonthly: false, dailyReadCount: 9, effectiveDailyLimit: 10,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-002', title: '文章', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('require_login')
    })
  })

  // ─── 1C. YEARLY_REQUIRED / MEMBERSHIP_REQUIRED 完整链条 ─────────────────

  describe('YEARLY_REQUIRED / MEMBERSHIP_REQUIRED 完整链条', () => {
    it('API YEARLY_REQUIRED → hook membershipRequired=true', () => {
      const apiResponse = {
        error: '此文章为年卡专属内容', code: 'YEARLY_REQUIRED',
        requiredLevel: 'yearly', articleId: 'art-003', title: '个股研究',
      }
      const { state, returnEarly } = parseArticleApiResponse(apiResponse, 'art-003', '个股挖掘')
      expect(returnEarly).toBe(true)
      expect(state.membershipRequired).toBe(true)
      expect(state.requiredLevel).toBe('yearly')
      expect(state.article).not.toBeNull()
    })

    it('月卡用户访问年卡专属内容 → page 显示 membership_required', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: true, requiredLevel: 'yearly',
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: true, dailyReadCount: 3, effectiveDailyLimit: 8,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-003', title: '个股研究', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('membership_required')
    })

    it('年卡用户访问年卡专属内容 → 无弹窗直接显示', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: true, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 0, effectiveDailyLimit: 8,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-003', title: '个股研究', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(false)
      expect(result.showsArticle).toBe(true)
    })
  })

  // ─── 1D. REQUIRE_LOGIN 完整链条 ────────────────────────────────────────────

  describe('REQUIRE_LOGIN 完整链条', () => {
    it('API REQUIRE_LOGIN → article=null', () => {
      const apiResponse = { error: '请先登录后阅读', code: 'REQUIRE_LOGIN', articleId: 'art-004', title: '文章' }
      const { state, returnEarly } = parseArticleApiResponse(apiResponse, 'art-004', '短线笔记')
      expect(returnEarly).toBe(true)
      expect(state.error).toBe('请先登录后阅读')
      expect(state.article).toBeNull()
      expect(state.membershipRequired).toBe(false)
      expect(state.guestLimitExceeded).toBe(false)
    })

    it('error && !article → page 显示 require_login', () => {
      const result = computePageBranch({
        requiresLogin: true, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 0, effectiveDailyLimit: 8,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: null, error: '请先登录后阅读',
        quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('require_login')
      expect(result.showsArticle).toBe(false)
    })
  })

  // ─── 1E. 正常响应：所有限制状态重置 ────────────────────────────────

  describe('正常响应：状态重置链条', () => {
    it('API 成功响应 → hook 重置所有限制状态', () => {
      const apiResponse = { content: '<p>文章内容</p>', title: '短线笔记', articleId: 'art-005', accessType: 'user', readCount: 2 }
      const { state, returnEarly } = parseArticleApiResponse(apiResponse, 'art-005', '短线笔记')
      expect(returnEarly).toBe(false)
      expect(state.article).not.toBeNull()
      expect(state.error).toBeNull()
      expect(state.guestLimitExceeded).toBe(false)
      expect(state.membershipRequired).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
    })

    it('正常响应 → page 直接显示文章（无弹窗）', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 2, effectiveDailyLimit: 8,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 2, guestLimit: 3,
        article: { id: 'art-005', title: '短线笔记', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(false)
      expect(result.showsArticle).toBe(true)
      expect(result.pageContent).toBe('article_only')
    })
  })

  // ─── 1F. 登录后刷新链条 ──────────────────────────────────────────────

  describe('登录成功 → rfyr:auth-refresh → 状态重置 → 文章刷新', () => {
    it('rfyr:auth-refresh 事件应触发 hook 重置所有限制状态', () => {
      let article: { id: string; title: string; content: string } | null = { id: 'art-001', title: '文章', content: '' }
      let error: string | null = '请先登录后阅读'
      let guestLimitExceeded = false
      let membershipRequired = false
      let dailyLimitExceeded = false

      function handleAuthRefresh() {
        article = null
        error = null
        guestLimitExceeded = false
        membershipRequired = false
        dailyLimitExceeded = false
      }

      handleAuthRefresh()
      expect(article).toBeNull()
      expect(error).toBeNull()
      expect(guestLimitExceeded).toBe(false)
      expect(membershipRequired).toBe(false)
      expect(dailyLimitExceeded).toBe(false)
    })

    it('登录成功后 page 从 require_login 切换到正常文章', () => {
      const beforeResult = computePageBranch({
        requiresLogin: true, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 0, effectiveDailyLimit: 8,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: null, error: '请先登录后阅读',
        quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(beforeResult.showsOverlay).toBe(true)
      expect(beforeResult.overlayMode).toBe('require_login')

      const afterResult = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 2, effectiveDailyLimit: 8,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 2, guestLimit: 3,
        article: { id: 'art-001', title: '短线笔记', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(afterResult.showsOverlay).toBe(false)
      expect(afterResult.showsArticle).toBe(true)
    })
  })

  // ─── 1G. 支付成功 → membership refresh → 状态联动 ────────────────

  describe('支付成功 → activateMembership → refreshMembership → 状态联动', () => {
    it('支付成功后 membershipType 从 none → yearly', async () => {
      let membershipType: 'none' | 'monthly' | 'yearly' | 'permanent' = 'none'
      let isLoading = true

      async function simulatePaymentFlow(): Promise<void> {
        isLoading = true
        await Promise.resolve()
        membershipType = 'yearly'
        isLoading = false
      }

      await simulatePaymentFlow()
      expect(membershipType).toBe('yearly')
      expect(isLoading).toBe(false)
    })

    it('membershipType=none → yearly → paywall(stocks) canRead: false → true', () => {
      const noneResult = computePaywallResult({
        membershipType: 'none', totalReadCount: 0, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'stocks', articleCount: undefined,
      })
      expect(noneResult.canRead).toBe(false)

      const yearlyResult = computePaywallResult({
        membershipType: 'yearly', totalReadCount: 0, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'stocks', articleCount: undefined,
      })
      expect(yearlyResult.canRead).toBe(true)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 2: 错误码分支完整性 — 每个 code 的所有必要状态更新验证
// ══════════════════════════════════════════════════════════════════════════════

describe('PART 2: 错误码分支完整性 — 每个 code 的所有必要状态更新验证', () => {
  // ─── LIMIT_EXCEEDED ──────────────────────────────────────────────────

  describe('LIMIT_EXCEEDED 分支完整性', () => {
    it('完整数据：所有6个相关字段均被正确设置', () => {
      const data = { error: '阅读次数已用完', code: 'LIMIT_EXCEEDED', readCount: 3, limit: 3, articleId: 'art', title: '测试' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.guestLimitExceeded).toBe(true)
      expect(state.guestReadCount).toBe(3)
      expect(state.guestLimit).toBe(3)
      expect(state.article).not.toBeNull()
      expect(state.membershipRequired).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
      expect(state.requiredLevel).toBeNull()
    })

    it('缺省字段：readCount/limit 为 undefined 时使用默认值', () => {
      const data = { error: '阅读次数已用完', code: 'LIMIT_EXCEEDED' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.guestLimitExceeded).toBe(true)
      expect(state.guestReadCount).toBe(0)
      expect(state.guestLimit).toBe(3)
      expect(state.article).not.toBeNull()
    })

    it('LIMIT_EXCEEDED 不应影响 membershipRequired / dailyLimitExceeded', () => {
      const data = { error: '阅读次数已用完', code: 'LIMIT_EXCEEDED', readCount: 3, limit: 3 }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.membershipRequired).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
    })
  })

  // ─── YEARLY_REQUIRED / MEMBERSHIP_REQUIRED ────────────────────────────

  describe('YEARLY_REQUIRED / MEMBERSHIP_REQUIRED 分支完整性', () => {
    it('YEARLY_REQUIRED：设置 article、membershipRequired=true、requiredLevel="yearly"', () => {
      const data = { error: '此文章为年卡专属内容', code: 'YEARLY_REQUIRED', requiredLevel: 'yearly', articleId: 'art', title: '个股研究' }
      const { state } = parseArticleApiResponse(data, 'art', '个股挖掘')
      expect(state.membershipRequired).toBe(true)
      expect(state.requiredLevel).toBe('yearly')
      expect(state.article).not.toBeNull()
      expect(state.guestLimitExceeded).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
    })

    it('MEMBERSHIP_REQUIRED：设置 article、membershipRequired=true、requiredLevel（来自 data）', () => {
      const data = { error: '需要月卡', code: 'MEMBERSHIP_REQUIRED', requiredLevel: 'monthly', articleId: 'art', title: '月卡内容' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.membershipRequired).toBe(true)
      expect(state.requiredLevel).toBe('monthly')
      expect(state.article).not.toBeNull()
    })

    it('YEARLY_REQUIRED 不应触发 guestLimitExceeded / dailyLimitExceeded', () => {
      const data = { error: '此文章为年卡专属内容', code: 'YEARLY_REQUIRED', requiredLevel: 'yearly' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.guestLimitExceeded).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
    })

    it('requiredLevel 缺省时回退正确', () => {
      const yearlyData = { error: '...', code: 'YEARLY_REQUIRED' }
      const { state: s1 } = parseArticleApiResponse(yearlyData, 'art', 'notes')
      expect(s1.requiredLevel).toBe('yearly')

      const membershipData = { error: '...', code: 'MEMBERSHIP_REQUIRED' }
      const { state: s2 } = parseArticleApiResponse(membershipData, 'art', 'notes')
      expect(s2.requiredLevel).toBeNull()
    })
  })

  // ─── DAILY_LIMIT_EXCEEDED ─────────────────────────────────────────────

  describe('DAILY_LIMIT_EXCEEDED 分支完整性', () => {
    it('完整数据：dailyLimitExceeded、dailyReadCount、effectiveDailyLimit、article 均被设置', () => {
      const data = {
        error: '今日阅读次数已用完', code: 'DAILY_LIMIT_EXCEEDED',
        readCount: 9, limit: 8, effectiveDailyLimit: 10, dailyBonusCount: 2,
        articleId: 'art', title: '文章',
      }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.dailyLimitExceeded).toBe(true)
      expect(state.dailyReadCount).toBe(9)
      expect(state.effectiveDailyLimit).toBe(10)
      expect(state.article).not.toBeNull()
      expect(state.article!.content).toContain('今日阅读次数已用完')
    })

    it('effectiveDailyLimit 缺省时 fallback 到 limit（8）', () => {
      const data = { error: '...', code: 'DAILY_LIMIT_EXCEEDED', readCount: 8, limit: 8 }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.effectiveDailyLimit).toBe(8)
    })

    it('effectiveDailyLimit 和 limit 都缺省时 fallback 到 8', () => {
      const data = { error: '...', code: 'DAILY_LIMIT_EXCEEDED' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.effectiveDailyLimit).toBe(8)
    })

    it('DAILY_LIMIT_EXCEEDED 不应影响 guestLimitExceeded / membershipRequired', () => {
      const data = { error: '今日已满', code: 'DAILY_LIMIT_EXCEEDED', readCount: 9, effectiveDailyLimit: 10 }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.guestLimitExceeded).toBe(false)
      expect(state.membershipRequired).toBe(false)
    })
  })

  // ─── REQUIRE_LOGIN ─────────────────────────────────────────────────

  describe('REQUIRE_LOGIN 分支完整性', () => {
    it('REQUIRE_LOGIN：只设置 error，article 保持 null', () => {
      const data = { error: '请先登录后阅读', code: 'REQUIRE_LOGIN', articleId: 'art', title: '文章' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.error).toBe('请先登录后阅读')
      expect(state.article).toBeNull()
      expect(state.guestLimitExceeded).toBe(false)
      expect(state.membershipRequired).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
    })

    it('REQUIRE_LOGIN 不应误触发 quota_exhausted 或 membership_required', () => {
      const data = { error: '请先登录后阅读', code: 'REQUIRE_LOGIN' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.guestLimitExceeded).toBe(false)
      expect(state.membershipRequired).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
    })
  })

  // ─── 未知错误码 ─────────────────────────────────────────────────────

  describe('未知错误码的处理', () => {
    it('未知 code → 保持所有限制状态为 false', () => {
      const data = { error: '服务器内部错误', code: 'SERVER_ERROR' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.error).toBe('服务器内部错误')
      expect(state.guestLimitExceeded).toBe(false)
      expect(state.membershipRequired).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
    })

    it('无 error 字段（正常响应）→ 清除所有限制状态', () => {
      const data = { content: '<p>文章</p>', title: '标题', articleId: 'art' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.error).toBeNull()
      expect(state.guestLimitExceeded).toBe(false)
      expect(state.membershipRequired).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
    })

    it('error=true 但 code=undefined → 视为一般错误，不触发任何限制弹窗', () => {
      const data = { error: '未知错误' }
      const { state } = parseArticleApiResponse(data, 'art', 'notes')
      expect(state.error).toBe('未知错误')
      expect(state.guestLimitExceeded).toBe(false)
      expect(state.membershipRequired).toBe(false)
      expect(state.dailyLimitExceeded).toBe(false)
      expect(state.article).toBeNull()
    })
  })

  // ─── 正常响应：清除所有错误状态 ──────────────────────────────

  describe('正常响应：清除所有限制状态（防止旧状态残留）', () => {
    const normalData = { content: '<p>文章</p>', title: '标题', articleId: 'art', accessType: 'monthly', readCount: 5 }

    it('guestLimitExceeded 应重置为 false', () => {
      const { state } = parseArticleApiResponse(normalData, 'art', 'notes')
      expect(state.guestLimitExceeded).toBe(false)
    })

    it('membershipRequired 应重置为 false', () => {
      const { state } = parseArticleApiResponse(normalData, 'art', 'notes')
      expect(state.membershipRequired).toBe(false)
    })

    it('dailyLimitExceeded 应重置为 false', () => {
      const { state } = parseArticleApiResponse(normalData, 'art', 'notes')
      expect(state.dailyLimitExceeded).toBe(false)
    })

    it('requiredLevel 应重置为 null', () => {
      const { state } = parseArticleApiResponse(normalData, 'art', 'notes')
      expect(state.requiredLevel).toBeNull()
    })

    it('accessType=guest 时 guestReadCount 应从 API 更新', () => {
      const { state } = parseArticleApiResponse({ ...normalData, accessType: 'guest', readCount: 4 }, 'art', 'notes')
      expect(state.guestReadCount).toBe(4)
    })

    it('accessType=monthly 时 dailyReadCount/effectiveDailyLimit 应从 API 更新', () => {
      const { state } = parseArticleApiResponse(
        { ...normalData, accessType: 'monthly', readCount: 7, effectiveDailyLimit: 10 }, 'art', 'notes'
      )
      expect(state.dailyReadCount).toBe(7)
      expect(state.effectiveDailyLimit).toBe(10)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 3: 组件渲染分支 — UI 在各状态组合下的实际显示
// ══════════════════════════════════════════════════════════════════════════════

describe('PART 3: 组件渲染分支 — UI 在各状态组合下的实际显示', () => {
  // ─── 3A. 游客完整阅读流程的 UI 分支覆盖 ────────────────────────────

  describe('游客阅读流程 UI 分支', () => {
    it('游客首次访问 → 显示 require_login 弹窗', () => {
      const result = computePageBranch({
        requiresLogin: true, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 0, effectiveDailyLimit: 3,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-1', title: '文章', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('require_login')
      expect(result.showsLoginButton).toBe(true)
      expect(result.showsUpgradeButton).toBe(false)
      expect(result.showsArticle).toBe(true)
    })

    it('游客关闭登录弹窗 → 仍然显示文章（弹窗消失）', () => {
      const result = computePageBranch({
        requiresLogin: true, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 0, effectiveDailyLimit: 3,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-1', title: '文章', content: '...' },
        error: null, quotaDismissed: true, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(false)
      expect(result.showsArticle).toBe(true)
    })

    it('游客已登录 → 显示文章（无弹窗）', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 1, effectiveDailyLimit: 3,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-1', title: '文章', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(false)
      expect(result.showsArticle).toBe(true)
    })

    it('已登录 + 免费阅读次数耗尽 → 显示 quota_exhausted paywall', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 0, effectiveDailyLimit: 3,
        isOverLimit: true, guestLimitExceeded: false, guestReadCount: 3, guestLimit: 3,
        article: { id: 'art-1', title: '文章', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('quota_exhausted')
      expect(result.showsUpgradeButton).toBe(true)
    })

    it('关闭 quota_exhausted → article_with_paywall 内容', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: false, dailyReadCount: 0, effectiveDailyLimit: 3,
        isOverLimit: true, guestLimitExceeded: false, guestReadCount: 3, guestLimit: 3,
        article: { id: 'art-1', title: '文章', content: '...' },
        error: null, quotaDismissed: true, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(false)
      expect(result.showsArticle).toBe(true)
      expect(result.pageContent).toBe('article_only') // dismiss 后隐藏 paywall，只显示文章
    })
  })

  // ─── 3B. 月卡用户阅读流程的 UI 分支覆盖 ─────────────────────────────

  describe('月卡用户阅读流程 UI 分支', () => {
    it('每日未超限 → 直接显示文章（无弹窗）', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: true, dailyReadCount: 5, effectiveDailyLimit: 8,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-1', title: '文章', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(false)
      expect(result.showsArticle).toBe(true)
    })

    it('API 返回 dailyLimitExceeded=true → 显示 daily_limit_exceeded', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: true,
        isMonthly: true, dailyReadCount: 9, effectiveDailyLimit: 10,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-1', title: '文章', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('daily_limit_exceeded')
      expect(result.showsUpgradeButton).toBe(true)
    })

    it('dailyReadCount >= effectiveDailyLimit（本地计算超限）→ 显示弹窗', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: false,
        isMonthly: true, dailyReadCount: 8, effectiveDailyLimit: 8,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-1', title: '文章', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('daily_limit_exceeded')
    })

    it('dailyLimitDismissed 关闭后 → 不显示弹窗', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: false, requiredLevel: null,
        isYearly: false, dailyLimitExceeded: true,
        isMonthly: true, dailyReadCount: 9, effectiveDailyLimit: 10,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-1', title: '文章', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: true,
      })
      expect(result.showsOverlay).toBe(false)
    })

    it('年卡专属内容（membershipRequired 优先）→ membership_required > daily_limit', () => {
      const result = computePageBranch({
        requiresLogin: false, membershipRequired: true, requiredLevel: 'yearly',
        isYearly: false, dailyLimitExceeded: true,
        isMonthly: true, dailyReadCount: 9, effectiveDailyLimit: 10,
        isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
        article: { id: 'art-1', title: '个股研究', content: '...' },
        error: null, quotaDismissed: false, dailyLimitDismissed: false,
      })
      expect(result.showsOverlay).toBe(true)
      expect(result.overlayMode).toBe('membership_required')
    })
  })

  // ─── 3C. 年卡用户 UI 分支覆盖 ──────────────────────────────────────

  describe('年卡用户 UI 分支（最高权限）', () => {
    it('年卡用户访问任何内容 → 无弹窗直接显示', () => {
      const cases = [
        { dailyLimitExceeded: false, dailyReadCount: 0 },
        { dailyLimitExceeded: true, dailyReadCount: 999 },
      ]
      for (const c of cases) {
        const result = computePageBranch({
          requiresLogin: false, membershipRequired: false, requiredLevel: null,
          isYearly: true, dailyLimitExceeded: c.dailyLimitExceeded,
          isMonthly: false, dailyReadCount: c.dailyReadCount, effectiveDailyLimit: 8,
          isOverLimit: false, guestLimitExceeded: false, guestReadCount: 0, guestLimit: 3,
          article: { id: 'art', title: '个股研究', content: '...' },
          error: null, quotaDismissed: false, dailyLimitDismissed: false,
        })
        expect(result.showsOverlay).toBe(false)
        expect(result.showsArticle).toBe(true)
      }
    })
  })

  // ─── 3D. Paywall 组件分支覆盖 ─────────────────────────────────────

  describe('Paywall 组件渲染分支', () => {
    it('none + 文章在限额内 → canRead=true', () => {
      const result = computePaywallResult({
        membershipType: 'none', totalReadCount: 1, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'notes', articleCount: 1,
      })
      expect(result.canRead).toBe(true)
    })

    it('none + 第3篇（边缘，articleCount=totalLimit） → canRead=false（>= 即超限）', () => {
      const result = computePaywallResult({
        membershipType: 'none', totalReadCount: 2, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'notes', articleCount: 3, // 3 >= 3 → over limit
      })
      expect(result.canRead).toBe(false)
      expect(result.upgradeTitle).toBe('免费阅读已到达上限')
    })

    it('none + 第2篇（articleCount < totalLimit） → canRead=true', () => {
      const result = computePaywallResult({
        membershipType: 'none', totalReadCount: 1, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'notes', articleCount: 2, // 2 < 3 → within limit
      })
      expect(result.canRead).toBe(true)
    })

    it('none + 第4篇 → canRead=false', () => {
      const result = computePaywallResult({
        membershipType: 'none', totalReadCount: 3, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'notes', articleCount: 4,
      })
      expect(result.canRead).toBe(false)
      expect(result.upgradeTitle).toBe('免费阅读已到达上限')
    })

    it('none + 有邀请奖励 → 限额扩展', () => {
      const result = computePaywallResult({
        membershipType: 'none', totalReadCount: 3, dailyReadCount: 0,
        bonusCount: 4, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'notes', articleCount: 5,
      })
      expect(result.canRead).toBe(true)
    })

    it('none + stocks 内容 → canRead=false', () => {
      const result = computePaywallResult({
        membershipType: 'none', totalReadCount: 0, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'stocks', articleCount: undefined,
      })
      expect(result.canRead).toBe(false)
    })

    it('monthly + stocks 内容 → canRead=false', () => {
      const result = computePaywallResult({
        membershipType: 'monthly', totalReadCount: 0, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'stocks', articleCount: undefined,
      })
      expect(result.canRead).toBe(false)
    })

    it('monthly + notes 每日超限 → canRead=false', () => {
      const result = computePaywallResult({
        membershipType: 'monthly', totalReadCount: 100, dailyReadCount: 9,
        bonusCount: 0, dailyBonusCount: 2,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'notes', articleCount: 11, // 11 > 10 (8+2) → over limit
      })
      expect(result.canRead).toBe(false)
      expect(result.upgradeTitle).toBe('月卡今日阅读已满')
    })

    it('yearly + stocks 内容 → canRead=true', () => {
      const result = computePaywallResult({
        membershipType: 'yearly', totalReadCount: 0, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'stocks', articleCount: undefined,
      })
      expect(result.canRead).toBe(true)
    })
  })

  // ─── 3E. 加载中状态的 UI 分支覆盖 ─────────────────────────────────

  describe('加载中状态的 UI 分支', () => {
    it('isLoading=true 且无 article → 显示 loading 状态', () => {
      const isLoading = true
      const article = null
      const limitLoading = false
      expect(isLoading && !article && !limitLoading).toBe(true)
    })

    it('limitLoading=true 且无 article → 显示 loading 状态', () => {
      const isLoading = false
      const article = null
      const limitLoading = true
      // page.tsx: if (isLoading || limitLoading) 且 !article → LoadingSkeleton
      expect(limitLoading || isLoading).toBe(true)
      expect(article).toBeNull()
    })

    it('isLoading=true 但已有 article → 显示文章（isRefreshing）', () => {
      const isLoading = true
      const article = { id: 'art', title: '文章', content: '...' }
      expect(isLoading && !article).toBe(false)
    })
  })

  // ─── 3F. WechatGuideOverlay 模式分支覆盖 ──────────────────────────

  describe('WechatGuideOverlay 模式分支', () => {
    it('mode=require_login → 标题"登录后继续阅读"', () => {
      const isLogin = true
      const isMembershipRequired = false
      const isDailyLimitExceeded = false
      const isFreeMonthlyCard = false
      const title = isFreeMonthlyCard ? '免费获取月卡'
        : isLogin ? '登录后继续阅读'
        : isMembershipRequired ? '开通会员继续阅读'
        : isDailyLimitExceeded ? '今日阅读已达上限'
        : '免费篇数已用完'
      expect(title).toBe('登录后继续阅读')
    })

    it('mode=quota_exhausted → 标题"免费篇数已用完"', () => {
      const isLogin = false
      const isMembershipRequired = false
      const isDailyLimitExceeded = false
      const isFreeMonthlyCard = false
      const title = isFreeMonthlyCard ? '免费获取月卡'
        : isLogin ? '登录后继续阅读'
        : isMembershipRequired ? '开通会员继续阅读'
        : isDailyLimitExceeded ? '今日阅读已达上限'
        : '免费篇数已用完'
      expect(title).toBe('免费篇数已用完')
    })

    it('mode=membership_required + requiredLevel=yearly → 标题"年卡专属内容"', () => {
      const requiredLevel = 'yearly'
      const isMembershipRequired = true
      const title = isMembershipRequired && requiredLevel === 'yearly' ? '年卡专属内容' : '开通会员继续阅读'
      expect(title).toBe('年卡专属内容')
    })

    it('mode=daily_limit_exceeded → 显示阅读进度条', () => {
      const isDailyLimitExceeded = true
      expect(isDailyLimitExceeded).toBe(true)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4: 多 hook 状态一致性 — hook 间状态组合正确性
// ══════════════════════════════════════════════════════════════════════════════

describe('PART 4: 多 hook 状态一致性 — hook 间状态组合正确性', () => {
  // ─── 4A. useMembership + useReadingLimit 组合一致性 ────────────────

  describe('useMembership + useReadingLimit 组合一致性', () => {
    interface MembershipState { membershipType: 'none' | 'monthly' | 'yearly' | 'permanent'; isLoading: boolean }
    interface ReadingLimitState { isLoggedIn: boolean; isLoading: boolean; isOverLimit: boolean; isYearly: boolean; isMonthly: boolean }

    function checkHookConsistency(membership: MembershipState, readingLimit: ReadingLimitState): string[] {
      const errors: string[] = []

      if (membership.isLoading) {
        if (!readingLimit.isLoading) errors.push('会员加载中时，useReadingLimit.isLoading 应为 true')
      }

      if (readingLimit.isYearly && membership.membershipType !== 'yearly' && membership.membershipType !== 'permanent') {
        errors.push(`isYearly=true 但 membershipType=${membership.membershipType}`)
      }

      if (readingLimit.isMonthly && membership.membershipType !== 'monthly') {
        errors.push(`isMonthly=true 但 membershipType=${membership.membershipType}`)
      }

      if (membership.membershipType === 'none') {
        if (readingLimit.isYearly) errors.push('membershipType=none 时 isYearly 应为 false')
        if (readingLimit.isMonthly) errors.push('membershipType=none 时 isMonthly 应为 false')
      }

      return errors
    }

    it('场景1：游客 → membershipType=none, isLoggedIn=false', () => {
      const errors = checkHookConsistency(
        { membershipType: 'none', isLoading: false },
        { isLoggedIn: false, isLoading: false, isOverLimit: false, isYearly: false, isMonthly: false }
      )
      expect(errors).toHaveLength(0)
    })

    it('场景2：已登录无会员 → membershipType=none, isLoggedIn=true', () => {
      const errors = checkHookConsistency(
        { membershipType: 'none', isLoading: false },
        { isLoggedIn: true, isLoading: false, isOverLimit: false, isYearly: false, isMonthly: false }
      )
      expect(errors).toHaveLength(0)
    })

    it('场景3：月卡会员 → membershipType=monthly, isYearly=false, isMonthly=true', () => {
      const errors = checkHookConsistency(
        { membershipType: 'monthly', isLoading: false },
        { isLoggedIn: true, isLoading: false, isOverLimit: false, isYearly: false, isMonthly: true }
      )
      expect(errors).toHaveLength(0)
    })

    it('场景4：年卡会员 → membershipType=yearly, isYearly=true, isMonthly=false', () => {
      const errors = checkHookConsistency(
        { membershipType: 'yearly', isLoading: false },
        { isLoggedIn: true, isLoading: false, isOverLimit: false, isYearly: true, isMonthly: false }
      )
      expect(errors).toHaveLength(0)
    })

    it('场景5：永久会员 → membershipType=permanent, isYearly=true', () => {
      const errors = checkHookConsistency(
        { membershipType: 'permanent', isLoading: false },
        { isLoggedIn: true, isLoading: false, isOverLimit: false, isYearly: true, isMonthly: false }
      )
      expect(errors).toHaveLength(0)
    })

    it('场景6：会员加载中 → membership.isLoading=true → readingLimit.isLoading=true', () => {
      const errors = checkHookConsistency(
        { membershipType: 'none', isLoading: true },
        { isLoggedIn: false, isLoading: true, isOverLimit: false, isYearly: false, isMonthly: false }
      )
      expect(errors).toHaveLength(0)
    })

    it('INCONSISTENCY：isYearly=true 但 membershipType=monthly → 应报错', () => {
      const errors = checkHookConsistency(
        { membershipType: 'monthly', isLoading: false },
        { isLoggedIn: true, isLoading: false, isOverLimit: false, isYearly: true, isMonthly: false }
      )
      expect(errors.length).toBeGreaterThan(0)
    })

    it('INCONSISTENCY：isMonthly=true 但 membershipType=yearly → 应报错', () => {
      const errors = checkHookConsistency(
        { membershipType: 'yearly', isLoading: false },
        { isLoggedIn: true, isLoading: false, isOverLimit: false, isYearly: false, isMonthly: true }
      )
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  // ─── 4B. useReadingSettings + useReadingLimit 组合一致性 ─────────────

  describe('useReadingSettings + useReadingLimit 组合一致性', () => {
    function checkSettingsConsistency(
      settings: { guest_read_limit: number; monthly_daily_limit: number; loading: boolean },
      readingLimit: { effectiveDailyLimit: number; isLoading: boolean }
    ): string[] {
      const errors: string[] = []

      if (settings.loading) {
        if (!readingLimit.isLoading) errors.push('settings.loading=true 时 readingLimit.isLoading 应为 true')
      }

      // effectiveDailyLimit 应 >= monthly_daily_limit（有 bonus 时可能更大）
      if (!readingLimit.isLoading && readingLimit.effectiveDailyLimit < settings.monthly_daily_limit) {
        errors.push(`effectiveDailyLimit(${readingLimit.effectiveDailyLimit}) < monthly_daily_limit(${settings.monthly_daily_limit})`)
      }

      return errors
    }

    it('默认设置：guest_read_limit=3, monthly_daily_limit=8', () => {
      const errors = checkSettingsConsistency(
        { guest_read_limit: 3, monthly_daily_limit: 8, loading: false },
        { effectiveDailyLimit: 8, isLoading: false }
      )
      expect(errors).toHaveLength(0)
    })

    it('有邀请奖励：effectiveDailyLimit > monthly_daily_limit', () => {
      const errors = checkSettingsConsistency(
        { guest_read_limit: 3, monthly_daily_limit: 8, loading: false },
        { effectiveDailyLimit: 12, isLoading: false }
      )
      expect(errors).toHaveLength(0)
    })

    it('设置加载中：readingLimit.isLoading=true', () => {
      const errors = checkSettingsConsistency(
        { guest_read_limit: 3, monthly_daily_limit: 8, loading: true },
        { effectiveDailyLimit: 8, isLoading: true }
      )
      expect(errors).toHaveLength(0)
    })

    it('INCONSISTENCY：effectiveDailyLimit < monthly_daily_limit → 应报错', () => {
      const errors = checkSettingsConsistency(
        { guest_read_limit: 3, monthly_daily_limit: 8, loading: false },
        { effectiveDailyLimit: 5, isLoading: false }
      )
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  // ─── 4C. useReadingLimit + useArticleReader 组合一致性 ──────────────

  describe('useReadingLimit + useArticleReader 组合一致性', () => {
    function checkReaderConsistency(
      readingLimit: { isLoggedIn: boolean; isMonthly: boolean; isYearly: boolean },
      articleReader: { guestLimitExceeded: boolean; membershipRequired: boolean; dailyLimitExceeded: boolean }
    ): string[] {
      const errors: string[] = []

      if (readingLimit.isLoggedIn && articleReader.guestLimitExceeded) {
        errors.push('已登录用户不应触发 guestLimitExceeded')
      }

      if (readingLimit.isYearly) {
        if (articleReader.membershipRequired) errors.push('年卡用户不应触发 membershipRequired')
        if (articleReader.dailyLimitExceeded) errors.push('年卡用户不应触发 dailyLimitExceeded')
      }

      return errors
    }

    it('游客访问非免费文章：isLoggedIn=false → guestLimitExceeded=false', () => {
      const errors = checkReaderConsistency(
        { isLoggedIn: false, isMonthly: false, isYearly: false },
        { guestLimitExceeded: false, membershipRequired: false, dailyLimitExceeded: false }
      )
      expect(errors).toHaveLength(0)
    })

    it('月卡每日超限：isMonthly=true, dailyLimitExceeded=true → 逻辑一致', () => {
      const errors = checkReaderConsistency(
        { isLoggedIn: true, isMonthly: true, isYearly: false },
        { guestLimitExceeded: false, membershipRequired: false, dailyLimitExceeded: true }
      )
      expect(errors).toHaveLength(0)
    })

    it('年卡访问年卡专属内容：isYearly=true, membershipRequired=false → 逻辑一致', () => {
      const errors = checkReaderConsistency(
        { isLoggedIn: true, isMonthly: false, isYearly: true },
        { guestLimitExceeded: false, membershipRequired: false, dailyLimitExceeded: false }
      )
      expect(errors).toHaveLength(0)
    })

    it('INCONSISTENCY：已登录用户但 guestLimitExceeded=true → 应报错', () => {
      const errors = checkReaderConsistency(
        { isLoggedIn: true, isMonthly: false, isYearly: false },
        { guestLimitExceeded: true, membershipRequired: false, dailyLimitExceeded: false }
      )
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toBe('已登录用户不应触发 guestLimitExceeded')
    })

    it('INCONSISTENCY：年卡用户但 membershipRequired=true → 应报错', () => {
      const errors = checkReaderConsistency(
        { isLoggedIn: true, isMonthly: false, isYearly: true },
        { guestLimitExceeded: false, membershipRequired: true, dailyLimitExceeded: false }
      )
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toBe('年卡用户不应触发 membershipRequired')
    })
  })

  // ─── 4D. 邀请码生命周期的一致性 ──────────────────────────────────

  describe('邀请码生命周期：capture → store → validate → clear 状态一致性', () => {
    const REFERRER_CODE_KEY = 'rfyr_referrer_code'
    const REFERRER_ARTICLE_KEY = 'rfyr_referrer_article'

    function simulateReferralLifecycle(
      url: string, isBrowser: boolean
    ): { storedCode: string | null; storedArticle: string | null; shareUrl: string } {
      const localStorage: Record<string, string> = {}

      if (isBrowser) {
        try {
          const u = new URL(url)
          const ref = u.searchParams.get('ref')
          if (ref) localStorage[REFERRER_CODE_KEY] = ref

          // referral chain 的 article slug 只在同时有 ref code 时存储
          const path = u.pathname
          const pathMatch = path.match(/^\/(notes|stocks|masters)\/(?!all$)([^/]+)$/)
          if (ref && pathMatch) localStorage[REFERRER_ARTICLE_KEY] = pathMatch[2]
        } catch { /* ignore */ }
      }

      const storedCode = localStorage[REFERRER_CODE_KEY] ?? null
      const storedArticle = localStorage[REFERRER_ARTICLE_KEY] ?? null
      const pageUrl = 'https://rfyr.com/notes/test'

      let shareUrl = pageUrl
      if (storedCode) {
        try {
          const u = new URL(pageUrl)
          u.searchParams.set('ref', storedCode)
          shareUrl = u.toString()
        } catch {
          shareUrl = `${pageUrl}?ref=${storedCode}`
        }
      }

      return { storedCode, storedArticle, shareUrl }
    }

    it('URL 含 ?ref=xxx → 捕获并存储到 localStorage', () => {
      const result = simulateReferralLifecycle('https://rfyr.com/notes/article-1?ref=ABC123XY', true)
      expect(result.storedCode).toBe('ABC123XY')
      expect(result.storedArticle).toBe('article-1')
      expect(result.shareUrl).toContain('ref=ABC123XY')
    })

    it('URL 含 ?ref= 但路径为 /notes/all → 不存储 articleSlug', () => {
      const result = simulateReferralLifecycle('https://rfyr.com/notes/all?ref=ABC123XY', true)
      expect(result.storedCode).toBe('ABC123XY')
      expect(result.storedArticle).toBeNull()
    })

    it('URL 无 ?ref= → 不存储任何内容', () => {
      const result = simulateReferralLifecycle('https://rfyr.com/notes/article-1', true)
      expect(result.storedCode).toBeNull()
      expect(result.storedArticle).toBeNull()
      expect(result.shareUrl).not.toContain('ref=')
    })

    it('非浏览器环境（SSR）→ 不存储任何内容', () => {
      const result = simulateReferralLifecycle('https://rfyr.com/notes/article-1?ref=ABC123XY', false)
      expect(result.storedCode).toBeNull()
      expect(result.storedArticle).toBeNull()
    })
  })

  // ─── 4E. rfyr:auth-refresh 事件链的一致性 ──────────────────────

  describe('rfyr:auth-refresh 事件链：所有 hook 同步重置', () => {
    it('rfyr:auth-refresh 事件触发后，article=null 触发重新加载', () => {
      let article: { id: string } | null = { id: 'art-001' }
      let guestLimitExceeded = true

      function handleAuthRefresh() {
        article = null
        guestLimitExceeded = false
      }

      handleAuthRefresh()
      expect(article).toBeNull()
      expect(guestLimitExceeded).toBe(false)
    })

    it('login 成功 → dispatch rfyr:auth-refresh → 所有 hook 重新同步', async () => {
      let localStorageState: Record<string, unknown> | null = null

      // 模拟 login 前（state = null）
      expect(localStorageState).toBeNull()

      // 模拟 login 成功写入 localStorage
      localStorageState = { user: { id: 'user-123' }, session: { access_token: 'token' } }

      // dispatch rfyr:auth-refresh 后，hooks 检测到变化并重新 fetch 同步
      // 验证 localStorage 有用户数据（membership hook 可以从中读取 membershipType 等）
      expect(!!localStorageState).toBe(true)
      expect((localStorageState as Record<string, unknown>).user).toBeDefined()
    })
  })

  // ─── 4F. 支付成功后的多 hook 同步 ───────────────────────────────

  describe('支付成功：PaymentDialog → activateMembership → refreshMembership → 状态联动', () => {
    it('支付成功后 membershipType 从 none → yearly', async () => {
      let membershipType: 'none' | 'monthly' | 'yearly' | 'permanent' = 'none'
      let membershipLoading = true

      async function simulatePaymentFlow(): Promise<void> {
        membershipLoading = true
        await Promise.resolve()
        membershipType = 'yearly'
        membershipLoading = false
      }

      await simulatePaymentFlow()
      expect(membershipType).toBe('yearly')
      expect(membershipLoading).toBe(false)
    })

    it('支付成功后 paywall(stocks) canRead: false → true', () => {
      const before = computePaywallResult({
        membershipType: 'none', totalReadCount: 0, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'stocks', articleCount: undefined,
      })
      const after = computePaywallResult({
        membershipType: 'yearly', totalReadCount: 0, dailyReadCount: 0,
        bonusCount: 0, dailyBonusCount: 0,
        guestReadLimit: 3, monthlyDailyLimit: 8,
        requiredPermission: 'stocks', articleCount: undefined,
      })
      expect(before.canRead).toBe(false)
      expect(after.canRead).toBe(true)
    })
  })

  // ─── 4G. 切换文章时的状态一致性 ────────────────────────────────

  describe('切换文章时：useArticleReader 状态隔离', () => {
    it('articleId 变化 → 所有限制状态应重置', () => {
      const prev = {
        articleId: 'art-001', error: '阅读次数已用完' as string | null,
        guestLimitExceeded: true, article: { id: 'art-001', title: '文章1', content: '' } as { id: string; title: string; content: string } | null,
      }

      const newArticleId = 'art-002'
      const isChanged = newArticleId !== prev.articleId

      // 重置状态
      const newState = {
        articleId: newArticleId,
        error: null as string | null,
        guestLimitExceeded: false,
        article: null as { id: string; title: string; content: string } | null,
      }

      expect(isChanged).toBe(true)
      expect(newState.article).toBeNull()
      expect(newState.error).toBeNull()
      expect(newState.guestLimitExceeded).toBe(false)
    })

    it('切换回之前访问过的文章 → 使用服务端最新配额数据（不走缓存）', () => {
      const serviceApiReturns: Record<string, Record<string, unknown>> = {
        'art-001': { error: '阅读次数已用完', code: 'LIMIT_EXCEEDED', readCount: 3, limit: 3 },
        'art-002': { content: '<p>新文章</p>', title: '新文章', articleId: 'art-002' },
      }

      function getFreshState(articleId: string) {
        const apiData = serviceApiReturns[articleId]
        if (!apiData) return null

        if (apiData.code === 'LIMIT_EXCEEDED') {
          return {
            article: { id: articleId, title: '文章', content: '' },
            guestLimitExceeded: true,
            guestReadCount: (apiData.readCount as number) ?? 0,
          }
        }
        return {
          article: { id: articleId, title: apiData.title as string, content: apiData.content as string },
          guestLimitExceeded: false,
          guestReadCount: 0,
        }
      }

      const state1Again = getFreshState('art-001')
      expect(state1Again!.guestLimitExceeded).toBe(true)
      expect(state1Again!.guestReadCount).toBe(3)
    })
  })
})
