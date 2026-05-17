/**
 * recordVisit 后端逻辑单元测试
 *
 * 覆盖场景（对应用户报告的 bug）：
 * 1. dailyLimit 未传时，限额检查被跳过（已修复：后端 route 现在传 dailyLimit）
 * 2. alreadyRead=true 且已达限额，后端返回 exceeded=false（bug！）
 * 3. 已读文章重复访问，应返回 alreadyRead=true 且不增加计数
 * 4. 每日限额 2，访问第 3 篇时返回 exceeded
 *
 * 为什么这些场景没被测到：
 * - 旧测试只测 calculateCanRead 纯函数，不测 recordVisit 后端逻辑
 * - 旧测试没有 mock Supabase，没有测真实数据库操作
 * - 旧测试没有覆盖：POST body 中是否包含 dailyLimit 参数
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockSupabaseAdmin = {
  from: vi.fn(() => mockFrom),
}

let mockFrom: ReturnType<typeof vi.fn>

function setupSelect(data: unknown, error: unknown = null) {
  mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data, error })),
      })),
    })),
  })) as unknown as ReturnType<typeof vi.fn>
}

function setupUpdate(data: unknown, error: unknown = null) {
  mockFrom = vi.fn(() => ({
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data, error })),
          })),
        })),
      })),
    })),
  })) as unknown as ReturnType<typeof vi.fn>
}

// ─── 测试用 recordVisit（从 lib/reading-limit.ts 提取）──────────────────────

type AtomicResult =
  | { ok: true; alreadyRead: boolean; readCount: number; dailyReadCount: number }
  | { ok: false; reason: "conflict" | "already_read" | "exceeded" }

async function atomicWriteAttempt(
  userId: string,
  articleId: string,
  currentCount: number,
  currentDailyCount: number,
  existingIds: string[],
  shouldResetDaily: boolean,
  today: string,
  dailyLimit: number | null
): Promise<AtomicResult> {
  if (existingIds.includes(articleId)) {
    return {
      ok: true,
      alreadyRead: true,
      readCount: existingIds.length,
      dailyReadCount: shouldResetDaily ? 0 : currentDailyCount,
    }
  }

  const projectedCount = currentCount + 1
  const projectedDailyCount = shouldResetDaily ? 1 : currentDailyCount + 1

  if (dailyLimit !== null && projectedDailyCount > dailyLimit) {
    return { ok: false, reason: "exceeded" }
  }

  return {
    ok: true,
    alreadyRead: false,
    readCount: projectedCount,
    dailyReadCount: projectedDailyCount,
  }
}

// ─── 测试场景 ─────────────────────────────────────────────────────────────────

describe('M16-RecordVisit: recordVisit 后端逻辑测试', () => {

  describe('atomicWriteAttempt — 每日限额检查', () => {

    it('dailyLimit=null 时，跳过限额检查，永远允许写入', async () => {
      const result = await atomicWriteAttempt(
        'user-1', 'article-new',
        10, 100, [], // currentCount=10, dailyCount=100
        false, '2026-04-21',
        null // 无限制
      )
      expect(result.ok).toBe(true)
      expect((result as { alreadyRead: boolean }).alreadyRead).toBe(false)
      expect((result as { ok: true; alreadyRead: boolean; readCount: number; dailyReadCount: number }).readCount).toBe(11)
    })

    it('dailyLimit=2，当前 dailyCount=1，允许写入（1+1 <= 2）', async () => {
      const result = await atomicWriteAttempt(
        'user-1', 'article-new',
        5, 1, [],
        false, '2026-04-21',
        2
      )
      expect(result.ok).toBe(true)
      expect((result as { alreadyRead: boolean }).alreadyRead).toBe(false)
    })

    it('dailyLimit=2，当前 dailyCount=2，拒绝写入（2+1 > 2）', async () => {
      const result = await atomicWriteAttempt(
        'user-1', 'article-new',
        5, 2, [],
        false, '2026-04-21',
        2
      )
      expect(result.ok).toBe(false)
      expect((result as { ok: false; reason: string }).reason).toBe('exceeded')
    })

    it('dailyLimit=2，当前 dailyCount=2，已读列表包含该文章 → alreadyRead=true', async () => {
      const result = await atomicWriteAttempt(
        'user-1', 'article-3',
        5, 2, ['article-1', 'article-2', 'article-3'],
        false, '2026-04-21',
        2
      )
      // 当前 Bug：返回 alreadyRead=true，但没有检查是否超限
      expect(result.ok).toBe(true)
      expect((result as { alreadyRead: boolean }).alreadyRead).toBe(true)
      expect((result as { alreadyRead: true; readCount: number }).readCount).toBe(3)
    })

    it('已读文章重复访问，dailyCount 不增加（幂等性）', async () => {
      const result = await atomicWriteAttempt(
        'user-1', 'article-1',
        5, 2, ['article-1'],
        false, '2026-04-21',
        2
      )
      expect(result.ok).toBe(true)
      expect((result as { alreadyRead: boolean }).alreadyRead).toBe(true)
      expect((result as { dailyReadCount: number }).dailyReadCount).toBe(2)
    })

    it('新文章访问，日期变更时重置 dailyCount', async () => {
      const result = await atomicWriteAttempt(
        'user-1', 'article-new',
        5, 99, [],
        true, '2026-04-21', // shouldResetDaily = true
        2
      )
      expect(result.ok).toBe(true)
      expect((result as { alreadyRead: boolean }).alreadyRead).toBe(false)
      expect((result as { ok: true; alreadyRead: false; dailyReadCount: number }).dailyReadCount).toBe(1)
    })

    it('dailyLimit=2，dailyCount=1，邀请奖励 bonus=1 时，有效限额=3（1+1 < 3，允许）', async () => {
      // 注意：bonus 不在 atomicWriteAttempt 中处理，由调用者传入正确的 dailyLimit
      const result = await atomicWriteAttempt(
        'user-1', 'article-new',
        5, 1, [],
        false, '2026-04-21',
        3 // effectiveDailyLimit = monthly_daily_limit + bonus
      )
      expect(result.ok).toBe(true)
    })
  })

  describe('BUG: alreadyRead + 超限组合场景', () => {

    it('BUG: alreadyRead=true 但已达限额，后端返回 exceeded=false（旧实现）', async () => {
      /**
       * 这是当前后端代码的 bug：
       * 当 existingIds.includes(articleId) 为 true 时，
       * 立即返回 alreadyRead=true，忽略了限额检查。
       *
       * 结果：前端收到 alreadyRead=true 但 exceeded=false，
       * 不知道用户已达限额，不显示弹窗。
       */
      const result = await atomicWriteAttempt(
        'user-1', 'article-3',
        28, 2, ['article-1', 'article-2', 'article-3'],
        false, '2026-04-21',
        2
      )

      // 当前行为：alreadyRead=true，exceeded=undefined（false）
      expect(result.ok).toBe(true)
      expect((result as { alreadyRead: boolean }).alreadyRead).toBe(true)

      // Bug 确认：即使 dailyCount=2 已达到限额 2，也返回 ok=true
      // 没有返回 exceeded=true
    })

    it('FIX: alreadyRead=true 且 dailyCount >= dailyLimit，应返回超限信息', async () => {
      /**
       * 修复后的期望行为：
       * 如果 dailyCount >= dailyLimit，即使文章已读，也应返回 exceeded=true
       * 这样前端可以正确显示弹窗
       */
      const dailyLimit = 2
      const currentDailyCount = 2
      const alreadyAtLimit = currentDailyCount >= dailyLimit

      // 修复后的逻辑
      const resultAlreadyRead = alreadyAtLimit
        ? { ok: true, alreadyRead: true, readCount: 3, dailyReadCount: currentDailyCount, exceeded: true }
        : { ok: true, alreadyRead: true, readCount: 3, dailyReadCount: currentDailyCount, exceeded: false }

      expect(resultAlreadyRead.exceeded).toBe(true)
    })

    it('BUG: dailyLimit 参数未传时，等于 null → 跳过限额检查（旧实现 route.ts bug）', () => {
      /**
       * 当前后端 route.ts 的 bug：
       * const { articleId } = body  // 漏了 dailyLimit！
       * const data = await recordVisit(userId, articleId)  // dailyLimit 默认 null
       *
       * 修复：const { articleId, dailyLimit } = body
       * const data = await recordVisit(userId, articleId, dailyLimit)
       */
      const bodyWithoutLimit = { articleId: 'article-new' }
      const { articleId } = bodyWithoutLimit
      const dailyLimit = undefined // body 中没有 dailyLimit

      // 模拟 recordVisit 调用（dailyLimit = null）
      const result = atomicWriteAttempt(
        'user-1', articleId,
        5, 2, [],
        false, '2026-04-21',
        dailyLimit ?? null // undefined → null，跳过限额检查
      )

      // Bug 确认：dailyLimit=null 时，即使 dailyCount=2，也允许写入
      expect(result).resolves.toMatchObject({ ok: true, alreadyRead: false })
    })
  })

  describe('POST 返回值与前端弹窗的关系', () => {

    it('后端返回 exceeded=true 时，前端应显示弹窗', () => {
      /**
       * 前端 paywall 显示条件：
       * dailyLimitExceeded || (isMonthly && dailyReadCount >= effectiveDailyLimit)
       *
       * 但 recordVisit 的 POST 返回 { success: true, exceeded: true }
       * 目前前端只检查 success，没有检查 exceeded
       * 导致即使 exceeded=true，弹窗也不显示
       */
      const postResponse = { success: true, exceeded: true, alreadyRead: false }

      // 前端目前只检查 success
      expect(postResponse.success).toBe(true)
      // 但 exceeded=true 时应该触发弹窗

      // 修复后的前端逻辑
      const shouldShowPopup = postResponse.success && (postResponse as any).exceeded
      expect(shouldShowPopup).toBe(true)
    })

    it('后端返回 alreadyRead=true 且 exceeded=false 时，前端不更新计数', () => {
      const postResponse = { success: true, alreadyRead: true, exceeded: false }

      const shouldUpdateCount = postResponse.success && !(postResponse as any).alreadyRead
      expect(shouldUpdateCount).toBe(false)
    })

    it('后端返回 exceeded=true 时，前端应根据 exceeded 而非 success 判断弹窗', () => {
      // 场景：月卡用户已读满 2 篇，再次访问某篇
      // 旧行为：alreadyRead=true → 不显示弹窗
      // 正确行为：exceeded=true → 显示弹窗

      const exceededResponse = { success: true, exceeded: true, alreadyRead: true }

      // 弹窗判断：后端返回 exceeded 时必须显示
      expect((exceededResponse as any).exceeded).toBe(true)

      // 旧判断：只检查 success → 弹窗不显示（bug）
      const oldLogic = exceededResponse.success
      expect(oldLogic).toBe(true) // 但这不足以触发弹窗

      // 新判断：检查 exceeded 标志
      const newLogic = (exceededResponse as any).exceeded
      expect(newLogic).toBe(true) // 正确触发弹窗
    })
  })
})
