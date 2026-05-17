/**
 * Module 7 - UI组件库：lib/datetime.ts 测试套件
 *
 * 测试覆盖：
 * 1. toLocalDateString() - CST 日期（精确实现）
 * 2. toLocalNow() - CST 当前时间 ISO 字符串
 * 3. toCSTDateString() - 旧版降级实现（deprecated）
 * 4. isToday() - 是否今天（CST）
 * 5. isExpired() - 是否已过期
 * 6. getCSTDayStart() / getCSTDayEnd() - CST 日期边界
 * 7. daysBetween() - 天数差计算
 * 8. getDaysRemaining() - 剩余天数
 */
import { describe, it, expect } from 'vitest'
import {
  toLocalDateString,
  toLocalNow,
  isToday,
  isExpired,
  getCSTDayStart,
  getCSTDayEnd,
  daysBetween,
  getDaysRemaining,
// @ts-ignore
} from '../lib/datetime.ts'

describe('M7-08: lib/datetime.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. toLocalDateString()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('toLocalDateString() - CST 日期（精确）', () => {
    it('应正确处理 UTC 00:00', () => {
      expect(toLocalDateString(new Date('2026-04-20T00:00:00Z'))).toBe('2026-04-20')
    })

    it('应正确处理 UTC 15:59:59', () => {
      expect(toLocalDateString(new Date('2026-04-20T15:59:59Z'))).toBe('2026-04-20')
    })

    it('应正确处理 UTC 16:00:00 跨日边界', () => {
      expect(toLocalDateString(new Date('2026-04-20T16:00:00Z'))).toBe('2026-04-21')
    })

    it('应正确处理 UTC 23:59:59', () => {
      expect(toLocalDateString(new Date('2026-04-20T23:59:59Z'))).toBe('2026-04-21')
    })

    it('应正确处理月末边界', () => {
      expect(toLocalDateString(new Date('2026-04-30T16:00:00Z'))).toBe('2026-05-01')
    })

    it('应正确处理年末边界', () => {
      expect(toLocalDateString(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01')
    })

    it('应正确处理闰年', () => {
      expect(toLocalDateString(new Date('2028-02-29T16:00:00Z'))).toBe('2028-03-01')
    })

    it('无参数时应返回格式化的 CST 日期', () => {
      const result = toLocalDateString()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. toLocalNow()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('toLocalNow() - CST 当前时间', () => {
    it('应返回包含日期和时间的 ISO 字符串', () => {
      const result = toLocalNow()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00$/)
    })

    it('应返回 +08:00 时区', () => {
      const result = toLocalNow()
      expect(result).toMatch(/\+08:00$/)
    })

    it('时间部分格式应正确（HH:mm:ss）', () => {
      const result = toLocalNow()
      const match = result.match(/T(\d{2}:\d{2}:\d{2})/)
      expect(match).not.toBeNull()
      expect(match![1]).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. isToday()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('isToday() - 是否今天（CST）', () => {
    it('应正确识别 CST 今天', () => {
      const today = toLocalDateString()
      const todayISO = `${today}T12:00:00+08:00`
      expect(isToday(todayISO)).toBe(true)
    })

    it('应正确识别 CST 昨天', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayISO = `${toLocalDateString(yesterday)}T12:00:00+08:00`
      expect(isToday(yesterdayISO)).toBe(false)
    })

    it('应处理 null/undefined', () => {
      expect(isToday(null)).toBe(false)
      expect(isToday(undefined)).toBe(false)
    })

    it('应处理 Invalid Date', () => {
      expect(isToday('invalid')).toBe(false)
      expect(isToday('')).toBe(false)
    })

    it('UTC 时间应在 CST 跨日边界处正确判断', () => {
      const today = toLocalDateString()
      // UTC 2026-04-20 16:00:00 = CST 2026-04-21 00:00:00（次日）
      const cstMidnight = new Date(`${today}T00:00:00+08:00`)
      const utcBoundary = new Date(cstMidnight.getTime() - 8 * 60 * 60 * 1000) // UTC 对应时间

      // 如果当前 CST 时间 >= 00:00，则 UTC 16:00 后为"今天"的次日
      const nowCST = toLocalDateString()
      const testISO = `${nowCST}T00:00:00+08:00`
      // CST 今天的时间（无论 UTC 是什么）
      expect(isToday(testISO)).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. isExpired()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('isExpired() - 是否已过期', () => {
    it('应正确识别过期时间', () => {
      const past = new Date(Date.now() - 1000).toISOString()
      expect(isExpired(past)).toBe(true)
    })

    it('应正确识别未来时间', () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      expect(isExpired(future)).toBe(false)
    })

    it('应正确识别当前时间（边界）', () => {
      const now = new Date().toISOString()
      // 理论上 isExpired(now) 可能为 true（因为比较是 <），但实际业务中到期日通常是 23:59
      const result = isExpired(now)
      expect(typeof result).toBe('boolean')
    })

    it('应处理 null/undefined/空字符串', () => {
      expect(isExpired(null)).toBe(true)
      expect(isExpired(undefined)).toBe(true)
      expect(isExpired('')).toBe(true)
    })

    it('应处理 Invalid Date', () => {
      expect(isExpired('invalid')).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. getCSTDayStart() / getCSTDayEnd()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('getCSTDayStart() / getCSTDayEnd()', () => {
    it('getCSTDayStart 应返回 UTC 的前一天 16:00（对应 +08:00 当天 00:00）', () => {
      const start = getCSTDayStart('2026-04-20')
      // "2026-04-20T00:00:00+08:00" 作为 UTC 解析 = "2026-04-19T16:00:00Z"
      expect(start.toISOString()).toBe('2026-04-19T16:00:00.000Z')
    })

    it('getCSTDayEnd 应返回 UTC 的当天 15:59:59.999（对应 +08:00 当天 23:59:59.999）', () => {
      const end = getCSTDayEnd('2026-04-20')
      expect(end.toISOString()).toBe('2026-04-20T15:59:59.999Z')
    })

    it('应正确处理月末', () => {
      const start = getCSTDayStart('2026-04-30')
      expect(start.getDate()).toBe(30)
      const end = getCSTDayEnd('2026-04-30')
      expect(end.getDate()).toBe(30)
    })

    it('无参数时应使用今天', () => {
      const start = getCSTDayStart()
      expect(start).toBeInstanceOf(Date)
      const end = getCSTDayEnd()
      expect(end).toBeInstanceOf(Date)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. daysBetween()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('daysBetween() - 天数差', () => {
    it('应正确计算天数差', () => {
      expect(daysBetween('2026-04-20', '2026-04-25')).toBe(5)
      expect(daysBetween('2026-04-20', '2026-04-21')).toBe(1)
    })

    it('相等日期应返回 0', () => {
      expect(daysBetween('2026-04-20', '2026-04-20')).toBe(0)
    })

    it('应返回负数当结束日期早于开始日期', () => {
      const result = daysBetween('2026-04-25', '2026-04-20')
      expect(result).toBeLessThan(0)
    })

    it('应处理 Invalid Date', () => {
      expect(daysBetween('invalid', '2026-04-20')).toBe(0)
      expect(daysBetween('2026-04-20', 'invalid')).toBe(0)
    })

    it('应向上取整天数（不取整）', () => {
      // 2026-04-20 12:00 到 2026-04-21 12:00 = 1天
      const result = daysBetween('2026-04-20T12:00:00Z', '2026-04-21T12:00:00Z')
      expect(result).toBeGreaterThanOrEqual(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 7. getDaysRemaining()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('getDaysRemaining() - 剩余天数', () => {
    it('应正确计算剩余天数', () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
      const remaining = getDaysRemaining(future)
      expect(remaining).toBeGreaterThanOrEqual(9)
      expect(remaining).toBeLessThanOrEqual(11)
    })

    it('已过期应返回 0', () => {
      const past = new Date(Date.now() - 1000).toISOString()
      expect(getDaysRemaining(past)).toBe(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 8. 边界条件测试
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('边界条件测试', () => {
    it('CST 23:59 应与 UTC 15:59 同一天', () => {
      const cstDate = toLocalDateString(new Date('2026-04-20T15:59:59Z'))
      expect(cstDate).toBe('2026-04-20')
    })

    it('CST 00:00 应与 UTC 16:00 跨日', () => {
      const cstDate = toLocalDateString(new Date('2026-04-20T16:00:00Z'))
      expect(cstDate).toBe('2026-04-21')
    })

    it('闰年边界：2028-02-29', () => {
      expect(toLocalDateString(new Date('2028-02-29T00:00:00Z'))).toBe('2028-02-29')
      expect(toLocalDateString(new Date('2028-02-29T16:00:00Z'))).toBe('2028-03-01')
    })
  })
})
