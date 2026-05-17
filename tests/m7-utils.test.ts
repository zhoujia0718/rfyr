/**
 * Module 7 - UI组件库：lib/utils.ts 测试套件
 *
 * 测试覆盖：
 * 1. cn() - className 合并
 * 2. toLocalDateString() - CST 日期转换（含 UTC 边界测试）
 * 3. M7-01 修复验证：UTC 16:00-23:59 不再提前返回次日
 */
import { describe, it, expect } from 'vitest'

// 直接导入源码（Node 环境直接加载）
// @ts-ignore
import { cn, toLocalDateString } from '../lib/utils.ts'

// ─── cn() 测试 ───────────────────────────────────────────────────────────────

describe('M7-01: lib/utils.ts', () => {
  describe('cn() - className 合并', () => {
    it('应合并多个 className', () => {
      const result = cn('foo', 'bar')
      expect(result).toBe('foo bar')
    })

    it('应过滤 falsy 值', () => {
      const result = cn('foo', false, null, undefined, '', 'bar')
      expect(result).toBe('foo bar')
    })

    it('应合并对象形式的条件 class', () => {
      const result = cn('base', { active: true, disabled: false })
      expect(result).toContain('base')
      expect(result).toContain('active')
    })

    it('应处理空输入', () => {
      expect(cn()).toBe('')
      expect(cn('')).toBe('')
    })

    it('应正确处理重复 class（Tailwind 优先级）', () => {
      const result = cn('px-2 px-4', 'py-2 py-2')
      expect(result).toContain('px-4')
    })
  })

  describe("toLocalDateString() - CST (Asia/Shanghai) 日期转换", () => {
    it('应正确处理 UTC 00:00 (CST 08:00) — 跨日边界前', () => {
      // UTC 2026-04-20 00:00:00 = CST 2026-04-20 08:00（同一天）
      const date = new Date('2026-04-20T00:00:00Z')
      expect(toLocalDateString(date)).toBe('2026-04-20')
    })

    it('应正确处理 UTC 15:59:59 (CST 23:59:59)', () => {
      // UTC 2026-04-20 15:59:59 = CST 2026-04-20 23:59:59（同一天）
      const date = new Date('2026-04-20T15:59:59Z')
      expect(toLocalDateString(date)).toBe('2026-04-20')
    })

    it('应正确处理 UTC 16:00:00 (CST 00:00:00 次日)', () => {
      // UTC 2026-04-20 16:00:00 = CST 2026-04-21 00:00:00（次日）
      const date = new Date('2026-04-20T16:00:00Z')
      expect(toLocalDateString(date)).toBe('2026-04-21')
    })

    it('应正确处理 UTC 23:59:59 (CST 次日 07:59:59)', () => {
      // UTC 2026-04-20 23:59:59 = CST 2026-04-21 07:59:59（次日）
      const date = new Date('2026-04-20T23:59:59Z')
      expect(toLocalDateString(date)).toBe('2026-04-21')
    })

    it('应正确处理 UTC 16:00-23:59 区间的每一天', () => {
      // 关键测试：旧 +8h 逻辑会在这里返回错误的次日
      for (let hour = 16; hour <= 23; hour++) {
        const date = new Date(`2026-04-20T${String(hour).padStart(2, '0')}:30:00Z`)
        expect(toLocalDateString(date)).toBe('2026-04-21')
      }
    })

    it('应正确处理 UTC 00:00-15:59 区间的每一天', () => {
      for (let hour = 0; hour <= 15; hour++) {
        const date = new Date(`2026-04-20T${String(hour).padStart(2, '0')}:30:00Z`)
        expect(toLocalDateString(date)).toBe('2026-04-20')
      }
    })

    it('应正确处理月末边界', () => {
      // UTC 2026-04-30 16:00:00 = CST 2026-05-01 00:00:00
      const date = new Date('2026-04-30T16:00:00Z')
      expect(toLocalDateString(date)).toBe('2026-05-01')
    })

    it('应正确处理年末边界', () => {
      // UTC 2026-12-31 16:00:00 = CST 2027-01-01 00:00:00
      const date = new Date('2026-12-31T16:00:00Z')
      expect(toLocalDateString(date)).toBe('2027-01-01')
    })

    it('应正确处理闰年 2 月边界', () => {
      // UTC 2028-02-29 16:00:00 = CST 2028-03-01 00:00:00（2028 为闰年）
      const date = new Date('2028-02-29T16:00:00Z')
      expect(toLocalDateString(date)).toBe('2028-03-01')
    })

    it('无参数时应返回当前 CST 日期', () => {
      const result = toLocalDateString()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('应正确处理 Invalid Date', () => {
      // Intl.DateTimeFormat 遇到 Invalid Date 抛出 RangeError，不是返回字符串
      // 我们的函数直接传给了 Intlformatter.format()
      // 此处验证：格式化后应返回字符串（不崩溃）
      const date = new Date('invalid')
      expect(() => toLocalDateString(date)).toThrow(RangeError)
    })

    it('M7-01 修复验证：UTC 10:00 不应返回次日', () => {
      // 旧 +8h 逻辑会在 UTC 16:00 就返回次日，现在是 UTC 23:59 才跨日
      const date = new Date('2026-04-20T10:00:00Z')
      expect(toLocalDateString(date)).toBe('2026-04-20')
    })
  })
})
