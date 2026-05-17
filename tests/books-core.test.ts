/**
 * 书籍功能核心单元测试
 *
 * 覆盖：
 * 1. generateBookPassword()  — 格式、字符集、唯一性
 * 2. verifyBookPassword()    — 大小写兼容、空白处理、空值
 * 3. canDownloadFree()       — 全权限矩阵（4 tiers × 3 levels）
 * 4. WATERMARK_TEXT          — 常量存在且包含品牌信息
 * 5. BOOK_ACCESS_LEVEL_LABELS — 枚举标签完整性
 */

import { describe, it, expect } from 'vitest'
import {
  generateBookPassword,
  verifyBookPassword,
  canDownloadFree,
  WATERMARK_TEXT,
  BOOK_ACCESS_LEVEL_LABELS,
} from '../lib/books'
import { MEMBER_TIERS } from '../lib/member-tiers'

// ═══════════════════════════════════════════════════════════════
// 1. generateBookPassword
// ═══════════════════════════════════════════════════════════════
describe('generateBookPassword()', () => {
  it('格式应为 RFYR-XXXX', () => {
    const pwd = generateBookPassword()
    expect(pwd).toMatch(/^RFYR-[A-Z0-9]{4}$/)
  })

  it('不包含易混淆字符 0/O/1/I/L', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateBookPassword().slice(5) // 去掉 "RFYR-"
      expect(code).not.toMatch(/[0O1IL]/)
    }
  })

  it('多次调用结果应不相同（高概率）', () => {
    const passwords = new Set(Array.from({ length: 50 }, generateBookPassword))
    // 50 个密码中重复概率极低（字符集32^4 = 1048576 种组合）
    expect(passwords.size).toBeGreaterThan(45)
  })

  it('总长度应为 9（RFYR- 5位 + 4位码）', () => {
    expect(generateBookPassword()).toHaveLength(9)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. verifyBookPassword
// ═══════════════════════════════════════════════════════════════
describe('verifyBookPassword()', () => {
  it('完全相同应返回 true', () => {
    expect(verifyBookPassword('RFYR-A2K9', 'RFYR-A2K9')).toBe(true)
  })

  it('输入小写、存储大写应返回 true（大小写不敏感）', () => {
    expect(verifyBookPassword('rfyr-a2k9', 'RFYR-A2K9')).toBe(true)
  })

  it('输入带首尾空格应返回 true（trim 处理）', () => {
    expect(verifyBookPassword('  RFYR-A2K9  ', 'RFYR-A2K9')).toBe(true)
  })

  it('密码错误应返回 false', () => {
    expect(verifyBookPassword('RFYR-XXXX', 'RFYR-A2K9')).toBe(false)
  })

  it('空字符串与任意密码不匹配', () => {
    expect(verifyBookPassword('', 'RFYR-A2K9')).toBe(false)
  })

  it('空格字符串与任意密码不匹配', () => {
    expect(verifyBookPassword('   ', 'RFYR-A2K9')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. canDownloadFree — 完整权限矩阵
// ═══════════════════════════════════════════════════════════════
describe('canDownloadFree()', () => {
  // ── yearly（年卡）─────────────────────────────────────────
  describe('yearly 用户', () => {
    it('可免密下载 monthly 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.YEARLY, 'monthly')).toBe(true)
    })
    it('可免密下载 yearly 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.YEARLY, 'yearly')).toBe(true)
    })
    it('可免密下载 free 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.YEARLY, 'free')).toBe(true)
    })
  })

  // ── permanent（永久会员，等同 yearly）──────────────────────
  describe('permanent 用户', () => {
    it('可免密下载 monthly 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.PERMANENT, 'monthly')).toBe(true)
    })
    it('可免密下载 yearly 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.PERMANENT, 'yearly')).toBe(true)
    })
    it('可免密下载 free 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.PERMANENT, 'free')).toBe(true)
    })
  })

  // ── monthly（月卡）────────────────────────────────────────
  describe('monthly 用户', () => {
    it('可免密下载 monthly 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.MONTHLY, 'monthly')).toBe(true)
    })
    it('可免密下载 free 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.MONTHLY, 'free')).toBe(true)
    })
    it('不可免密下载 yearly 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.MONTHLY, 'yearly')).toBe(false)
    })
  })

  // ── none（普通/未登录）────────────────────────────────────
  describe('none 用户', () => {
    it('不可免密下载 monthly 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.NONE, 'monthly')).toBe(false)
    })
    it('不可免密下载 yearly 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.NONE, 'yearly')).toBe(false)
    })
    it('不可免密下载 free 级别书', () => {
      expect(canDownloadFree(MEMBER_TIERS.NONE, 'free')).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. WATERMARK_TEXT
// ═══════════════════════════════════════════════════════════════
describe('WATERMARK_TEXT', () => {
  it('应包含品牌名称', () => {
    expect(WATERMARK_TEXT).toContain('日富一日')
  })

  it('应包含域名', () => {
    expect(WATERMARK_TEXT).toContain('rfyr.club')
  })

  it('不应为空字符串', () => {
    expect(WATERMARK_TEXT.trim().length).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. BOOK_ACCESS_LEVEL_LABELS
// ═══════════════════════════════════════════════════════════════
describe('BOOK_ACCESS_LEVEL_LABELS', () => {
  it('应包含全部三个访问级别的标签', () => {
    expect(BOOK_ACCESS_LEVEL_LABELS.free).toBeTruthy()
    expect(BOOK_ACCESS_LEVEL_LABELS.monthly).toBeTruthy()
    expect(BOOK_ACCESS_LEVEL_LABELS.yearly).toBeTruthy()
  })

  it('monthly 标签应包含"月"字', () => {
    expect(BOOK_ACCESS_LEVEL_LABELS.monthly).toContain('月')
  })

  it('yearly 标签应包含"年"字', () => {
    expect(BOOK_ACCESS_LEVEL_LABELS.yearly).toContain('年')
  })
})
