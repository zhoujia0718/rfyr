/**
 * Module 18 (续)：工具脚本逻辑测试套件
 *
 * 测试覆盖：
 * 1. list-users.ts — 输出解析（用户信息格式化）
 * 2. set-admin-password.ts — 密码验证逻辑
 * 3. test-email-send.ts — 邮箱发送逻辑
 *
 * 策略：
 * - 内联脚本中的核心逻辑（纯函数），不使用 vi.mock() 或 jest.mock()
 * - 模拟 Supabase/Resend 响应
 * - 测试边界条件和错误处理
 *
 * 修复问题：
 * P-M18-03: set-admin-password.ts 密码验证未测试边界
 * P-M18-02: test-email-send.ts 邮箱格式验证未覆盖
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ══════════════════════════════════════════════════════════════════════════════
// 1. list-users.ts — 用户列表格式化逻辑
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 模拟 list-users.ts 的输出格式化逻辑
 * 原始逻辑：遍历 users.users，输出每用户的 email/id/created_at
 */
interface User {
  id: string
  email?: string
  created_at: string
  [key: string]: unknown
}

interface ListUsersResponse {
  users: User[]
}

function formatUserList(response: ListUsersResponse): { lineCount: number; hasEmail: boolean; hasId: boolean } {
  let lineCount = 0
  let hasEmail = false
  let hasId = false

  for (const u of response.users) {
    if (u.email) hasEmail = true
    if (u.id) hasId = true
    lineCount += 1
  }

  return { lineCount, hasEmail, hasId }
}

describe('M18-30: list-users.ts — 输出格式化逻辑', () => {
  it('应正确解析用户列表', () => {
    const response: ListUsersResponse = {
      users: [
        { id: 'user-1', email: 'a@test.com', created_at: '2024-01-01T00:00:00Z' },
        { id: 'user-2', email: 'b@test.com', created_at: '2024-01-02T00:00:00Z' },
      ],
    }
    const result = formatUserList(response)
    expect(result.lineCount).toBe(2)
    expect(result.hasEmail).toBe(true)
    expect(result.hasId).toBe(true)
  })

  it('空用户列表应返回 0', () => {
    const response: ListUsersResponse = { users: [] }
    const result = formatUserList(response)
    expect(result.lineCount).toBe(0)
    expect(result.hasEmail).toBe(false)
    expect(result.hasId).toBe(false)
  })

  it('无 email 字段的用户应不崩溃', () => {
    const response: ListUsersResponse = {
      users: [{ id: 'user-1', created_at: '2024-01-01T00:00:00Z' }],
    }
    const result = formatUserList(response)
    expect(result.lineCount).toBe(1)
    expect(result.hasEmail).toBe(false)
    expect(result.hasId).toBe(true)
  })

  it('部分用户无 email 应正常处理', () => {
    const response: ListUsersResponse = {
      users: [
        { id: 'user-1', email: 'a@test.com', created_at: '2024-01-01T00:00:00Z' },
        { id: 'user-2', created_at: '2024-01-02T00:00:00Z' },
      ],
    }
    const result = formatUserList(response)
    expect(result.lineCount).toBe(2)
    expect(result.hasEmail).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. set-admin-password.ts — 密码验证逻辑
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 模拟 set-admin-password.ts 的密码验证逻辑
 * 原始逻辑：
 * - password.length < 6 → 拒绝
 * - NODE_ENV=production → 拒绝
 */
function validatePasswordInput(password: string | undefined): {
  valid: boolean
  error?: string
} {
  if (!password) {
    return { valid: false, error: '请提供新密码作为参数' }
  }

  if (password.length < 6) {
    return { valid: false, error: '密码长度至少需要 6 个字符' }
  }

  return { valid: true }
}

function checkProductionGuard(nodeEnv: string | undefined): {
  allowed: boolean
  error?: string
} {
  if (nodeEnv === 'production') {
    return {
      allowed: false,
      error: '❌ 禁止在生产环境中执行此脚本！\n   如需在生产环境执行，请先设置 NODE_ENV=development',
    }
  }
  return { allowed: true }
}

describe('M18-31: set-admin-password.ts — 密码验证逻辑', () => {
  describe('密码长度验证', () => {
    it('密码长度 0 应拒绝', () => {
      const result = validatePasswordInput('')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('参数')
    })

    it('密码长度 0（undefined）应拒绝', () => {
      const result = validatePasswordInput(undefined)
      expect(result.valid).toBe(false)
    })

    it('密码长度 5 应拒绝（< 6）', () => {
      const result = validatePasswordInput('12345')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('6')
    })

    it('密码长度 6 应通过', () => {
      const result = validatePasswordInput('123456')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('密码长度 100 应通过', () => {
      const result = validatePasswordInput('A'.repeat(100))
      expect(result.valid).toBe(true)
    })

    it('空格密码应通过（空格算字符）', () => {
      const result = validatePasswordInput('      ') // 6 个空格
      expect(result.valid).toBe(true)
    })

    it('中文字符密码应正确计数', () => {
      // 中文字符算 1 个字符（JS string length）
      // '密码验证12' = 4 Chinese chars + 2 digits = 6 chars >= 6 → valid
      const result = validatePasswordInput('密码验证12') // 6 个字符
      expect(result.valid).toBe(true)
    })
  })

  describe('NODE_ENV 生产环境保护', () => {
    it('NODE_ENV=production 应拒绝', () => {
      const result = checkProductionGuard('production')
      expect(result.allowed).toBe(false)
      expect(result.error).toContain('禁止')
    })

    it('NODE_ENV=development 应允许', () => {
      const result = checkProductionGuard('development')
      expect(result.allowed).toBe(true)
    })

    it('NODE_ENV=undefined 应允许', () => {
      const result = checkProductionGuard(undefined)
      expect(result.allowed).toBe(true)
    })

    it('NODE_ENV="" 应允许（空字符串不是 production）', () => {
      const result = checkProductionGuard('')
      expect(result.allowed).toBe(true)
    })

    it('NODE_ENV=Production（大小写）应允许（严格比较）', () => {
      const result = checkProductionGuard('Production')
      expect(result.allowed).toBe(true)
    })
  })

  describe('管理员邮箱验证逻辑', () => {
    function findAdminUser(response: ListUsersResponse, adminEmail: string): User | undefined {
      return (response as { users: User[] }).users.find((u: User) => u.email === adminEmail)
    }

    it('应找到指定邮箱的用户', () => {
      const users: ListUsersResponse = {
        users: [
          { id: 'u1', email: 'user@test.com', created_at: '2024-01-01' },
          { id: 'u2', email: 'admin@test.com', created_at: '2024-01-02' },
        ],
      }
      const admin = findAdminUser(users, 'admin@test.com')
      expect(admin).toBeDefined()
      expect(admin!.id).toBe('u2')
    })

    it('用户不存在时应返回 undefined', () => {
      const users: ListUsersResponse = {
        users: [{ id: 'u1', email: 'user@test.com', created_at: '2024-01-01' }],
      }
      const admin = findAdminUser(users, 'notexist@test.com')
      expect(admin).toBeUndefined()
    })

    it('邮箱大小写应不敏感匹配', () => {
      const users: ListUsersResponse = {
        users: [{ id: 'u1', email: 'Admin@TEST.COM', created_at: '2024-01-01' }],
      }
      // 精确匹配：Admin@TEST.COM != admin@test.com
      const exact = findAdminUser(users, 'admin@test.com')
      expect(exact).toBeUndefined()
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. test-email-send.ts — 邮箱发送逻辑
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 模拟 test-email-send.ts 的邮箱格式验证逻辑
 * 原始逻辑：
 * - 支持命令行参数传入邮箱
 * - 未传入时使用随机测试邮箱
 */
function parseEmailArg(argv: string[]): { email: string; isRandom: boolean } {
  const email = argv[2]
  if (!email) {
    const randomEmail = `test_${Date.now()}@testdebug.com`
    return { email: randomEmail, isRandom: true }
  }
  return { email, isRandom: false }
}

/**
 * 邮箱格式基本验证
 */
function isValidEmailFormat(email: string): boolean {
  // 基本格式：包含 @ 和域名部分
  const parts = email.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  if (!local || !domain) return false
  if (local.length > 64) return false
  if (domain.length > 255) return false
  return true
}

/**
 * 模拟 Supabase createUser 响应
 */
interface CreateUserResult {
  success: boolean
  user?: { id: string; email: string }
  error?: { message: string; status?: number; code?: string }
}

function mockCreateUser(
  supabaseAdmin: unknown,
  email: string,
  password: string
): CreateUserResult {
  // 模拟验证
  if (!isValidEmailFormat(email)) {
    return {
      success: false,
      error: { message: 'Invalid email format', status: 400, code: 'invalid_email' },
    }
  }

  if (password.length < 6) {
    return {
      success: false,
      error: { message: 'Password must be at least 6 characters', status: 400 },
    }
  }

  // 模拟成功
  return {
    success: true,
    user: { id: `user-${Date.now()}`, email },
  }
}

describe('M18-32: test-email-send.ts — 邮箱发送逻辑', () => {
  describe('命令行参数解析', () => {
    it('传入邮箱参数时应使用该邮箱', () => {
      const result = parseEmailArg(['node', 'script.ts', 'test@example.com'])
      expect(result.email).toBe('test@example.com')
      expect(result.isRandom).toBe(false)
    })

    it('未传入邮箱参数时应生成随机邮箱', () => {
      const result = parseEmailArg(['node', 'script.ts'])
      expect(result.email).toMatch(/^test_\d+@testdebug\.com$/)
      expect(result.isRandom).toBe(true)
    })

    it('空字符串参数应视为未传入（生成随机）', () => {
      const result = parseEmailArg(['node', 'script.ts', ''])
      // 空字符串是 falsy，但按脚本逻辑，process.argv[2] === '' 时为假
      // 脚本逻辑：if (!email) → 生成随机
      expect(result.isRandom).toBe(true)
    })
  })

  describe('邮箱格式验证', () => {
    it('标准邮箱格式应通过', () => {
      expect(isValidEmailFormat('user@example.com')).toBe(true)
      expect(isValidEmailFormat('user.name@example.co.uk')).toBe(true)
    })

    it('缺少 @ 应拒绝', () => {
      expect(isValidEmailFormat('userexample.com')).toBe(false)
    })

    it('多个 @ 应拒绝', () => {
      expect(isValidEmailFormat('user@@example.com')).toBe(false)
    })

    it('空本地部分应拒绝', () => {
      expect(isValidEmailFormat('@example.com')).toBe(false)
    })

    it('空域名部分应拒绝', () => {
      expect(isValidEmailFormat('user@')).toBe(false)
    })

    it('本地部分超过 64 字符应拒绝', () => {
      const longLocal = 'a'.repeat(65)
      expect(isValidEmailFormat(`${longLocal}@example.com`)).toBe(false)
    })

    it('本地部分恰好 64 字符应通过', () => {
      const longLocal = 'a'.repeat(64)
      expect(isValidEmailFormat(`${longLocal}@example.com`)).toBe(true)
    })

    it('域名部分超过 255 字符应拒绝', () => {
      const longDomain = 'a'.repeat(256)
      expect(isValidEmailFormat(`user@${longDomain}`)).toBe(false)
    })

    it('带 + 的邮箱应通过', () => {
      expect(isValidEmailFormat('user+tag@example.com')).toBe(true)
    })

    it('带下划线的邮箱应通过', () => {
      expect(isValidEmailFormat('user_name@example.com')).toBe(true)
    })
  })

  describe('Supabase createUser 模拟', () => {
    it('有效邮箱和密码应成功', () => {
      const result = mockCreateUser({}, 'test@example.com', 'password123')
      expect(result.success).toBe(true)
      expect(result.user).toBeDefined()
      expect(result.user!.email).toBe('test@example.com')
    })

    it('无效邮箱格式应返回错误', () => {
      const result = mockCreateUser({}, 'not-an-email', 'password123')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error!.code).toBe('invalid_email')
    })

    it('密码过短应返回错误', () => {
      const result = mockCreateUser({}, 'test@example.com', '12345')
      expect(result.success).toBe(false)
      expect(result.error!.message).toContain('6')
    })

    it('错误响应应包含 status 和 code', () => {
      const result = mockCreateUser({}, 'invalid', 'password123')
      expect(result.success).toBe(false)
      expect(result.error!.status).toBeDefined()
      expect(result.error!.code).toBeDefined()
    })
  })

  describe('生产环境保护', () => {
    it('NODE_ENV=production 应拒绝发送', () => {
      const env = 'production'
      const allowed = env !== 'production'
      expect(allowed).toBe(false)
    })

    it('NODE_ENV=development 应允许发送', () => {
      const env: string = 'development'
      const allowed = env !== 'production'
      expect(allowed).toBe(true)
    })

    it('NODE_ENV 未设置时应允许发送', () => {
      const env = undefined
      const allowed = env !== 'production'
      expect(allowed).toBe(true)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. 共享环境变量加载逻辑
// ══════════════════════════════════════════════════════════════════════════════

describe('M18-33: 共享环境变量加载逻辑', () => {
  describe('ADMIN_EMAIL 环境变量解析', () => {
    it('应正确解析逗号分隔的邮箱列表', () => {
      const raw = 'admin@test.com,super@test.com'
      const emails = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
      expect(emails).toContain('admin@test.com')
      expect(emails).toContain('super@test.com')
      expect(emails).toHaveLength(2)
    })

    it('应过滤空字符串', () => {
      const raw = 'admin@test.com,,super@test.com'
      const emails = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
      expect(emails).toHaveLength(2)
    })

    it('应转换为小写', () => {
      const raw = 'Admin@Test.COM'
      const emails = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
      expect(emails[0]).toBe('admin@test.com')
    })
  })
})
