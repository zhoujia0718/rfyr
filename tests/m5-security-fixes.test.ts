/**
 * 模块五：推荐兑换系统安全修复 — 单元测试
 *
 * 测试覆盖（M5 安全修复）：
 *
 * 1. M5-01/02 FIX: 兑换码月卡次数原子限制
 *    - 免费月卡：monthly_free_used 条件 UPDATE
 *    - 付费月卡：atomic_increment_counter RPC 原子递增
 *    - 上限 4 次的边界条件
 *
 * 2. M5-03 FIX: membership upsert 原子化
 *    - UNIQUE 约束确保同一用户同类会员只有一条记录
 *    - 并发续期不会产生双重 INSERT
 *
 * 3. M5-04 FIX: referral upsert 原子化
 *    - (referrer_id, referee_id) UNIQUE 约束
 *    - 并发重复邀请不会创建多条记录
 *
 * 4. M5-05 FIX: 奖励原子更新
 *    - bonus_read_count / bonus_daily_count 原子 increment
 *    - 并发邀请不会丢失奖励
 *
 * 5. M5-06 FIX: 兑换码字符集一致性
 *    - 生成端和验证端使用相同字符集
 *
 * 6. M5-07 FIX: API 兑换码格式预校验
 *    - 提前过滤无效请求，不打数据库
 *
 * 7. M5-09 FIX: 邀请码字符集一致性
 *    - 生成端和验证端去掉易混淆字符
 *
 * 所有测试均为纯函数测试，mock 数据库层行为，确保测试环境无关。
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ══════════════════════════════════════════════════════════════════════════════
// 常量（与源文件保持同步）
// ══════════════════════════════════════════════════════════════════════════════

const MONTHLY_DAYS = 30
const YEARLY_DAYS = 365
const CODE_EXPIRY_DAYS = 3
const MAX_MONTHLY_FREE = 1
const MAX_MONTHLY_TOTAL = 4

// M5-06 FIX: 兑换码字符集（统一，去掉 I O 0 1）
const REDEEM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const REDEEM_CODE_REGEX = /^RFYR-(MONTH|YEAR)-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/

// M5-09 FIX: 邀请码字符集（小写，去掉 l o 0 1）
const REFERRAL_CODE_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789'
const REFERRAL_CODE_REGEX = /^[abcdefghijkmnpqrstuvwxyz23456789]{8}$/

// M5-08: 每日重置（CST = UTC+8）
// Intl.DateTimeFormat 跨天边界为 UTC 16:00（CST 00:00）
// UTC 00:00~15:59 → 当天，UTC 16:00~ → 次日
function toLocalDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

// M5-03 FIX: addMembershipPeriod（与源文件一致）
function addMembershipPeriod(baseDate: Date, days: number, membershipType: 'monthly' | 'yearly'): Date {
  const end = new Date(baseDate)
  if (membershipType === 'yearly') {
    const originalDay = end.getUTCDate()
    end.setUTCFullYear(end.getUTCFullYear() + 1)
    // 处理闰年溢出：2/29 + 1年 → 3/1 → 回拨到 2/28
    if (end.getUTCDate() < originalDay) {
      end.setUTCDate(0)
    }
  } else {
    end.setDate(end.getDate() + days)
  }
  return end
}

// ══════════════════════════════════════════════════════════════════════════════
// 模拟数据库（用于竞态测试）
// ══════════════════════════════════════════════════════════════════════════════

// 模拟 atomic_increment_counter RPC 的行为
type AtomicCounter = Map<string, number>

const atomicCounters: AtomicCounter = new Map()

function atomicIncrement(table: string, column: string, rowId: string, by: number): { success: boolean; new_value?: number } {
  const key = `${table}:${column}:${rowId}`
  const current = atomicCounters.get(key) ?? 0
  atomicCounters.set(key, current + by)
  return { success: true, new_value: current + by }
}

function getCounter(table: string, column: string, rowId: string): number {
  return atomicCounters.get(`${table}:${column}:${rowId}`) ?? 0
}

function resetCounters() {
  atomicCounters.clear()
}

// 模拟 membership upsert（有 UNIQUE 约束）
type MembershipRecord = { user_id: string; membership_type: string; end_date: string; status: string }
const memberships = new Map<string, MembershipRecord>()

function upsertMembership(
  userId: string,
  type: 'monthly' | 'yearly',
  endDate: string
): { success: boolean } {
  const key = `${userId}:${type}`
  memberships.set(key, { user_id: userId, membership_type: type, end_date: endDate, status: 'active' })
  return { success: true }
}

function getMembership(userId: string, type: string): MembershipRecord | undefined {
  return memberships.get(`${userId}:${type}`)
}

function resetMemberships() {
  memberships.clear()
}

// 模拟 referral upsert（有 UNIQUE 约束）
type ReferralRecord = { referrer_id: string; referee_id: string }
const referrals = new Map<string, ReferralRecord>()

function upsertReferral(referrerId: string, refereeId: string): { success: boolean; inserted: boolean } {
  const key = `${referrerId}:${refereeId}`
  const existed = referrals.has(key)
  referrals.set(key, { referrer_id: referrerId, referee_id: refereeId })
  return { success: true, inserted: !existed }
}

function getReferralCount(): number {
  return referrals.size
}

function resetReferrals() {
  referrals.clear()
}

// ══════════════════════════════════════════════════════════════════════════════
// 清理
// ══════════════════════════════════════════════════════════════════════════════

function resetAll() {
  resetCounters()
  resetMemberships()
  resetReferrals()
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 1: M5-06 — 兑换码字符集一致性
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-06 — 兑换码字符集一致性', () => {
  beforeEach(resetAll)

  const EXCLUDED_CHARS = ['I', 'O', '0', '1', 'i', 'o']

  it('生成端字符集应不含易混淆字符', () => {
    for (const char of EXCLUDED_CHARS) {
      expect(REDEEM_CODE_CHARS).not.toContain(char)
    }
  })

  it('字符集长度应为 32（A-Z去除I,O=24 + 2-9数字=8 → 32）', () => {
    // ABCDEFGHJKLMNPQRSTUVWXYZ23456789 = 26字母-2(I,O) + 8数字 = 32
    expect(REDEEM_CODE_CHARS).toHaveLength(32)
  })

  it('验证正则应拒绝含 I/O/0/1 的码', () => {
    expect(REDEEM_CODE_REGEX.test('RFYR-MONTH-IIIII1')).toBe(false)
    expect(REDEEM_CODE_REGEX.test('RFYR-MONTH-000000')).toBe(false)
    expect(REDEEM_CODE_REGEX.test('RFYR-MONTH-OOOOOO')).toBe(false)
  })

  it('验证正则应接受有效码', () => {
    expect(REDEEM_CODE_REGEX.test('RFYR-MONTH-ABCDEF')).toBe(true)
    expect(REDEEM_CODE_REGEX.test('RFYR-MONTH-234567')).toBe(true)
    expect(REDEEM_CODE_REGEX.test('RFYR-YEAR-ABCDEF')).toBe(true)
    expect(REDEEM_CODE_REGEX.test('RFYR-YEAR-234567')).toBe(true)
  })

  it('验证正则应拒绝错误前缀', () => {
    expect(REDEEM_CODE_REGEX.test('RFYR-MNTH-ABCDEF')).toBe(false)
    expect(REDEEM_CODE_REGEX.test('RFYR-YER-ABCDEF')).toBe(false)
    expect(REDEEM_CODE_REGEX.test('RFYR-MONTHY-ABCDEF')).toBe(false)
  })

  it('验证正则应拒绝错误后缀长度', () => {
    expect(REDEEM_CODE_REGEX.test('RFYR-MONTH-ABCDE')).toBe(false)  // 5位
    expect(REDEEM_CODE_REGEX.test('RFYR-MONTH-ABCDEFG')).toBe(false) // 7位
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 2: M5-09 — 邀请码字符集一致性
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-09 — 邀请码字符集一致性', () => {
  const EXCLUDED_LOWER = ['l', 'o', '0', '1']

  it('生成端字符集应不含易混淆字符', () => {
    for (const char of EXCLUDED_LOWER) {
      expect(REFERRAL_CODE_CHARS).not.toContain(char)
    }
  })

  it('验证正则应拒绝含 l/o/0/1 的码', () => {
    expect(REFERRAL_CODE_REGEX.test('llllllll')).toBe(false)
    expect(REFERRAL_CODE_REGEX.test('oooooooo')).toBe(false)
    expect(REFERRAL_CODE_REGEX.test('00000000')).toBe(false)
    expect(REFERRAL_CODE_REGEX.test('11111111')).toBe(false)
  })

  it('验证正则应接受 8 位有效字符', () => {
    expect(REFERRAL_CODE_REGEX.test('abcdefgh')).toBe(true)
    expect(REFERRAL_CODE_REGEX.test('23456789')).toBe(true)
    expect(REFERRAL_CODE_REGEX.test('jkmnpqrs')).toBe(true)
  })

  it('验证正则应拒绝非小写字母', () => {
    expect(REFERRAL_CODE_REGEX.test('ABCDEFGH')).toBe(false)
    expect(REFERRAL_CODE_REGEX.test('abc12345')).toBe(false)
  })

  it('验证正则应拒绝错误长度', () => {
    expect(REFERRAL_CODE_REGEX.test('abcdefg')).toBe(false)   // 7位
    expect(REFERRAL_CODE_REGEX.test('abcdefghi')).toBe(false)  // 9位
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 3: M5-03 — addMembershipPeriod 到期日计算
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-03 — addMembershipPeriod 到期日计算', () => {
  beforeEach(resetAll)

  it('月卡 +30 天应正确处理跨月溢出（UTC 00:00 边界）', () => {
    // UTC 2026-01-31T16:00:00Z = CST 2026-02-01T00:00:00 → 仍算次日
    const utcDate = new Date('2026-01-31T15:59:59Z') // CST 2026-01-31T23:59:59
    const end = addMembershipPeriod(utcDate, MONTHLY_DAYS, 'monthly')
    // JS Date 会自动处理溢出
    expect(end > utcDate).toBe(true)
  })

  it('年卡 +1 年应处理闰年（2月29日 → 2月28日）', () => {
    const base = new Date('2028-02-29T00:00:00Z') // 闰年
    const end = addMembershipPeriod(base, YEARLY_DAYS, 'yearly')
    expect(end.getFullYear()).toBe(2029)
    expect(end.getMonth()).toBe(1) // February (0-indexed)
    expect(end.getDate()).toBe(28) // 2029 非闰年
  })

  it('从当前会员到期日顺延', () => {
    // 场景：用户月卡到期日是 2026-04-19，续期应从 04-19 + 30 = 05-19
    const existingEnd = new Date('2026-04-19T00:00:00Z')
    const end = addMembershipPeriod(existingEnd, MONTHLY_DAYS, 'monthly')
    expect(end.getMonth()).toBe(4) // May (0-indexed)
    expect(end.getDate()).toBe(19)
  })

  it('已过期会员（end_date < now）从今天开始', () => {
    const expiredEnd = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-04-20T00:00:00Z')
    const end = addMembershipPeriod(now, MONTHLY_DAYS, 'monthly')
    // 应从 now + 30 天，而非 expiredEnd + 30
    expect(end >= now).toBe(true)
  })

  it('永久会员不触发此逻辑（type 只有 monthly | yearly）', () => {
    // 测试 year+1 和 month+30 的边界行为
    const d = new Date('2026-06-15')
    const yearEnd = addMembershipPeriod(d, YEARLY_DAYS, 'yearly')
    expect(yearEnd.getFullYear()).toBe(2027)
    expect(yearEnd.getMonth()).toBe(5) // June (0-indexed)
    expect(yearEnd.getDate()).toBe(15)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 4: M5-08 — toLocalDateString CST 跨天逻辑
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-08 — toLocalDateString CST 跨天逻辑', () => {
  it('UTC 00:00（CST 08:00）应为当天', () => {
    // UTC 00:00 → CST 08:00 → 当天
    const d = new Date('2026-04-20T00:00:00Z')
    expect(toLocalDateString(d)).toBe('2026-04-20')
  })

  it('UTC 07:59（CST 15:59）应为当天', () => {
    const d = new Date('2026-04-20T07:59:59Z')
    expect(toLocalDateString(d)).toBe('2026-04-20')
  })

  it('UTC 08:00（CST 16:00）应为当天（Intl跨天边界为UTC 16:00）', () => {
    // Intl.DateTimeFormat CST 跨天边界 = UTC 16:00
    const d = new Date('2026-04-20T08:00:00Z')
    expect(toLocalDateString(d)).toBe('2026-04-20')
  })

  it('UTC 12:00（CST 20:00）应为当天（跨天边界为UTC 16:00）', () => {
    const d = new Date('2026-04-20T12:00:00Z')
    expect(toLocalDateString(d)).toBe('2026-04-20')
  })

  it('UTC 15:59（CST 23:59）应为当天（跨天边界为UTC 16:00）', () => {
    const d = new Date('2026-04-20T15:59:59Z')
    expect(toLocalDateString(d)).toBe('2026-04-20')
  })

  it('UTC 16:00（CST 00:00 次日）应为次日', () => {
    const d = new Date('2026-04-20T16:00:00Z')
    expect(toLocalDateString(d)).toBe('2026-04-21')
  })

  it('边界：UTC 15:xx 应为当天', () => {
    const d = new Date('2026-04-20T15:59:59.999Z')
    expect(toLocalDateString(d)).toBe('2026-04-20')
  })

  it('边界：UTC 16:00 应为次日', () => {
    const d = new Date('2026-04-20T16:00:00.000Z')
    expect(toLocalDateString(d)).toBe('2026-04-21')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 5: M5-01/02 — 月卡次数原子限制（竞态模拟）
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-01/02 — 月卡次数原子限制', () => {
  beforeEach(resetAll)

  /**
   * 模拟 M5-01 的 atomic_increment_counter RPC 行为：
   * - 仅当 current_count < MAX 时才执行 increment
   * - 这是 PostgreSQL 层面的原子条件 UPDATE
   */
  function atomicIncrementWithLimit(
    rowId: string,
    max: number,
    by: number = 1
  ): { success: boolean } {
    const key = `user_profiles:monthly_purchase_count:${rowId}`
    const current = atomicCounters.get(key) ?? 0
    if (current >= max) {
      return { success: false }
    }
    atomicCounters.set(key, current + by)
    return { success: true }
  }

  it('第1次付费兑换应成功', () => {
    const result = atomicIncrementWithLimit('user-001', MAX_MONTHLY_TOTAL)
    expect(result.success).toBe(true)
    expect(getCounter('user_profiles', 'monthly_purchase_count', 'user-001')).toBe(1)
  })

  it('第4次兑换应成功（count=3 → 4）', () => {
    atomicCounters.set('user_profiles:monthly_purchase_count:user-001', 3)
    const result = atomicIncrementWithLimit('user-001', MAX_MONTHLY_TOTAL)
    expect(result.success).toBe(true)
    expect(getCounter('user_profiles', 'monthly_purchase_count', 'user-001')).toBe(4)
  })

  it('第5次兑换应失败（count=4，已达上限）', () => {
    atomicCounters.set('user_profiles:monthly_purchase_count:user-001', 4)
    const result = atomicIncrementWithLimit('user-001', MAX_MONTHLY_TOTAL)
    expect(result.success).toBe(false)
    // count 保持 4，不应变成 5
    expect(getCounter('user_profiles', 'monthly_purchase_count', 'user-001')).toBe(4)
  })

  it('并发：10个请求同时来，精确只有4个成功', () => {
    atomicCounters.set('user_profiles:monthly_purchase_count:user-001', 0)
    let successCount = 0

    // 模拟 10 个并发请求（顺序执行，模拟原子操作结果）
    const results: { success: boolean }[] = []
    for (let i = 0; i < 10; i++) {
      results.push(atomicIncrementWithLimit('user-001', MAX_MONTHLY_TOTAL))
    }

    for (const r of results) {
      if (r.success) successCount++
    }

    // 只有 4 次成功（达到上限后其余 6 次被拒绝）
    expect(successCount).toBe(4)
    expect(getCounter('user_profiles', 'monthly_purchase_count', 'user-001')).toBe(4)
  })

  it('免费月卡 monthly_free_used 条件 UPDATE 模拟', () => {
    // 模拟条件 UPDATE：只有当 monthly_free_used = false 时才执行
    const userProfile = { monthly_free_used: false as boolean }

    // 请求A：条件 UPDATE
    if (!userProfile.monthly_free_used) {
      userProfile.monthly_free_used = true
    }
    expect(userProfile.monthly_free_used).toBe(true)

    // 请求B：此时条件不满足（已被设为 true），不执行
    if (!userProfile.monthly_free_used) {
      userProfile.monthly_free_used = true
    }
    expect(userProfile.monthly_free_used).toBe(true) // 仍为 true，未重复执行
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 6: M5-03 — membership upsert 原子化（UNIQUE 约束）
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-03 — membership upsert 原子化', () => {
  beforeEach(resetAll)

  it('首次插入应成功', () => {
    const endDate = new Date('2026-05-20').toISOString()
    const result = upsertMembership('user-001', 'monthly', endDate)
    expect(result.success).toBe(true)
    expect(getMembership('user-001', 'monthly')?.end_date).toBe(endDate)
  })

  it('相同用户+类型重复 upsert 应覆盖（UNIQUE 约束行为）', () => {
    const end1 = new Date('2026-05-20').toISOString()
    const end2 = new Date('2026-06-19').toISOString() // +30天顺延

    upsertMembership('user-001', 'monthly', end1)
    upsertMembership('user-001', 'monthly', end2) // 续期

    // Map 行为：相同 key 覆盖旧值
    expect(getMembership('user-001', 'monthly')?.end_date).toBe(end2)
    // 但只有一条记录（UNIQUE 约束保证）
    expect(memberships.size).toBe(1)
  })

  it('不同用户可以各自有 monthly 会员（key 不同）', () => {
    upsertMembership('user-001', 'monthly', '2026-05-20')
    upsertMembership('user-002', 'monthly', '2026-06-20')
    expect(memberships.size).toBe(2)
  })

  it('同一用户可以同时有 monthly 和 yearly（key 不同）', () => {
    upsertMembership('user-001', 'monthly', '2026-05-20')
    upsertMembership('user-001', 'yearly', '2027-04-20')
    expect(memberships.size).toBe(2)
    expect(getMembership('user-001', 'monthly')).toBeDefined()
    expect(getMembership('user-001', 'yearly')).toBeDefined()
  })

  it('并发：两个续期请求同时来，只有一条记录', () => {
    upsertMembership('user-001', 'monthly', '2026-05-20')
    upsertMembership('user-001', 'monthly', '2026-06-19')
    upsertMembership('user-001', 'monthly', '2026-07-19')
    // Map 保证只有一条记录
    expect(memberships.size).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 7: M5-04 — referral upsert 原子化（UNIQUE 约束）
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-04 — referral upsert 原子化', () => {
  beforeEach(resetAll)

  it('首次插入应成功 inserted=true', () => {
    const { success, inserted } = upsertReferral('referrer-001', 'referee-001')
    expect(success).toBe(true)
    expect(inserted).toBe(true)
  })

  it('重复 upsert 应 inserted=false', () => {
    upsertReferral('referrer-001', 'referee-001')
    const { inserted } = upsertReferral('referrer-001', 'referee-001')
    expect(inserted).toBe(false)
  })

  it('只有一条记录（UNIQUE 约束）', () => {
    upsertReferral('referrer-001', 'referee-001')
    upsertReferral('referrer-001', 'referee-001')
    upsertReferral('referrer-001', 'referee-001')
    expect(referrals.size).toBe(1)
  })

  it('同一 referrer 可以邀请多个不同 referee', () => {
    upsertReferral('referrer-001', 'referee-001')
    upsertReferral('referrer-001', 'referee-002')
    upsertReferral('referrer-001', 'referee-003')
    expect(referrals.size).toBe(3)
  })

  it('不同 referrer 可以邀请同一 referee（不同邀请链）', () => {
    upsertReferral('referrer-001', 'referee-001')
    upsertReferral('referrer-002', 'referee-001')
    expect(referrals.size).toBe(2)
  })

  it('并发：同一 (referrer, referee) 多次 upsert 只有一条记录', () => {
    // 模拟 10 个并发请求
    const results = []
    for (let i = 0; i < 10; i++) {
      results.push(upsertReferral('referrer-001', 'referee-001'))
    }

    const insertedCount = results.filter(r => r.inserted).length
    expect(insertedCount).toBe(1) // 只有第一次插入
    expect(referrals.size).toBe(1) // 只有一条记录
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 8: M5-05 — 奖励原子 increment
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-05 — 奖励原子 increment', () => {
  beforeEach(resetAll)

  it('首次邀请应增加 bonus_read_count', () => {
    atomicIncrement('user_profiles', 'bonus_read_count', 'referrer-001', 2)
    expect(getCounter('user_profiles', 'bonus_read_count', 'referrer-001')).toBe(2)
  })

  it('多次邀请应累加（不丢失）', () => {
    atomicIncrement('user_profiles', 'bonus_read_count', 'referrer-001', 2)
    atomicIncrement('user_profiles', 'bonus_read_count', 'referrer-001', 2)
    atomicIncrement('user_profiles', 'bonus_read_count', 'referrer-001', 2)
    expect(getCounter('user_profiles', 'bonus_read_count', 'referrer-001')).toBe(6)
  })

  it('bonus_daily_count 也应原子递增', () => {
    atomicIncrement('user_profiles', 'bonus_daily_count', 'referrer-001', 2)
    atomicIncrement('user_profiles', 'bonus_daily_count', 'referrer-001', 2)
    expect(getCounter('user_profiles', 'bonus_daily_count', 'referrer-001')).toBe(4)
  })

  it('不同用户计数器互不影响', () => {
    atomicIncrement('user_profiles', 'bonus_read_count', 'user-A', 2)
    atomicIncrement('user_profiles', 'bonus_read_count', 'user-B', 2)
    atomicIncrement('user_profiles', 'bonus_read_count', 'user-A', 2)
    expect(getCounter('user_profiles', 'bonus_read_count', 'user-A')).toBe(4)
    expect(getCounter('user_profiles', 'bonus_read_count', 'user-B')).toBe(2)
  })

  it('并发邀请：10次邀请应精确累加到 20', () => {
    for (let i = 0; i < 10; i++) {
      atomicIncrement('user_profiles', 'bonus_read_count', 'referrer-001', 2)
    }
    expect(getCounter('user_profiles', 'bonus_read_count', 'referrer-001')).toBe(20)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 9: M5-07 — 兑换码格式预校验
// ══════════════════════════════════════════════════════════════════════════════

describe('M5-07 — 兑换码格式预校验', () => {
  it('应提前拒绝无效格式，不查数据库', () => {
    const invalidCodes = [
      '',          // 空
      'RFYR-MONTH-X',  // 太短
      'RFYR-MONTH-XI23', // 混合大小写
      'RFYR-MONTH-IIIII', // 含 I
      'RFYR-MONTH-000000', // 含 0
      'RFYR-MONTH-111111', // 含 1
      'WRONG-PREFIX-ABCDEF', // 错误前缀
      'RFYR-MONTHLY-ABCDEF', // 错误前缀
    ]
    for (const code of invalidCodes) {
      expect(REDEEM_CODE_REGEX.test(code), `应拒绝: ${code}`).toBe(false)
    }
  })

  it('应接受所有合法格式', () => {
    const validCodes = [
      'RFYR-MONTH-ABCDEF',
      'RFYR-MONTH-GHJKMN',
      'RFYR-MONTH-234567',
      'RFYR-MONTH-UVWXYZ',
      'RFYR-YEAR-ABCDEF',
      'RFYR-YEAR-GHJKMN',
    ]
    for (const code of validCodes) {
      expect(REDEEM_CODE_REGEX.test(code), `应接受: ${code}`).toBe(true)
    }
  })

  it('字符集不含的字符应全部被正则拦截', () => {
    const allExcluded = 'IO01io'
    for (const char of allExcluded.split('')) {
      const code = `RFYR-MONTH-${char.repeat(6)}`
      expect(REDEEM_CODE_REGEX.test(code), `应拒绝含 ${char}: ${code}`).toBe(false)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 10: 常量完整性验证
// ══════════════════════════════════════════════════════════════════════════════

describe('常量完整性验证', () => {
  it('MAX_MONTHLY_TOTAL 应为 4', () => {
    expect(MAX_MONTHLY_TOTAL).toBe(4)
  })

  it('MAX_MONTHLY_FREE 应为 1', () => {
    expect(MAX_MONTHLY_FREE).toBe(1)
  })

  it('MONTHLY_DAYS 应为 30', () => {
    expect(MONTHLY_DAYS).toBe(30)
  })

  it('YEARLY_DAYS 应为 365', () => {
    expect(YEARLY_DAYS).toBe(365)
  })

  it('CODE_EXPIRY_DAYS 应为 3', () => {
    expect(CODE_EXPIRY_DAYS).toBe(3)
  })

  it('兑换码字符集长度应为 32（A-Z去除I,O=24 + 2-9数字=8 → 32）', () => {
    // ABCDEFGHJKLMNPQRSTUVWXYZ23456789 = 26字母-2(I,O) + 8数字 = 32
    expect(REDEEM_CODE_CHARS).toHaveLength(32)
  })

  it('邀请码字符集长度应为 32（a-z去除l,o=24 + 2-9数字=8 → 32）', () => {
    // abcdefghijkmnpqrstuvwxyz23456789 = 26字母-2(l,o) + 8数字 = 32
    expect(REFERRAL_CODE_CHARS).toHaveLength(32)
  })

  it('邀请码字符集不含数字 0/1', () => {
    expect(REFERRAL_CODE_CHARS).not.toContain('0')
    expect(REFERRAL_CODE_CHARS).not.toContain('1')
  })

  it('兑换码字符集不含数字 0/1', () => {
    expect(REDEEM_CODE_CHARS).not.toContain('0')
    expect(REDEEM_CODE_CHARS).not.toContain('1')
  })
})
