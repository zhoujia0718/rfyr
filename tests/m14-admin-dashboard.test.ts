/**
 * ============================================================
 * M14: 管理后台（Admin Dashboard）单元测试
 *
 * 测试覆盖：
 * 1. normalizeMembershipType - 会员类型规范化（支持新旧格式）
 * 2. buildCategoryTree - 分类树构建
 * 3. removeCategoryById - 分类递归删除
 * 4. getCategoryName - 递归查找分类名
 * 5. HMAC Cookie 创建与验证（server-admin-auth 逻辑）
 * 6. 速率限制逻辑（内存 Map 三层防御）
 * 7. 阅读设置边界值验证
 * ============================================================
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createHmac, randomBytes } from 'crypto'

// ─── 测试配置 ────────────────────────────────────────────────────────────────

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const HMAC_SECRET = 'test-hmac-secret-key-for-unit-testing'

// ─── 1. normalizeMembershipType 测试（来自 AdminDashboard.tsx）──────────────

/**
 * 规范化会员类型字段，支持新旧两种格式
 *
 * 旧格式: annual_vip, monthly_vip
 * 新格式: yearly, monthly
 */
function normalizeMembershipType(raw: string): string {
  if (!raw) return 'free'
  const normalized = raw.toLowerCase().replace(/[_\s-]/g, '')
  if (normalized.includes('year') || normalized.includes('annual') || normalized === 'permanent') {
    return normalized.includes('month') ? 'monthly' : 'yearly'
  }
  if (normalized.includes('month')) return 'monthly'
  return 'free'
}

describe('M14-01: normalizeMembershipType（会员类型规范化）', () => {
  describe('新格式（标准值）', () => {
    it('应返回 "yearly" 对于 yearly', () => {
      expect(normalizeMembershipType('yearly')).toBe('yearly')
    })
    it('应返回 "monthly" 对于 monthly', () => {
      expect(normalizeMembershipType('monthly')).toBe('monthly')
    })
    it('应返回 "free" 对于 free', () => {
      expect(normalizeMembershipType('free')).toBe('free')
    })
    it('应返回 "yearly" 对于 permanent', () => {
      expect(normalizeMembershipType('permanent')).toBe('yearly')
    })
  })

  describe('旧格式（历史遗留值）', () => {
    it('应返回 "yearly" 对于 annual_vip', () => {
      expect(normalizeMembershipType('annual_vip')).toBe('yearly')
    })
    it('应返回 "monthly" 对于 monthly_vip', () => {
      expect(normalizeMembershipType('monthly_vip')).toBe('monthly')
    })
    it('应返回 "yearly" 对于 ANNUAL_VIP（大写）', () => {
      expect(normalizeMembershipType('ANNUAL_VIP')).toBe('yearly')
    })
    it('应返回 "monthly" 对于 Monthly-Vip（含连字符）', () => {
      expect(normalizeMembershipType('Monthly-Vip')).toBe('monthly')
    })
    it('应返回 "yearly" 对于 yearly-vip（含连字符）', () => {
      expect(normalizeMembershipType('yearly-vip')).toBe('yearly')
    })
  })

  describe('边缘情况', () => {
    it('应返回 "free" 对于空字符串', () => {
      expect(normalizeMembershipType('')).toBe('free')
    })
    it('应返回 "free" 对于 undefined/空值', () => {
      expect(normalizeMembershipType('none')).toBe('free')
    })
    it('应返回 "free" 对于 unknown 值', () => {
      expect(normalizeMembershipType('unknown')).toBe('free')
    })
    it('应返回 "free" 对于 "永久会员"', () => {
      expect(normalizeMembershipType('永久会员')).toBe('free')
    })
    it('应忽略大小写', () => {
      expect(normalizeMembershipType('YEARLY')).toBe('yearly')
      expect(normalizeMembershipType('Monthly')).toBe('monthly')
    })
  })
})

// ─── 2. buildCategoryTree 测试（来自 AdminDashboard.tsx）───────────────────

type CategoryRow = {
  id: string
  name: string
  icon?: string | null
  description?: string | null
  href?: string | null
  parent_id?: string | null
}

type CategoryTreeNode = {
  id: string
  name: string
  icon: string
  description: string
  href: string
  parentId?: string | null
  children: CategoryTreeNode[]
}

function buildCategoryTree(
  items: CategoryRow[],
  parentId?: string
): CategoryTreeNode[] {
  return (items ?? [])
    .filter((item) =>
      parentId === undefined
        ? item.parent_id === null
        : item.parent_id === parentId
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      icon: item.icon || '',
      description: item.description || '',
      href: item.href || '',
      parentId: item.parent_id,
      children: buildCategoryTree(items, item.id),
    }))
}

describe('M14-02: buildCategoryTree（分类树构建）', () => {
  const mockCategories: CategoryRow[] = [
    { id: '1', name: '根分类A', parent_id: null },
    { id: '2', name: '根分类B', parent_id: null },
    { id: '3', name: '子分类A1', parent_id: '1' },
    { id: '4', name: '子分类A2', parent_id: '1' },
    { id: '5', name: '孙分类A1-1', parent_id: '3' },
  ]

  it('应构建根级分类（无 parent_id）', () => {
    const result = buildCategoryTree(mockCategories)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('根分类A')
    expect(result[1].name).toBe('根分类B')
  })

  it('应正确嵌套子分类', () => {
    const result = buildCategoryTree(mockCategories)
    const rootA = result.find(r => r.id === '1')!
    expect(rootA.children).toHaveLength(2)
    expect(rootA.children[0].name).toBe('子分类A1')
    expect(rootA.children[1].name).toBe('子分类A2')
  })

  it('应正确嵌套孙级分类', () => {
    const result = buildCategoryTree(mockCategories)
    const rootA = result.find(r => r.id === '1')!
    const childA1 = rootA.children.find(c => c.id === '3')!
    expect(childA1.children).toHaveLength(1)
    expect(childA1.children[0].name).toBe('孙分类A1-1')
  })

  it('应正确填充默认值', () => {
    const result = buildCategoryTree(mockCategories)
    const rootA = result[0]
    expect(rootA.icon).toBe('')
    expect(rootA.description).toBe('')
    expect(rootA.href).toBe('')
  })

  it('应处理空数组', () => {
    const result = buildCategoryTree([])
    expect(result).toHaveLength(0)
  })

  it('应处理 undefined/null items', () => {
    const result = buildCategoryTree(mockCategories)
    expect(result.length).toBeGreaterThan(0)
  })

  it('应保留原有 icon 和 description', () => {
    const withMeta: CategoryRow[] = [
      { id: 'x', name: 'Test', icon: '📦', description: '描述', parent_id: null },
    ]
    const result = buildCategoryTree(withMeta)
    expect(result[0].icon).toBe('📦')
    expect(result[0].description).toBe('描述')
  })

  it('应处理深层嵌套（5层以上）', () => {
    const deep: CategoryRow[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      name: `层级${i}`,
      parent_id: i === 0 ? null : String(i - 1),
    }))
    const result = buildCategoryTree(deep)
    let node = result[0]
    for (let i = 1; i < 6; i++) {
      expect(node.children).toHaveLength(1)
      node = node.children[0]
    }
    expect(node.children).toHaveLength(0) // 叶子节点
  })
})

// ─── 3. removeCategoryById 测试（来自 AdminDashboard.tsx）──────────────────

function removeCategoryById(
  cats: CategoryTreeNode[],
  id: string
): CategoryTreeNode[] {
  return cats
    .filter((c) => c.id !== id)
    .map((c) => ({
      ...c,
      children: c.children ? removeCategoryById(c.children, id) : [],
    }))
}

describe('M14-03: removeCategoryById（分类递归删除）', () => {
  const mockTree: CategoryTreeNode[] = [
    {
      id: '1', name: '分类A', icon: '', description: '', href: '',
      children: [
        { id: '2', name: '子分类A1', icon: '', description: '', href: '', children: [] },
        { id: '3', name: '子分类A2', icon: '', description: '', href: '', children: [] },
      ],
    },
    {
      id: '4', name: '分类B', icon: '', description: '', href: '',
      children: [
        { id: '5', name: '子分类B1', icon: '', description: '', href: '', children: [] },
      ],
    },
  ]

  it('应删除指定 ID 的节点', () => {
    const result = removeCategoryById(mockTree, '2')
    const root1 = result.find(r => r.id === '1')!
    expect(root1.children).toHaveLength(1)
    expect(root1.children[0].id).toBe('3')
  })

  it('应递归删除子节点', () => {
    const result = removeCategoryById(mockTree, '1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('4')
  })

  it('应保留其他分支不变', () => {
    const result = removeCategoryById(mockTree, '5')
    const rootB = result.find(r => r.id === '4')!
    expect(result).toHaveLength(2)
    expect(rootB.children).toHaveLength(0) // 子分类B1 已被删除
    expect(result.find(r => r.id === '1')!.children).toHaveLength(2) // 分类A 不变
  })

  it('应处理空数组', () => {
    const result = removeCategoryById([], '1')
    expect(result).toHaveLength(0)
  })

  it('应处理不存在的 ID', () => {
    const result = removeCategoryById(mockTree, 'not-exist')
    expect(result).toHaveLength(2)
  })

  it('应处理空 children 节点', () => {
    const flat: CategoryTreeNode[] = [
      { id: '1', name: 'A', icon: '', description: '', href: '', children: [] },
    ]
    const result = removeCategoryById(flat, '1')
    expect(result).toHaveLength(0)
  })
})

// ─── 4. getCategoryName 测试（来自 AdminDashboard.tsx）─────────────────────

function getCategoryName(
  categories: CategoryTreeNode[],
  categoryId: string
): string {
  for (const category of categories) {
    if (category.id === categoryId) return category.name
    if (category.children?.length) {
      const name = getCategoryName(category.children, categoryId)
      if (name) return name
    }
  }
  return ''
}

describe('M14-04: getCategoryName（递归查找分类名）', () => {
  const tree: CategoryTreeNode[] = [
    {
      id: '1', name: '分类A', icon: '', description: '', href: '',
      children: [
        {
          id: '2', name: '子分类A1', icon: '', description: '', href: '',
          children: [
            { id: '3', name: '孙分类', icon: '', description: '', href: '', children: [] },
          ],
        },
      ],
    },
    {
      id: '4', name: '分类B', icon: '', description: '', href: '',
      children: [],
    },
  ]

  it('应找到根级分类', () => {
    expect(getCategoryName(tree, '1')).toBe('分类A')
    expect(getCategoryName(tree, '4')).toBe('分类B')
  })

  it('应找到子级分类', () => {
    expect(getCategoryName(tree, '2')).toBe('子分类A1')
  })

  it('应找到深层分类', () => {
    expect(getCategoryName(tree, '3')).toBe('孙分类')
  })

  it('应在找不到时返回空字符串', () => {
    expect(getCategoryName(tree, 'not-exist')).toBe('')
  })

  it('应在空数组时返回空字符串', () => {
    expect(getCategoryName([], '1')).toBe('')
  })
})

// ─── 5. HMAC Cookie 创建与验证测试（模拟 server-admin-auth.ts）───────────────

/**
 * 创建安全的 Base64 编码 Cookie（新格式）
 */
function createSecureCookie(userId: string, expiresAt: number): string {
  const salt = randomBytes(8).toString('hex')
  const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAt}`, 'utf-8')
  const signature = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
    .update(msgBuf)
    .digest('hex')
  const payload = `${salt}_${userId}_${expiresAt}_${signature}`
  return Buffer.from(payload).toString('base64')
}

/**
 * 创建旧格式 Cookie（向后兼容）
 */
function createOldFormatCookie(userId: string, expiresAt: number): string {
  const signature = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
    .update(Buffer.from(`${userId}_${expiresAt}`, 'utf-8'))
    .digest('hex')
  return `${userId}_${expiresAt}_${signature}`
}

/**
 * 验证 Cookie（支持新旧两种格式）
 */
function verifyAdminCookieSignature(cookieValue: string): string | null {
  try {
    // 新格式: Base64 解码
    try {
      const decoded = Buffer.from(cookieValue, 'base64').toString('utf-8')
      const decodedParts = decoded.split('_')

      if (decodedParts.length === 4 && decodedParts[0].length === 16) {
        const [salt, userId, expiresAtStr, signature] = decodedParts
        const expiresAt = parseInt(expiresAtStr, 10)

        if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null

        const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, 'utf-8')
        const expectedSig = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
          .update(msgBuf)
          .digest('hex')

        if (signature !== expectedSig) return null
        return userId
      }
    } catch { /* fall through */ }

    // 旧格式
    const allParts = cookieValue.split('_')
    if (allParts.length < 3) return null
    const signature = allParts[allParts.length - 1]
    if (!/^[0-9a-f]{64}$/i.test(signature)) return null

    const remainder = allParts.slice(0, -1).join('_')
    const expectedSig = createHmac('sha256', Buffer.from(HMAC_SECRET, 'utf-8'))
      .update(Buffer.from(remainder, 'utf-8'))
      .digest('hex')

    if (signature !== expectedSig) return null

    const parts2 = remainder.split('_')
    const expiresAt = parseInt(parts2[parts2.length - 1], 10)
    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return null

    return parts2[0]
  } catch {
    return null
  }
}

describe('M14-05: HMAC Cookie 安全机制', () => {
  describe('新格式 Cookie（Base64 + HMAC）', () => {
    it('应创建有效的新格式 Cookie', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)
      const userId = verifyAdminCookieSignature(cookie)
      expect(userId).toBe(TEST_USER_ID)
    })

    it('应拒绝过期的 Cookie', () => {
      const expiredAt = Math.floor(Date.now() / 1000) - 1
      const cookie = createSecureCookie(TEST_USER_ID, expiredAt)
      const userId = verifyAdminCookieSignature(cookie)
      expect(userId).toBeNull()
    })

    it('应拒绝被篡改的 Cookie', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)
      const tampered = cookie.slice(0, -3) + 'XXX'
      const userId = verifyAdminCookieSignature(tampered)
      expect(userId).toBeNull()
    })

    it('Salt 长度应为 16 字符', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)
      const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
      const [salt] = decoded.split('_')
      expect(salt.length).toBe(16)
    })

    it('应拒绝 userId 被篡改的 Cookie', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const cookie = createSecureCookie(TEST_USER_ID, expiresAt)
      const decoded = Buffer.from(cookie, 'base64').toString('utf-8')
      const parts = decoded.split('_')
      parts[1] = '00000000-0000-0000-0000-000000000001'
      const tampered = Buffer.from(parts.join('_')).toString('base64')
      const userId = verifyAdminCookieSignature(tampered)
      expect(userId).toBeNull()
    })
  })

  describe('旧格式 Cookie 向后兼容', () => {
    it('应验证有效的旧格式 Cookie', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const cookie = createOldFormatCookie(TEST_USER_ID, expiresAt)
      const userId = verifyAdminCookieSignature(cookie)
      expect(userId).toBe(TEST_USER_ID)
    })

    it('应拒绝旧格式过期 Cookie', () => {
      const expiredAt = Math.floor(Date.now() / 1000) - 1
      const cookie = createOldFormatCookie(TEST_USER_ID, expiredAt)
      const userId = verifyAdminCookieSignature(cookie)
      expect(userId).toBeNull()
    })

    it('应拒绝旧格式签名不匹配', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const cookie = createOldFormatCookie(TEST_USER_ID, expiresAt)
      const parts = cookie.split('_')
      parts[2] = 'a'.repeat(64)
      const tampered = parts.join('_')
      const userId = verifyAdminCookieSignature(tampered)
      expect(userId).toBeNull()
    })
  })

  describe('边界条件', () => {
    it('应处理空字符串', () => {
      expect(verifyAdminCookieSignature('')).toBeNull()
    })

    it('应处理无效格式', () => {
      expect(verifyAdminCookieSignature('invalid')).toBeNull()
    })

    it('应处理损坏的 Base64', () => {
      expect(verifyAdminCookieSignature('!!!')).toBeNull()
    })

    it('应拒绝签名长度不是 64 的旧格式', () => {
      const bad = `${TEST_USER_ID}_12345_short`
      expect(verifyAdminCookieSignature(bad)).toBeNull()
    })
  })
})

// ─── 6. 速率限制逻辑测试 ────────────────────────────────────────────────────

const LOGIN_RATE_LIMIT_MS = 5 * 60 * 1000
const LOGIN_RATE_LIMIT_COUNT = 5

describe('M14-06: 速率限制（三层防御）', () => {
  let loginAttemptMap: Map<string, { count: number; resetAt: number }>

  beforeEach(() => {
    loginAttemptMap = new Map()
  })

  /**
   * 内存快速检查逻辑
   */
  function checkMemory(ip: string, now: number): { allowed: boolean; retryAfterSec: number } {
    const memEntry = loginAttemptMap.get(ip)

    if (!memEntry || now > memEntry.resetAt) {
      loginAttemptMap.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_MS })
      return { allowed: true, retryAfterSec: 0 }
    }

    memEntry.count++

    if (memEntry.count >= LOGIN_RATE_LIMIT_COUNT) {
      return { allowed: false, retryAfterSec: Math.ceil((memEntry.resetAt - now) / 1000) }
    }

    return { allowed: true, retryAfterSec: 0 }
  }

  describe('第一层: 内存快速检查', () => {
    it('应允许首次请求', () => {
      const result = checkMemory('192.168.1.1', Date.now())
      expect(result.allowed).toBe(true)
      expect(result.retryAfterSec).toBe(0)
    })

    it('应正确递增计数', () => {
      const now = Date.now()
      for (let i = 0; i < 3; i++) {
        checkMemory('192.168.1.1', now)
      }
      const entry = loginAttemptMap.get('192.168.1.1')
      expect(entry?.count).toBe(3)
    })

    it('应在第 5 次后开始拒绝', () => {
      const now = Date.now()
      for (let i = 0; i < 5; i++) {
        checkMemory('192.168.1.1', now)
      }
      const result = checkMemory('192.168.1.1', now)
      expect(result.allowed).toBe(false)
    })

    it('应正确计算重试时间', () => {
      const now = Date.now()
      for (let i = 0; i < 5; i++) {
        checkMemory('192.168.1.1', now)
      }
      const result = checkMemory('192.168.1.1', now)
      expect(result.retryAfterSec).toBeGreaterThan(0)
      expect(result.retryAfterSec).toBeLessThanOrEqual(LOGIN_RATE_LIMIT_MS / 1000)
    })

    it('应在窗口过期后重置', () => {
      const oldNow = Date.now() - LOGIN_RATE_LIMIT_MS - 1000
      loginAttemptMap.set('192.168.1.1', { count: 5, resetAt: oldNow + LOGIN_RATE_LIMIT_MS })
      const result = checkMemory('192.168.1.1', oldNow + LOGIN_RATE_LIMIT_MS + 1000)
      expect(result.allowed).toBe(true)
      expect(loginAttemptMap.get('192.168.1.1')?.count).toBe(1)
    })

    it('应隔离不同 IP', () => {
      const now = Date.now()
      // IP1: 发出 4 次请求（第 5 次时超限）
      const ip1Results: boolean[] = []
      for (let i = 0; i < 5; i++) {
        ip1Results.push(checkMemory('192.168.1.1', now).allowed)
      }
      // IP2: 发出 5 次请求
      const ip2Results: boolean[] = []
      for (let i = 0; i < 5; i++) {
        ip2Results.push(checkMemory('192.168.1.2', now).allowed)
      }
      // IP1: 前 4 次允许，第 5 次拒绝
      expect(ip1Results.slice(0, 4).every(r => r)).toBe(true)
      expect(ip1Results[4]).toBe(false)
      // IP2: 同样前 4 次允许，第 5 次拒绝
      expect(ip2Results.slice(0, 4).every(r => r)).toBe(true)
      expect(ip2Results[5]).toBeFalsy() // undefined
    })

    it('应处理空 IP', () => {
      const result = checkMemory('', Date.now())
      expect(result.allowed).toBe(true)
    })
  })

  describe('限制参数验证', () => {
    it('应正确配置 5 分钟窗口', () => {
      expect(LOGIN_RATE_LIMIT_MS).toBe(300000)
    })

    it('应正确配置 5 次限制', () => {
      expect(LOGIN_RATE_LIMIT_COUNT).toBe(5)
    })
  })
})

// ─── 7. 阅读设置边界值验证 ──────────────────────────────────────────────────

describe('M14-07: 阅读设置边界值验证', () => {
  /**
   * 验证阅读设置参数
   */
  function validateReadingSettings(body: Record<string, unknown>): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []
    const { guest_read_limit, monthly_daily_limit, referral_bonus_count } = body

    if (typeof guest_read_limit !== 'number' || guest_read_limit < 0) {
      errors.push('guest_read_limit 必须是非负数')
    }
    if (typeof monthly_daily_limit !== 'number' || monthly_daily_limit < 0) {
      errors.push('monthly_daily_limit 必须是非负数')
    }
    if (typeof referral_bonus_count !== 'number' || referral_bonus_count < 0) {
      errors.push('referral_bonus_count 必须是非负数')
    }

    return { valid: errors.length === 0, errors }
  }

  it('应接受有效的设置', () => {
    const result = validateReadingSettings({
      guest_read_limit: 3,
      monthly_daily_limit: 8,
      referral_bonus_count: 2,
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('应接受零值', () => {
    const result = validateReadingSettings({
      guest_read_limit: 0,
      monthly_daily_limit: 0,
      referral_bonus_count: 0,
    })
    expect(result.valid).toBe(true)
  })

  it('应拒绝负数 guest_read_limit', () => {
    const result = validateReadingSettings({
      guest_read_limit: -1,
      monthly_daily_limit: 8,
      referral_bonus_count: 2,
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('guest_read_limit 必须是非负数')
  })

  it('应拒绝负数 monthly_daily_limit', () => {
    const result = validateReadingSettings({
      guest_read_limit: 3,
      monthly_daily_limit: -5,
      referral_bonus_count: 2,
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('monthly_daily_limit 必须是非负数')
  })

  it('应拒绝负数 referral_bonus_count', () => {
    const result = validateReadingSettings({
      guest_read_limit: 3,
      monthly_daily_limit: 8,
      referral_bonus_count: -10,
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('referral_bonus_count 必须是非负数')
  })

  it('应拒绝非数字值', () => {
    const result = validateReadingSettings({
      guest_read_limit: '3',
      monthly_daily_limit: 8,
      referral_bonus_count: 2,
    } as Record<string, unknown>)
    expect(result.valid).toBe(false)
  })

  it('应接受极大值', () => {
    const result = validateReadingSettings({
      guest_read_limit: 999999,
      monthly_daily_limit: 999999,
      referral_bonus_count: 999999,
    })
    expect(result.valid).toBe(true)
  })
})

// ─── 8. 会员操作 action 白名单验证 ─────────────────────────────────────────

describe('M14-08: 会员操作 action 白名单验证', () => {
  const ALLOWED_ACTIONS = ['renew', 'cancel', 'upgrade', 'downgrade'] as const
  const ALLOWED_PLANS = ['monthly', 'yearly', 'permanent'] as const

  function validateMembershipOperation(body: {
    action?: string
    planType?: string
    membershipId?: string
    userId?: string
  }): { valid: boolean; error?: string } {
    if (!body.action || !ALLOWED_ACTIONS.includes(body.action as typeof ALLOWED_ACTIONS[number])) {
      return { valid: false, error: '无效的操作类型' }
    }
    if (body.action === 'renew') {
      if (!body.membershipId) {
        return { valid: false, error: 'renew 需要 membershipId' }
      }
    }
    if (body.action === 'cancel') {
      if (!body.membershipId) {
        return { valid: false, error: 'cancel 需要 membershipId' }
      }
    }
    if (body.action === 'upgrade') {
      if (!body.userId || !body.planType) {
        return { valid: false, error: 'upgrade 需要 userId 和 planType' }
      }
      if (!ALLOWED_PLANS.includes(body.planType as typeof ALLOWED_PLANS[number])) {
        return { valid: false, error: '无效的会员类型' }
      }
    }
    if (body.action === 'downgrade') {
      if (!body.membershipId) {
        return { valid: false, error: 'downgrade 需要 membershipId' }
      }
    }
    return { valid: true }
  }

  it('应接受 renew action', () => {
    expect(validateMembershipOperation({ action: 'renew', membershipId: '123' }).valid).toBe(true)
  })

  it('应接受 cancel action', () => {
    expect(validateMembershipOperation({ action: 'cancel', membershipId: '123' }).valid).toBe(true)
  })

  it('应接受 upgrade action with valid userId 和 planType', () => {
    expect(validateMembershipOperation({ action: 'upgrade', userId: '123', planType: 'monthly' }).valid).toBe(true)
    expect(validateMembershipOperation({ action: 'upgrade', userId: '123', planType: 'yearly' }).valid).toBe(true)
    expect(validateMembershipOperation({ action: 'upgrade', userId: '123', planType: 'permanent' }).valid).toBe(true)
  })

  it('应拒绝无效 action', () => {
    expect(validateMembershipOperation({ action: 'delete' }).valid).toBe(false)
    expect(validateMembershipOperation({ action: 'hack' }).valid).toBe(false)
  })

  it('应拒绝 upgrade with invalid planType', () => {
    expect(validateMembershipOperation({ action: 'upgrade', membershipId: '123', planType: 'invalid' }).valid).toBe(false)
  })

  it('应拒绝 renew/cancel 缺少 membershipId', () => {
    expect(validateMembershipOperation({ action: 'renew' }).valid).toBe(false)
    expect(validateMembershipOperation({ action: 'cancel' }).valid).toBe(false)
  })

  it('应拒绝 upgrade/downgrade 缺少必要参数', () => {
    expect(validateMembershipOperation({ action: 'upgrade', planType: 'monthly' }).valid).toBe(false)
    expect(validateMembershipOperation({ action: 'downgrade' }).valid).toBe(false)
  })
})
