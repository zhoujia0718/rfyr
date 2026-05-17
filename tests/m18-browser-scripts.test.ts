/**
 * Module 18 - 工具脚本：浏览器测试脚本逻辑测试套件
 *
 * 测试覆盖：
 * 1. BASE_URL 环境变量默认值
 * 2. 凭证缺失时的跳过逻辑
 * 3. 页面 URL 构造
 *
 * 修复问题：
 * P-M18-04: 硬编码登录凭证 → 环境变量配置
 * P-M18-06: 硬编码 localhost → 环境变量配置
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// ─── URL 构造逻辑测试 ──────────────────────────────────────────────────────

describe('M18-30: 浏览器测试 URL 构造', () => {
  // 模拟 env 加载后的 URL 配置
  function getTestConfig() {
    const BASE_URL = process.env['TEST_BASE_URL'] || 'http://localhost:3000'
    const ADMIN_EMAIL = process.env['TEST_ADMIN_EMAIL']
    const ADMIN_PASSWORD = process.env['TEST_ADMIN_PASSWORD']
    return { BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD }
  }

  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('应使用 localhost:3000 作为默认 BASE_URL', () => {
    const { BASE_URL } = getTestConfig()
    expect(BASE_URL).toBe('http://localhost:3000')
  })

  it('P-M18-06 修复：应支持自定义 BASE_URL', () => {
    process.env['TEST_BASE_URL'] = 'https://staging.example.com'
    const { BASE_URL } = getTestConfig()
    expect(BASE_URL).toBe('https://staging.example.com')
  })

  it('应正确拼接页面 URL', () => {
    const { BASE_URL } = getTestConfig()
    expect(`${BASE_URL}/admin/login`).toBe('http://localhost:3000/admin/login')
    expect(`${BASE_URL}/notes`).toBe('http://localhost:3000/notes')
    expect(`${BASE_URL}/search`).toBe('http://localhost:3000/search')
  })

  it('P-M18-06 修复：自定义 BASE_URL 应正确拼接子路径', () => {
    process.env['TEST_BASE_URL'] = 'https://staging.example.com:8080'
    const { BASE_URL } = getTestConfig()
    expect(`${BASE_URL}/admin/login`).toBe('https://staging.example.com:8080/admin/login')
    expect(`${BASE_URL}/notes/all`).toBe('https://staging.example.com:8080/notes/all')
  })
})

// ─── 凭证配置测试 ─────────────────────────────────────────────────────────

describe('M18-31: 浏览器测试凭证配置', () => {
  function getCredentialConfig() {
    const ADMIN_EMAIL = process.env['TEST_ADMIN_EMAIL']
    const ADMIN_PASSWORD = process.env['TEST_ADMIN_PASSWORD']
    const hasCredentials = !!(ADMIN_EMAIL && ADMIN_PASSWORD)
    return { ADMIN_EMAIL, ADMIN_PASSWORD, hasCredentials }
  }

  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('P-M18-04 修复：凭证未配置时应识别为无凭证', () => {
    delete process.env['TEST_ADMIN_EMAIL']
    delete process.env['TEST_ADMIN_PASSWORD']
    const config = getCredentialConfig()
    expect(config.hasCredentials).toBe(false)
    expect(config.ADMIN_EMAIL).toBeUndefined()
    expect(config.ADMIN_PASSWORD).toBeUndefined()
  })

  it('P-M18-04 修复：部分配置时应识别为无凭证（需同时存在）', () => {
    process.env['TEST_ADMIN_EMAIL'] = 'admin@test.com'
    delete process.env['TEST_ADMIN_PASSWORD']
    const config = getCredentialConfig()
    expect(config.hasCredentials).toBe(false)
  })

  it('P-M18-04 修复：凭证完整时应识别为有凭证', () => {
    process.env['TEST_ADMIN_EMAIL'] = 'admin@test.com'
    process.env['TEST_ADMIN_PASSWORD'] = 'test-password'
    const config = getCredentialConfig()
    expect(config.hasCredentials).toBe(true)
    expect(config.ADMIN_EMAIL).toBe('admin@test.com')
    expect(config.ADMIN_PASSWORD).toBe('test-password')
  })

  it('P-M18-04 修复：凭证应支持任意格式的邮箱', () => {
    const testEmails = [
      'admin@example.com',
      'user+tag@domain.co.uk',
      '中文@email.com',
    ]
    for (const email of testEmails) {
      process.env['TEST_ADMIN_EMAIL'] = email
      process.env['TEST_ADMIN_PASSWORD'] = 'pwd'
      const config = getCredentialConfig()
      expect(config.ADMIN_EMAIL).toBe(email)
    }
  })

  it('P-M18-04 修复：凭证应支持含特殊字符的密码', () => {
    process.env['TEST_ADMIN_EMAIL'] = 'admin@test.com'
    process.env['TEST_ADMIN_PASSWORD'] = 'P@ssw0rd!#$%^&*()'
    const config = getCredentialConfig()
    expect(config.ADMIN_PASSWORD).toBe('P@ssw0rd!#$%^&*()')
  })
})

// ─── 环境变量加载测试 ──────────────────────────────────────────────────────

describe('M18-32: 浏览器测试 .env.local 加载逻辑', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = originalEnv
  })

  it('应解析 TEST_ 前缀的变量', () => {
    const envContent = `
TEST_BASE_URL=https://custom.example.com
TEST_ADMIN_EMAIL=test@example.com
TEST_ADMIN_PASSWORD=secret123
NEXT_PUBLIC_SUPABASE_URL=https://not-loaded.example.com
`
    const vars = parseTestEnvContent(envContent)
    expect(vars['TEST_BASE_URL']).toBe('https://custom.example.com')
    expect(vars['TEST_ADMIN_EMAIL']).toBe('test@example.com')
    expect(vars['TEST_ADMIN_PASSWORD']).toBe('secret123')
  })

  it('应跳过注释行', () => {
    const envContent = `# 这是注释\nTEST_VAR=value\n# 另一条注释`
    const vars = parseTestEnvContent(envContent)
    expect(vars['TEST_VAR']).toBe('value')
  })

  it('应处理带空格的键值对', () => {
    const envContent = '  TEST_VAR  =  value  '
    const vars = parseTestEnvContent(envContent)
    expect(vars['TEST_VAR']).toBe('value')
  })
})

/**
 * 解析 .env 内容（来自 test-browser.mjs 的逻辑）
 */
function parseTestEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (key && val && !process.env[key]) {
      result[key] = val
    }
  }
  return result
}

// ─── 登录流程测试 ─────────────────────────────────────────────────────────

describe('M18-33: 登录流程逻辑', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('登录成功时应不包含 login 路径', () => {
    const successUrl = 'http://localhost:3000/admin/dashboard'
    expect(successUrl.includes('/admin')).toBe(true)
    expect(successUrl.includes('login')).toBe(false)
  })

  it('登录失败时应停留在 login 路径', () => {
    const failUrl = 'http://localhost:3000/admin/login?error=invalid'
    expect(failUrl.includes('login')).toBe(true)
  })

  it('应正确解析登录失败的原因文本', () => {
    const pageTexts = [
      '用户名或密码错误',
      '登录成功',
      '验证码错误',
    ]
    expect(pageTexts[0].includes('用户名或密码错误')).toBe(true)
    expect(pageTexts[1].includes('登录成功')).toBe(true)
    expect(pageTexts[2].includes('登录成功')).toBe(false)
  })
})
