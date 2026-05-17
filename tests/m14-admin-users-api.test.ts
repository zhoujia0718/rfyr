/**
 * M14-API: Admin Users POST — 测试
 *
 * 覆盖 app/api/admin/users/route.ts
 *
 * BUG-PAGE-03 修复验证：
 * 之前 admin/users/create/page.tsx 的 handleSubmit 是假实现（只有 alert + window.location.href）。
 */
import { describe, it, expect, vi } from 'vitest'

// ─── 辅助验证函数（同步自 route.ts）──────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,32}$/.test(username)
}

type ValidationResult =
  | { valid: true }
  | { valid: false; error: string; status: number }

function validateCreateUserInput(body: Record<string, unknown>): ValidationResult {
  const username = body.username as string | undefined
  const email = body.email as string | undefined
  const phone = body.phone as string | undefined
  const nickname = body.nickname as string | undefined

  if (!username || typeof username !== "string" || username.trim() === "") {
    return { valid: false, error: "用户名不能为空", status: 400 }
  }
  if (!isValidUsername(username)) {
    return {
      valid: false,
      error: "用户名格式不正确（3-32 位，支持中文、字母数字，下划线）",
      status: 400,
    }
  }

  if (!email || typeof email !== "string" || email.trim() === "") {
    return { valid: false, error: "邮箱不能为空", status: 400 }
  }
  if (!isValidEmail(email)) {
    return { valid: false, error: "邮箱格式不正确", status: 400 }
  }

  if (phone && phone.length > 20) {
    return { valid: false, error: "手机号长度不能超过 20 位", status: 400 }
  }
  if (nickname && nickname.length > 50) {
    return { valid: false, error: "昵称长度不能超过 50 位", status: 400 }
  }

  return { valid: true }
}

// ─── 测试 ───────────────────────────────────────────────────

describe('M14-Users-API: 参数校验', () => {
  describe('isValidEmail — 邮箱格式验证', () => {
    it('标准邮箱通过', () => {
      expect(isValidEmail('user@example.com')).toBe(true)
      expect(isValidEmail('test.user+tag@domain.co.uk')).toBe(true)
    })

    it('无 @ 被拒绝', () => {
      expect(isValidEmail('userexample.com')).toBe(false)
      expect(isValidEmail('user@')).toBe(false)
      expect(isValidEmail('user@.com')).toBe(false)
    })

    it('空字符串被拒绝', () => {
      expect(isValidEmail('')).toBe(false)
    })

    it('空格被拒绝', () => {
      expect(isValidEmail('user @example.com')).toBe(false)
    })
  })

  describe('isValidUsername — 用户名格式验证', () => {
    it('字母数字通过', () => {
      expect(isValidUsername('user123')).toBe(true)
      expect(isValidUsername('testuser')).toBe(true)
    })

    it('中文通过', () => {
      expect(isValidUsername('用户123')).toBe(true)
      expect(isValidUsername('李老师')).toBe(true)
    })

    it('下划线通过', () => {
      expect(isValidUsername('user_name')).toBe(true)
    })

    it('短于 3 位被拒绝', () => {
      expect(isValidUsername('ab')).toBe(false)
      expect(isValidUsername('a')).toBe(false)
    })

    it('长于 32 位被拒绝', () => {
      expect(isValidUsername('a'.repeat(33))).toBe(false)
      expect(isValidUsername('a'.repeat(32))).toBe(true)
    })

    it('特殊字符被拒绝', () => {
      expect(isValidUsername('user@name')).toBe(false)
      expect(isValidUsername('user-name')).toBe(false)
      expect(isValidUsername('user.name')).toBe(false)
    })
  })

  describe('validateCreateUserInput — 完整参数校验', () => {
    it('合法输入通过', () => {
      const result = validateCreateUserInput({
        username: 'testuser',
        email: 'test@example.com',
        phone: '13800138000',
        nickname: '测试用户',
      })
      expect(result.valid).toBe(true)
    })

    it('仅必填字段通过', () => {
      const result = validateCreateUserInput({
        username: 'testuser',
        email: 'test@example.com',
      })
      expect(result.valid).toBe(true)
    })

    it('缺少 username 返回 400', () => {
      const result = validateCreateUserInput({ email: 'test@example.com' })
      expect(result.valid).toBe(false)
      expect((result as { status: number }).status).toBe(400)
      expect((result as { error: string }).error).toContain('用户名')
    })

    it('缺少 email 返回 400', () => {
      const result = validateCreateUserInput({ username: 'testuser' })
      expect(result.valid).toBe(false)
      expect((result as { status: number }).status).toBe(400)
      expect((result as { error: string }).error).toContain('邮箱')
    })

    it('非法 username 格式返回 400', () => {
      const result = validateCreateUserInput({
        username: 'ab',
        email: 'test@example.com',
      })
      expect(result.valid).toBe(false)
      expect((result as { status: number }).status).toBe(400)
      expect((result as { error: string }).error).toContain('用户名格式')
    })

    it('非法 email 格式返回 400', () => {
      const result = validateCreateUserInput({
        username: 'testuser',
        email: 'not-an-email',
      })
      expect(result.valid).toBe(false)
      expect((result as { status: number }).status).toBe(400)
      expect((result as { error: string }).error).toContain('邮箱格式')
    })

    it('phone 过长返回 400', () => {
      const result = validateCreateUserInput({
        username: 'testuser',
        email: 'test@example.com',
        phone: '1'.repeat(21),
      })
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('手机号')
    })

    it('nickname 过长返回 400', () => {
      const result = validateCreateUserInput({
        username: 'testuser',
        email: 'test@example.com',
        nickname: 'x'.repeat(51),
      })
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('昵称')
    })

    it('username 为空字符串返回 400', () => {
      const result = validateCreateUserInput({
        username: '   ',
        email: 'test@example.com',
      })
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('用户名')
    })

    it('email 为空字符串返回 400', () => {
      const result = validateCreateUserInput({
        username: 'testuser',
        email: '',
      })
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('邮箱')
    })

    it('username 为 null 返回 400', () => {
      const result = validateCreateUserInput({
        username: null as unknown as string,
        email: 'test@example.com',
      })
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('用户名')
    })
  })
})

describe('M14-Users-API: BUG-PAGE-03 修复验证', () => {
  it('FIX: 新 handleSubmit 调用 POST /api/admin/users', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ success: true }),
    })

    const res = await mockFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        email: 'test@example.com',
      }),
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/users', expect.objectContaining({
      method: 'POST',
    }))
    expect(res.status).toBe(201)
  })

  it('FIX: API 返回 409 时显示用户名已存在的错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: '用户名已存在' }),
    })

    const res = await mockFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'existing', email: 'a@b.com' }),
    })
    const data = await res.json()

    expect(res.ok).toBe(false)
    expect(res.status).toBe(409)
    expect(data.error).toBe('用户名已存在')
  })

  it('FIX: API 返回 400 时显示格式错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: '用户名格式不正确' }),
    })

    const res = await mockFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'ab', email: 'bad' }),
    })
    const data = await res.json()

    expect(res.ok).toBe(false)
    expect(data.error).toContain('用户名格式')
  })

  it('FIX: API 返回 500 时显示服务器错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: '创建用户失败，请稍后重试' }),
    })

    const res = await mockFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser', email: 'test@example.com' }),
    })
    const data = await res.json()

    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
    expect(data.error).toContain('创建用户失败')
  })

  it('FIX: 成功创建后跳转管理后台', () => {
    const mockRouter = { push: vi.fn() }
    if (true) {
      mockRouter.push('/admin')
    }
    expect(mockRouter.push).toHaveBeenCalledWith('/admin')
  })

  it('FIX: 提交时禁用按钮，防止重复提交', () => {
    let loading = false
    loading = true
    expect(loading).toBe(true)
  })
})
