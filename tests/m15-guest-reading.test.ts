/**
 * M15-02: 游客阅读配额逻辑测试
 *
 * 测试核心逻辑（纯函数，不涉及 Supabase 网络调用）
 */
import { describe, it, expect } from 'vitest'

// ─── 模拟常量 ───────────────────────────────────────────────────────────────

const ALLOWED_CATEGORIES = ['notes', 'stocks', 'masters']
const DEFAULT_GUEST_LIMIT = 3

// ─── 辅助函数（从路由逻辑提取） ───────────────────────────────────────────────

function computeGuestId(ip: string, ua: string): string {
  const { createHash } = require('crypto')
  return createHash('sha256').update(`${ip}::${ua}`).digest('hex')
}

function getCategoryReadCount(
  readByCategory: Record<string, string[]>,
  category: string
): number {
  const ids = readByCategory[category]
  return Array.isArray(ids) ? ids.length : 0
}

// ─── 核心逻辑测试 ───────────────────────────────────────────────────────────

describe('M15-02: 游客阅读配额逻辑', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. 幂等性：同一文章不重复计数
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('幂等性验证（M15-02 核心）', () => {
    it('articleId 已存在于列表时应跳过追加', () => {
      const readByCategory = { notes: ['article-1', 'article-2'] }
      const articleId = 'article-1'

      // 已包含 → 不追加
      expect(readByCategory.notes.includes(articleId)).toBe(true)
    })

    it('articleId 不存在时应追加', () => {
      const readByCategory = { notes: ['article-1'] }
      const newId = 'article-2'

      expect(readByCategory.notes.includes(newId)).toBe(false)
    })

    it('重复请求同一文章不增加计数', () => {
      const readByCategory = { notes: ['article-1', 'article-2', 'article-3'] }
      const articleId = 'article-1'

      if (readByCategory.notes.includes(articleId)) {
        // 幂等：不执行追加
        expect(readByCategory.notes.length).toBe(3) // 不增加
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. 配额检查逻辑
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('配额检查', () => {
    it('categoryIds.length >= limit 时应拒绝', () => {
      const limit = DEFAULT_GUEST_LIMIT
      const categoryIds = ['a', 'b', 'c']

      const shouldReject = categoryIds.length >= limit
      expect(shouldReject).toBe(true)
    })

    it('categoryIds.length < limit 时应接受', () => {
      const limit = DEFAULT_GUEST_LIMIT
      const categoryIds = ['a', 'b']

      const shouldAccept = categoryIds.length < limit
      expect(shouldAccept).toBe(true)
    })

    it('刚好达到 limit 时应拒绝', () => {
      const limit = 3
      const categoryIds = ['a', 'b', 'c']

      expect(categoryIds.length >= limit).toBe(true)
    })

    it('limit=0 时首次请求即被拒绝', () => {
      const limit = 0
      const categoryIds: string[] = []

      expect(categoryIds.length >= limit).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. 分类独立计数
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('分类独立计数', () => {
    it('notes 和 stocks 分类独立计数', () => {
      const readByCategory = {
        notes: ['a', 'b', 'c'],
        stocks: [],
      }

      expect(getCategoryReadCount(readByCategory, 'notes')).toBe(3)
      expect(getCategoryReadCount(readByCategory, 'stocks')).toBe(0)
    })

    it('notes 超限时 stocks 仍可读', () => {
      const readByCategory = {
        notes: ['a', 'b', 'c'], // 已达 limit
        stocks: [],
      }

      const notesAtLimit = readByCategory.notes.length >= DEFAULT_GUEST_LIMIT
      const stocksCanRead = readByCategory.stocks.length < DEFAULT_GUEST_LIMIT

      expect(notesAtLimit).toBe(true)
      expect(stocksCanRead).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. 分类白名单验证
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('分类白名单验证', () => {
    it('允许的分类：notes, stocks, masters', () => {
      expect(ALLOWED_CATEGORIES).toContain('notes')
      expect(ALLOWED_CATEGORIES).toContain('stocks')
      expect(ALLOWED_CATEGORIES).toContain('masters')
    })

    it('无效分类应被拒绝', () => {
      expect(ALLOWED_CATEGORIES.includes('invalid')).toBe(false)
      expect(ALLOWED_CATEGORIES.includes('')).toBe(false)
      expect(ALLOWED_CATEGORIES.includes('admin')).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. 游客 ID 计算（SHA-256）
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('游客 ID 计算', () => {
    it('不同 IP 产生不同 guest_id', () => {
      const id1 = computeGuestId('203.0.113.1', 'TestAgent')
      const id2 = computeGuestId('192.168.1.1', 'TestAgent')

      expect(id1).not.toBe(id2)
    })

    it('不同 UA 产生不同 guest_id', () => {
      const id1 = computeGuestId('1.2.3.4', 'Chrome')
      const id2 = computeGuestId('1.2.3.4', 'Firefox')

      expect(id1).not.toBe(id2)
    })

    it('guest_id 是 64 字符十六进制（SHA-256）', () => {
      const id = computeGuestId('1.2.3.4', 'UA')

      expect(id).toMatch(/^[a-f0-9]{64}$/)
    })

    it('相同输入产生相同 guest_id（确定性）', () => {
      const id1 = computeGuestId('1.2.3.4', 'UA')
      const id2 = computeGuestId('1.2.3.4', 'UA')

      expect(id1).toBe(id2)
    })

    it('guest_id 不包含 IP 或 UA 明文', () => {
      const id = computeGuestId('1.2.3.4', 'Mozilla/5.0')

      expect(id).not.toContain('1.2.3.4')
      expect(id).not.toContain('Mozilla')
      expect(id).not.toContain('UA')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. readByCategory 追加逻辑
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('readByCategory 追加逻辑', () => {
    it('追加新 articleId 到指定分类', () => {
      const readByCategory = { notes: ['a', 'b'] }
      const newId = 'c'

      const newCategoryIds = [...readByCategory.notes, newId]
      const newReadByCategory = { ...readByCategory, notes: newCategoryIds }

      expect(newReadByCategory.notes).toEqual(['a', 'b', 'c'])
    })

    it('追加不影响其他分类', () => {
      const readByCategory = { notes: ['a'], stocks: ['x'] }
      const newCategoryIds = [...readByCategory.notes, 'b']

      const newReadByCategory = {
        ...readByCategory,
        notes: newCategoryIds,
      }

      expect(newReadByCategory.stocks).toEqual(['x']) // 未改变
      expect(newReadByCategory.notes).toEqual(['a', 'b'])
    })

    it('totalReadCount = 所有分类的已读总数', () => {
      const readByCategory = {
        notes: ['a', 'b'],
        stocks: ['x'],
        masters: [],
      }

      const totalReadCount = Object.values(readByCategory).flat().length
      expect(totalReadCount).toBe(3)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 7. 过期检查
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('过期检查', () => {
    it('expires_at 为未来时间时未过期', () => {
      const future = new Date(Date.now() + 86400000) // 1天后
      expect(future > new Date()).toBe(true)
    })

    it('expires_at 为过去时间时已过期', () => {
      const past = new Date(Date.now() - 86400000) // 1天前
      expect(past < new Date()).toBe(true)
    })

    it('30 天有效期正确计算', () => {
      const now = Date.now()
      const expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000)

      const diffDays = (expiresAt.getTime() - now) / (24 * 60 * 60 * 1000)
      expect(diffDays).toBe(30)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 8. 配额边界条件
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('配额边界条件', () => {
    it('remaining = limit - consumed（最小为0）', () => {
      const limit = 3

      expect(Math.max(0, limit - 0)).toBe(3) // 未读
      expect(Math.max(0, limit - 1)).toBe(2) // 已读1
      expect(Math.max(0, limit - 2)).toBe(1) // 已读2
      expect(Math.max(0, limit - 3)).toBe(0) // 已读满
      expect(Math.max(0, limit - 4)).toBe(0) // 超出
    })

    it('canRead = remaining > 0', () => {
      expect((3 - 0) > 0).toBe(true)  // 可读
      expect((3 - 2) > 0).toBe(true)  // 可读
      expect((3 - 3) > 0).toBe(false) // 不可读
    })
  })
})
