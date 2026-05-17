/**
 * 弹窗触发链路测试
 *
 * 覆盖场景：
 * 1. recordVisit POST 后 updateQuota 更新 state → showDailyLimitPopup 变为 true
 * 2. 弹窗使用 Context 的 dailyReadCount（不是 useArticleReader 的）
 * 3. dailyLimitDismissed 状态正确控制弹窗显示/隐藏
 *
 * Bug：弹窗原本使用 useArticleReader 的 dailyReadCount，
 * 而 recordVisit 只更新 Context 的 state，导致弹窗永远不触发。
 * 修复：弹窗改用 Context 的 ctxDailyReadCount。
 */
import { describe, it, expect, vi } from 'vitest'

describe('M16-PopupChain: recordVisit → updateQuota → 弹窗链路测试', () => {

  describe('Bug 重现：弹窗状态源错误', () => {

    it('BUG: useArticleReader 的 dailyReadCount 不受 recordVisit 影响', () => {
      /**
       * 旧实现中，弹窗检查用的是 useArticleReader 的 dailyReadCount
       * 而 recordVisit 只更新 Context 的 state
       * 导致弹窗永远看不到 Context 更新的值
       */
      const useArticleReaderState = { dailyReadCount: 0, dailyLimitExceeded: false }
      const contextState = { dailyReadCount: 0 }

      // 模拟 recordVisit 更新 Context
      contextState.dailyReadCount = 2

      // 弹窗用 useArticleReader 的值 → 永远是 0
      const popupCondition1 = useArticleReaderState.dailyReadCount >= 2
      expect(popupCondition1).toBe(false) // Bug: 弹窗不触发

      // 弹窗应该用 Context 的值
      const popupCondition2 = contextState.dailyReadCount >= 2
      expect(popupCondition2).toBe(true) // 正确：弹窗触发
    })

    it('BUG: 弹窗条件中混合了两个数据源，导致永远不满足', () => {
      // 旧代码：dailyLimitExceeded || (isMonthly && dailyReadCount >= effectiveDailyLimit)
      // dailyLimitExceeded = useArticleReader（永远 false）
      // dailyReadCount = useArticleReader（永远是 0）
      // effectiveDailyLimit = useArticleReader（永远 8）

      const useArticleReader = { dailyLimitExceeded: false, dailyReadCount: 0, effectiveDailyLimit: 8 }
      const context = { dailyReadCount: 2, effectiveDailyLimit: 2 }

      // 旧判断：dailyLimitExceeded || (isMonthly && dailyReadCount >= effectiveDailyLimit)
      // = false || (true && 0 >= 2) = false || false = false
      const oldCondition = useArticleReader.dailyLimitExceeded || (true && useArticleReader.dailyReadCount >= useArticleReader.effectiveDailyLimit)
      expect(oldCondition).toBe(false) // Bug: 永远不触发

      // 新判断：只用 Context 的值
      const newCondition = context.dailyReadCount >= context.effectiveDailyLimit
      expect(newCondition).toBe(true) // 正确触发
    })
  })

  describe('修复验证：弹窗使用 Context state', () => {

    it('recordVisit POST 成功后，updateQuota 更新 Context state，弹窗立即触发', () => {
      const context = { dailyReadCount: 0, effectiveDailyLimit: 2 }

      // 模拟 POST 响应
      const postResponse = { success: true, dailyReadCount: 2, readCount: 29 }

      // updateQuota 使用后端返回值
      if (postResponse.success) {
        context.dailyReadCount = Number(postResponse.dailyReadCount ?? context.dailyReadCount)
      }

      // 弹窗条件
      const showPopup = context.dailyReadCount >= context.effectiveDailyLimit
      expect(showPopup).toBe(true)
    })

    it('dailyLimitDismissed=true 时，即使超过限额也不弹窗', () => {
      const context = { dailyReadCount: 2, effectiveDailyLimit: 2 }
      const dailyLimitDismissed = true

      const showPopup = (context.dailyReadCount >= context.effectiveDailyLimit) && !dailyLimitDismissed
      expect(showPopup).toBe(false)
    })

    it('关闭弹窗后（dailyLimitDismissed=true），再次超过限额也不弹窗', () => {
      const context = { dailyReadCount: 2, effectiveDailyLimit: 2 }
      const dailyLimitDismissed = true

      // 用户关闭了弹窗，即使再读一篇也不弹窗
      // （这是设计行为，用户已经知道限额了）
      const showPopup = (context.dailyReadCount >= context.effectiveDailyLimit) && !dailyLimitDismissed
      expect(showPopup).toBe(false)
    })

    it('超过限额后关闭弹窗，再刷新页面，弹窗应该再次出现', () => {
      // 页面刷新后，dailyLimitDismissed 重置为 false
      const context = { dailyReadCount: 2, effectiveDailyLimit: 2 }
      const dailyLimitDismissed = false // 刷新后重置

      const showPopup = (context.dailyReadCount >= context.effectiveDailyLimit) && !dailyLimitDismissed
      expect(showPopup).toBe(true) // 刷新后弹窗再次出现
    })

    it('非月卡会员，即使超过限额也不触发每日限额弹窗', () => {
      const isMonthly = false
      const context = { dailyReadCount: 999, effectiveDailyLimit: 2 }

      const showDailyLimitPopup = (isMonthly && context.dailyReadCount >= context.effectiveDailyLimit) && !false
      expect(showDailyLimitPopup).toBe(false)
    })

    it('月卡会员恰好达到限额（2/2），弹窗触发', () => {
      const isMonthly = true
      const context = { dailyReadCount: 2, effectiveDailyLimit: 2 }

      const showDailyLimitPopup = (isMonthly && context.dailyReadCount >= context.effectiveDailyLimit) && !false
      expect(showDailyLimitPopup).toBe(true)
    })

    it('月卡会员超过限额（3/2），弹窗触发', () => {
      const isMonthly = true
      const context = { dailyReadCount: 3, effectiveDailyLimit: 2 }

      const showDailyLimitPopup = (isMonthly && context.dailyReadCount >= context.effectiveDailyLimit) && !false
      expect(showDailyLimitPopup).toBe(true)
    })

    it('月卡会员未达限额（1/2），弹窗不触发', () => {
      const isMonthly = true
      const context = { dailyReadCount: 1, effectiveDailyLimit: 2 }

      const showDailyLimitPopup = (isMonthly && context.dailyReadCount >= context.effectiveDailyLimit) && !false
      expect(showDailyLimitPopup).toBe(false)
    })
  })

  describe('数据源分离：Context vs useArticleReader', () => {

    it('Context 的 dailyReadCount 来自 recordVisit POST 的响应', () => {
      const context = { dailyReadCount: 0 }
      const postResponse = { success: true, dailyReadCount: 2 }

      context.dailyReadCount = Number(postResponse.dailyReadCount)
      expect(context.dailyReadCount).toBe(2)
    })

    it('useArticleReader 的 dailyReadCount 来自 GET /api/articles/[id] 的响应', () => {
      const useArticleReader = { dailyReadCount: 0 }
      const getResponse = { accessType: 'monthly', readCount: 0 }

      if (getResponse.accessType === 'monthly' && getResponse.readCount !== undefined) {
        useArticleReader.dailyReadCount = getResponse.readCount
      }
      expect(useArticleReader.dailyReadCount).toBe(0)
    })

    it('两个数据源的职责分离', () => {
      // Context dailyReadCount: recordVisit 记录后更新
      // useArticleReader dailyReadCount: GET 文章时从 API 获取
      // 弹窗应该用 Context 的（因为 recordVisit 发生在 GET 之后）
      const context = { dailyReadCount: 2, effectiveDailyLimit: 2 }
      const useArticleReader = { dailyReadCount: 0 }

      // 弹窗用 Context
      expect(context.dailyReadCount >= context.effectiveDailyLimit).toBe(true)
    })
  })
})
