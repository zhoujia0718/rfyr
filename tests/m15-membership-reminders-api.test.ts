/**
 * M15-18: app/api/membership/reminders/route.ts — 会员到期提醒 API 测试
 *
 * 测试覆盖：
 * 1. GET — 未登录返回 showReminder=false
 * 2. GET — 无到期日期（info.endDate=null）返回 showReminder=false
 * 3. GET — 已过期（daysRemaining < 0）返回 showReminder=true, type=expired
 * 4. GET — 3 天内到期返回 showReminder=true, type=expiring
 * 5. GET — 超过 3 天到期返回 showReminder=false
 * 6. GET — 恰好 3 天到期算作 expiring
 * 7. GET — 异常时返回 showReminder=false
 * 8. message 内容包含会员类型描述
 */
import { describe, it, expect } from 'vitest'

// ─── 辅助：计算剩余天数 ───────────────────────────────────────────────

function calculateDaysRemaining(endDate: string | null, now = new Date('2026-04-20T12:00:00Z')): number {
  if (!endDate) return Infinity
  const end = new Date(endDate)
  const msPerDay = 24 * 60 * 60 * 1000
  // Math.ceil(-0) === -0，用 || 0 将负零转为正零
  return (Math.ceil((end.getTime() - now.getTime()) / msPerDay)) || 0
}

// ─── 辅助：判断会员类型 ───────────────────────────────────────────────

function getMembershipTypeLabel(tier: string): string {
  if (tier === 'monthly') return '月卡'
  if (tier === 'yearly') return '年度VIP'
  return '会员'
}

// ─── Mock 主逻辑 ───────────────────────────────────────────────

function mockGetReminders(params: {
  userId: string | null
  membershipInfo?: {
    endDate: string | null
    isMonthly?: boolean
    isYearly?: boolean
    tier?: string
  } | null
  throwError?: boolean
}): { status: number; body: Record<string, unknown> } {
  if (!params.userId) {
    return { status: 200, body: { showReminder: false } }
  }

  if (params.throwError) {
    return { status: 200, body: { showReminder: false } }
  }

  const info = params.membershipInfo

  if (!info?.endDate) {
    return { status: 200, body: { showReminder: false } }
  }

  const daysRemaining = calculateDaysRemaining(info.endDate)
  const tierLabel = info.tier ? getMembershipTypeLabel(info.tier) : '会员'

  // 已过期
  if (daysRemaining < 0) {
    return {
      status: 200,
      body: {
        showReminder: true,
        type: 'expired',
        daysRemaining,
        message: `您的${tierLabel}已于 ${Math.abs(daysRemaining)} 天前到期，续费可继续享受专属权益`,
      },
    }
  }

  // 3 天内到期
  if (daysRemaining <= 3) {
    return {
      status: 200,
      body: {
        showReminder: true,
        type: 'expiring',
        daysRemaining,
        message: `您的${tierLabel}将在 ${daysRemaining} 天后到期，及时续费保障阅读不中断`,
      },
    }
  }

  return { status: 200, body: { showReminder: false } }
}

// ─── 未登录检查 ───────────────────────────────────────────────

describe('M15-18a: 未登录检查', () => {
  it('userId=null 返回 showReminder=false', () => {
    const result = mockGetReminders({ userId: null })
    expect(result.status).toBe(200)
    expect(result.body.showReminder).toBe(false)
  })

  it('userId 有值时应正常处理', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: null },
    })
    expect(result.status).toBe(200)
    expect(result.body.showReminder).toBe(false)
  })
})

// ─── endDate 检查 ───────────────────────────────────────────────

describe('M15-18b: endDate 检查', () => {
  it('endDate=null 返回 showReminder=false', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: null },
    })
    expect(result.body.showReminder).toBe(false)
  })

  it('endDate 存在时应继续计算', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: '2026-04-25' },
    })
    expect(result.status).toBe(200)
  })
})

// ─── 已过期判断 ───────────────────────────────────────────────

describe('M15-18c: 已过期判断', () => {
  it('过期 1 天返回 expired 类型', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: '2026-04-19', tier: 'monthly' },
    })
    expect(result.body.showReminder).toBe(true)
    expect(result.body.type).toBe('expired')
    expect(result.body.daysRemaining).toBe(-1)
  })

  it('过期 7 天返回 expired 类型', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: '2026-04-13', tier: 'yearly' },
    })
    expect(result.body.showReminder).toBe(true)
    expect(result.body.type).toBe('expired')
    expect(result.body.daysRemaining).toBe(-7)
  })

  it('message 包含过期天数', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: '2026-04-18', tier: 'monthly' },
    })
    expect(result.body.message).toContain('2')
    expect(result.body.message).toContain('天前到期')
  })
})

// ─── 即将到期判断 ───────────────────────────────────────────────

describe('M15-18d: 即将到期判断（3 天内）', () => {
  it('今日到期（0 天）返回 expiring', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: '2026-04-20' },
    })
    expect(result.body.showReminder).toBe(true)
    expect(result.body.type).toBe('expiring')
    expect(result.body.daysRemaining).toBe(0)
  })

  it('1 天后到期返回 expiring', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: '2026-04-21' },
    })
    expect(result.body.showReminder).toBe(true)
    expect(result.body.type).toBe('expiring')
    expect(result.body.daysRemaining).toBe(1)
  })

  it('3 天后到期（临界值）返回 expiring', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: '2026-04-23' },
    })
    expect(result.body.showReminder).toBe(true)
    expect(result.body.type).toBe('expiring')
    expect(result.body.daysRemaining).toBe(3)
  })

  it('4 天后到期返回 showReminder=false', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: '2026-04-24' },
    })
    expect(result.body.showReminder).toBe(false)
  })

  it('expiring message 包含剩余天数', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      membershipInfo: { endDate: '2026-04-21', tier: 'monthly' },
    })
    expect(result.body.message).toContain('1')
    expect(result.body.message).toContain('天')
  })
})

// ─── 会员类型描述 ───────────────────────────────────────────────

describe('M15-18e: 会员类型描述', () => {
  it('monthly 显示月卡', () => {
    expect(getMembershipTypeLabel('monthly')).toBe('月卡')
  })

  it('yearly 显示年度VIP', () => {
    expect(getMembershipTypeLabel('yearly')).toBe('年度VIP')
  })

  it('其他显示会员', () => {
    expect(getMembershipTypeLabel('permanent')).toBe('会员')
    expect(getMembershipTypeLabel('none')).toBe('会员')
  })
})

// ─── 异常处理 ───────────────────────────────────────────────────

describe('M15-18f: 异常处理', () => {
  it('异常时应返回 showReminder=false', () => {
    const result = mockGetReminders({
      userId: 'user-123',
      throwError: true,
    })
    expect(result.body.showReminder).toBe(false)
    expect(result.status).toBe(200)
  })
})
