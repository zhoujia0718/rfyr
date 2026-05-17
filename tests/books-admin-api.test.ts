/**
 * 书籍管理后台 API 逻辑单元测试
 *
 * 覆盖：
 * 1. generateBookPassword 批量生成（rotate-passwords 逻辑）
 * 2. access_level 校验逻辑
 * 3. 允许更新字段白名单
 * 4. 密码不出现在批量更新入参（download_password 不可通过 PATCH 直接改）
 * 5. 文件路径安全校验（isSafeObjectPath 等价逻辑）
 */

import { describe, it, expect } from 'vitest'
import { generateBookPassword, type BookAccessLevel } from '../lib/books'

// ═══════════════════════════════════════════════════════════════
// 1. 批量密码生成（rotate-passwords 等价逻辑）
// ═══════════════════════════════════════════════════════════════
describe('批量生成密码（rotate-passwords 逻辑）', () => {
  it('应为每本书生成不同密码', () => {
    const bookIds = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5']
    const updates = bookIds.map((id) => ({ id, newPassword: generateBookPassword() }))

    const passwords = updates.map((u) => u.newPassword)
    const unique = new Set(passwords)
    // 5 本书的密码应全部不同（极高概率）
    expect(unique.size).toBe(bookIds.length)
  })

  it('生成的密码应全部符合格式', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateBookPassword()).toMatch(/^RFYR-[A-Z0-9]{4}$/)
    }
  })

  it('空书籍列表返回空数组', () => {
    const books: { id: string; title: string }[] = []
    const result = books.map((b) => ({ id: b.id, newPassword: generateBookPassword() }))
    expect(result).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. access_level 校验
// ═══════════════════════════════════════════════════════════════
describe('access_level 校验逻辑', () => {
  const VALID_LEVELS: BookAccessLevel[] = ['free', 'monthly', 'yearly']

  function validateAccessLevel(input: unknown): BookAccessLevel {
    if (VALID_LEVELS.includes(input as BookAccessLevel)) {
      return input as BookAccessLevel
    }
    return 'monthly' // 默认值
  }

  it('有效值 monthly 应通过', () => {
    expect(validateAccessLevel('monthly')).toBe('monthly')
  })

  it('有效值 yearly 应通过', () => {
    expect(validateAccessLevel('yearly')).toBe('yearly')
  })

  it('有效值 free 应通过', () => {
    expect(validateAccessLevel('free')).toBe('free')
  })

  it('无效值应降级为 monthly', () => {
    expect(validateAccessLevel('admin')).toBe('monthly')
    expect(validateAccessLevel('')).toBe('monthly')
    expect(validateAccessLevel(null)).toBe('monthly')
    expect(validateAccessLevel(undefined)).toBe('monthly')
    expect(validateAccessLevel(123)).toBe('monthly')
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. 允许更新的字段白名单
// ═══════════════════════════════════════════════════════════════
describe('PATCH 字段白名单', () => {
  const ALLOWED_FIELDS = ['title', 'author', 'description', 'cover_url', 'file_path', 'access_level', 'sort_order', 'published'] as const

  function filterAllowedUpdates(body: Record<string, unknown>): Record<string, unknown> {
    const updates: Record<string, unknown> = {}
    for (const field of ALLOWED_FIELDS) {
      if (field in body) updates[field] = body[field]
    }
    return updates
  }

  it('download_password 不在白名单中（不可通过 PATCH 直接修改）', () => {
    const body = { title: '新书名', download_password: '攻击者注入的密码' }
    const updates = filterAllowedUpdates(body)
    expect('download_password' in updates).toBe(false)
  })

  it('id / created_at / updated_at 不在白名单中', () => {
    const body = { id: 'hack', created_at: '2000-01-01', updated_at: '2000-01-01', title: 'ok' }
    const updates = filterAllowedUpdates(body)
    expect('id' in updates).toBe(false)
    expect('created_at' in updates).toBe(false)
    expect('updated_at' in updates).toBe(false)
    expect(updates.title).toBe('ok')
  })

  it('白名单字段应被正确透传', () => {
    const body = { title: '测试书', author: '作者', access_level: 'yearly', published: false }
    const updates = filterAllowedUpdates(body)
    expect(updates.title).toBe('测试书')
    expect(updates.author).toBe('作者')
    expect(updates.access_level).toBe('yearly')
    expect(updates.published).toBe(false)
  })

  it('空对象应返回空更新（0个字段）', () => {
    expect(Object.keys(filterAllowedUpdates({}))).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. 文件路径安全校验（与 storage-upload/route.ts 一致的逻辑）
// ═══════════════════════════════════════════════════════════════
describe('文件路径安全校验', () => {
  function isSafeObjectPath(path: string): boolean {
    if (!path || path.length > 1024 || path.includes('..') || path.startsWith('/')) return false
    return /^[a-zA-Z0-9._\-/]+$/.test(path)
  }

  it('正常路径应通过', () => {
    expect(isSafeObjectPath('books/1234567890_test.pdf')).toBe(true)
    expect(isSafeObjectPath('books/my-book_v2.pdf')).toBe(true)
  })

  it('路径遍历 .. 应拒绝', () => {
    expect(isSafeObjectPath('../etc/passwd')).toBe(false)
    expect(isSafeObjectPath('books/../secret.pdf')).toBe(false)
  })

  it('绝对路径应拒绝', () => {
    expect(isSafeObjectPath('/etc/passwd')).toBe(false)
  })

  it('空字符串应拒绝', () => {
    expect(isSafeObjectPath('')).toBe(false)
  })

  it('包含特殊字符应拒绝', () => {
    expect(isSafeObjectPath('books/test file.pdf')).toBe(false) // 空格
    expect(isSafeObjectPath('books/<script>.pdf')).toBe(false)
    expect(isSafeObjectPath('books/test;rm.pdf')).toBe(false)
  })

  it('超长路径应拒绝', () => {
    expect(isSafeObjectPath('a'.repeat(1025))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. POST 请求体必填字段校验
// ═══════════════════════════════════════════════════════════════
describe('POST 请求体校验', () => {
  function validateCreateBody(body: Record<string, unknown>): string | null {
    const title = String(body.title ?? '').trim()
    const filePath = String(body.file_path ?? '').trim()
    if (!title) return '书名不能为空'
    if (!filePath) return 'file_path 不能为空'
    return null // 通过
  }

  it('title 和 file_path 都存在时应通过', () => {
    expect(validateCreateBody({ title: '测试书', file_path: 'books/test.pdf' })).toBeNull()
  })

  it('缺少 title 应返回错误', () => {
    expect(validateCreateBody({ file_path: 'books/test.pdf' })).toBe('书名不能为空')
    expect(validateCreateBody({ title: '', file_path: 'books/test.pdf' })).toBe('书名不能为空')
    expect(validateCreateBody({ title: '  ', file_path: 'books/test.pdf' })).toBe('书名不能为空')
  })

  it('缺少 file_path 应返回错误', () => {
    expect(validateCreateBody({ title: '测试书' })).toBe('file_path 不能为空')
    expect(validateCreateBody({ title: '测试书', file_path: '' })).toBe('file_path 不能为空')
  })

  it('空 body 应返回 title 错误', () => {
    expect(validateCreateBody({})).toBe('书名不能为空')
  })
})
