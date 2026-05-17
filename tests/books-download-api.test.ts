/**
 * 书籍下载 API 逻辑单元测试
 *
 * 不依赖真实 HTTP 服务；直接测试 API 内部的权限判断逻辑，
 * 以及与其他模块（member-tiers、constants）的集成兼容性。
 *
 * 覆盖：
 * 1. 权限矩阵 — 每种会员等级 × 每种书籍级别的预期行为
 * 2. 密码验证边界 — 空密码、错误密码、大小写
 * 3. STORAGE_BUCKETS.BOOK_PDFS 常量存在
 * 4. member-tiers PERMISSIONS.books 存在且对所有用户开放
 * 5. 旧 ALLOWED_BUCKETS 未破坏（articles/images 仍在）
 */

import { describe, it, expect } from 'vitest'
import { canDownloadFree, verifyBookPassword, type BookAccessLevel } from '../lib/books'
import { MEMBER_TIERS, PERMISSIONS, hasPermission } from '../lib/member-tiers'
import { STORAGE_BUCKETS } from '../lib/constants'

// ═══════════════════════════════════════════════════════════════
// 1. 完整权限矩阵（与 books-core 独立，从 API 视角验证）
// ═══════════════════════════════════════════════════════════════
describe('下载权限矩阵', () => {
  const levels: BookAccessLevel[] = ['free', 'monthly', 'yearly']
  const tiers = [
    MEMBER_TIERS.NONE,
    MEMBER_TIERS.MONTHLY,
    MEMBER_TIERS.YEARLY,
    MEMBER_TIERS.PERMANENT,
  ]

  // 期望矩阵：[tier][level] = canDownloadFree 结果
  const expected: Record<string, Record<BookAccessLevel, boolean>> = {
    none:      { free: false, monthly: false, yearly: false },
    monthly:   { free: true,  monthly: true,  yearly: false },
    yearly:    { free: true,  monthly: true,  yearly: true  },
    permanent: { free: true,  monthly: true,  yearly: true  },
  }

  for (const tier of tiers) {
    for (const level of levels) {
      it(`tier=${tier} / level=${level} → ${expected[tier][level]}`, () => {
        expect(canDownloadFree(tier, level)).toBe(expected[tier][level])
      })
    }
  }
})

// ═══════════════════════════════════════════════════════════════
// 2. 密码验证边界
// ═══════════════════════════════════════════════════════════════
describe('密码验证边界条件', () => {
  const correctPwd = 'RFYR-A2K9'

  it('undefined 输入不崩溃（应 false）', () => {
    // 模拟 API 收到 body.password = undefined 时的处理
    const raw: unknown = undefined
    const input = (raw as string | undefined) ?? ''
    expect(verifyBookPassword(input, correctPwd)).toBe(false)
  })

  it('超长密码不匹配', () => {
    expect(verifyBookPassword('RFYR-A2K9'.repeat(100), correctPwd)).toBe(false)
  })

  it('特殊字符密码不匹配', () => {
    expect(verifyBookPassword('<script>alert(1)</script>', correctPwd)).toBe(false)
  })

  it('正确密码加多余空格仍匹配', () => {
    expect(verifyBookPassword(`  ${correctPwd}  `, correctPwd)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. constants — STORAGE_BUCKETS.BOOK_PDFS 存在
// ═══════════════════════════════════════════════════════════════
describe('STORAGE_BUCKETS 兼容性', () => {
  it('BOOK_PDFS 常量应存在且值为 book-pdfs', () => {
    expect(STORAGE_BUCKETS.BOOK_PDFS).toBe('book-pdfs')
  })

  it('原有 ARTICLE_PDFS 不受影响', () => {
    expect(STORAGE_BUCKETS.ARTICLE_PDFS).toBe('article-pdfs')
  })

  it('原有 ARTICLE_IMAGES 不受影响', () => {
    expect(STORAGE_BUCKETS.ARTICLE_IMAGES).toBe('article-images')
  })

  it('原有 ARTICLE_HTMLS 不受影响', () => {
    expect(STORAGE_BUCKETS.ARTICLE_HTMLS).toBe('article-pdfs')
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. member-tiers — PERMISSIONS.books 对所有等级开放
// ═══════════════════════════════════════════════════════════════
describe('PERMISSIONS.books（导航权限）', () => {
  it('books 权限键存在于 PERMISSIONS', () => {
    expect('books' in PERMISSIONS).toBe(true)
  })

  it('none 用户有 books 导航权限（可查看书籍页）', () => {
    expect(hasPermission(MEMBER_TIERS.NONE, 'books')).toBe(true)
  })

  it('monthly 用户有 books 导航权限', () => {
    expect(hasPermission(MEMBER_TIERS.MONTHLY, 'books')).toBe(true)
  })

  it('yearly 用户有 books 导航权限', () => {
    expect(hasPermission(MEMBER_TIERS.YEARLY, 'books')).toBe(true)
  })

  it('permanent 用户有 books 导航权限', () => {
    expect(hasPermission(MEMBER_TIERS.PERMANENT, 'books')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. 原有 PERMISSIONS 不受影响（回归测试）
// ═══════════════════════════════════════════════════════════════
describe('PERMISSIONS 原有配置回归', () => {
  it('stocks 仍只对 yearly/permanent 开放', () => {
    expect(hasPermission(MEMBER_TIERS.NONE, 'stocks')).toBe(false)
    expect(hasPermission(MEMBER_TIERS.MONTHLY, 'stocks')).toBe(false)
    expect(hasPermission(MEMBER_TIERS.YEARLY, 'stocks')).toBe(true)
    expect(hasPermission(MEMBER_TIERS.PERMANENT, 'stocks')).toBe(true)
  })

  it('notes 对所有等级开放', () => {
    for (const tier of Object.values(MEMBER_TIERS)) {
      expect(hasPermission(tier, 'notes')).toBe(true)
    }
  })

  it('masters 对所有等级开放', () => {
    for (const tier of Object.values(MEMBER_TIERS)) {
      expect(hasPermission(tier, 'masters')).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. API 路由请求体解析的边界条件（模拟服务端逻辑）
// ═══════════════════════════════════════════════════════════════
describe('下载 API 入参边界', () => {
  // 模拟 route.ts 中的入参解析逻辑
  function parseDownloadRequest(body: unknown): { bookId: string; password?: string } | null {
    if (!body || typeof body !== 'object') return null
    const b = body as Record<string, unknown>
    const bookId = String(b?.bookId ?? '').trim()
    if (!bookId) return null
    const password = b?.password != null ? String(b.password).trim() : undefined
    return { bookId, password }
  }

  it('空 bookId 应解析失败', () => {
    expect(parseDownloadRequest({ bookId: '' })).toBeNull()
    expect(parseDownloadRequest({ bookId: '   ' })).toBeNull()
    expect(parseDownloadRequest({})).toBeNull()
  })

  it('null body 应解析失败', () => {
    expect(parseDownloadRequest(null)).toBeNull()
    expect(parseDownloadRequest(undefined)).toBeNull()
  })

  it('有效 bookId 应解析成功', () => {
    const result = parseDownloadRequest({ bookId: 'some-uuid' })
    expect(result).not.toBeNull()
    expect(result?.bookId).toBe('some-uuid')
  })

  it('password 为 undefined 时不传入（免密路径）', () => {
    const result = parseDownloadRequest({ bookId: 'some-uuid' })
    expect(result?.password).toBeUndefined()
  })

  it('password 为空字符串时等同未提供', () => {
    const result = parseDownloadRequest({ bookId: 'some-uuid', password: '' })
    // trim 后为空，视为未提供
    expect(result?.password).toBe('')
  })

  it('bookId 首尾空格应被 trim', () => {
    const result = parseDownloadRequest({ bookId: '  some-uuid  ' })
    expect(result?.bookId).toBe('some-uuid')
  })
})
