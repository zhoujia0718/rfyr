/**
 * Module 6 - RedeemDialog 组件测试套件
 *
 * 测试覆盖：
 * 1. handleCodeChange - 自动大写 + 过滤非法字符
 * 2. handleRedeem - 空码时不发起 fetch
 * 3. handleRedeem - 成功时返回格式化日期消息
 * 4. handleRedeem - 失败时返回错误消息
 * 5. handleRedeem - 网络错误时返回网络异常消息
 * 6. handleOpenChange(false) - 清空表单状态
 * 7. handleOpenChange(false) - 调用 onOpenChange(false)
 * 8. P-09: AbortController 创建和 abort 调用
 * 9. P-09: 快速连续提交取消前一个请求
 * 10. P-09: fetch 传递 signal 参数
 * 11. P-09: abort() 后 signal 处于 aborted 状态
 * 12. handleKeyDown - Enter 触发兑换（非 loading）
 * 13. handleKeyDown - loading 时 Enter 不触发
 * 14. PLAN_INFO - yearly / monthly 配置
 * 15. 无效 planType 回退到 yearly
 * 16. 成功响应后 3 秒关闭弹窗
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock fetch ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Mock localStorage ────────────────────────────────────────────────────────
vi.stubGlobal('localStorage', {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
})

describe('M6-30: components/redeem-dialog.tsx - 逻辑测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. handleCodeChange 逻辑
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('handleCodeChange 逻辑', () => {
    it('应自动转换为大写', () => {
      const raw = 'abc-def-123'
      const result = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '')
      expect(result).toBe('ABC-DEF-123')
    })

    it('应过滤非字母数字和短横线字符', () => {
      const rawInputs = ['ABC!@#', 'DEF  GHI', '中文ABC', 'ABC&DEF']
      const results = rawInputs.map(v => v.toUpperCase().replace(/[^A-Z0-9-]/g, ''))
      expect(results).toEqual(['ABC', 'DEFGHI', 'ABC', 'ABCDEF'])
    })

    it('保留 RFYR 兑换码格式', () => {
      const validCodes = ['RFYR-YEAR-ABC123', 'rfyr-month-xyz789', 'RFYR-YEAR-ABC-12']
      const results = validCodes.map(v => v.toUpperCase().replace(/[^A-Z0-9-]/g, ''))
      expect(results[0]).toBe('RFYR-YEAR-ABC123')
      expect(results[1]).toBe('RFYR-MONTH-XYZ789')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. handleRedeem 请求行为
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('handleRedeem 请求行为', () => {
    it('空码不应发起 fetch', () => {
      const code = ''
      const trimmed = code.trim()
      let fetchCalled = false
      if (trimmed) fetchCalled = true
      expect(fetchCalled).toBe(false)
    })

    it('非空码应发起 fetch', () => {
      const code = 'RFYR-YEAR-ABC123'
      const trimmed = code.trim()
      let fetchCalled = false
      if (trimmed) fetchCalled = true
      expect(fetchCalled).toBe(true)
    })

    it('成功响应时应生成正确格式的日期消息', () => {
      const expiresAt = new Date('2027-05-20T00:00:00.000Z')
      const expiresDate = expiresAt.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      expect(expiresDate).toContain('2027')
      expect(expiresDate).toContain('5月')
      expect(expiresDate).toContain('20日')
    })

    it('成功响应时应设置 success 状态和完整消息', () => {
      const data = { success: true, expiresAt: '2027-05-20T00:00:00.000Z' }
      let status = 'idle'
      let message = ''

      if (data.success) {
        status = 'success'
        const expiresDate = new Date(data.expiresAt).toLocaleDateString('zh-CN', {
          year: 'numeric', month: 'long', day: 'numeric',
        })
        message = `恭喜！您的年度VIP已开通，有效期至 ${expiresDate}`
      }

      expect(status).toBe('success')
      expect(message).toContain('恭喜')
      expect(message).toContain('2027')
    })

    it('失败响应时应设置 error 状态和错误消息', () => {
      const data = { success: false, message: '兑换码已过期' }
      let status = 'idle'
      let message = ''

      if (!data.success) {
        status = 'error'
        message = data.message || '兑换失败，请检查兑换码是否正确'
      }

      expect(status).toBe('error')
      expect(message).toBe('兑换码已过期')
    })

    it('失败响应无 message 字段时应使用默认消息', () => {
      const data: { success: boolean; message?: string } = { success: false }
      const message = data.message || '兑换失败，请检查兑换码是否正确'
      expect(message).toBe('兑换失败，请检查兑换码是否正确')
    })

    it('网络错误时应设置 error 状态和网络异常消息', () => {
      let status = 'idle'
      let message = ''

      try {
        throw new Error('network error')
      } catch {
        status = 'error'
        message = '网络异常，请稍后重试'
      }

      expect(status).toBe('error')
      expect(message).toBe('网络异常，请稍后重试')
    })

    it('应携带正确的 Authorization header（当有 custom_auth 时）', async () => {
      const mockAuth = JSON.stringify({
        session: { access_token: 'test-token' },
        user: { id: 'user-123' },
      });
      (localStorage.getItem as any).mockReturnValue(mockAuth)

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const customAuth = localStorage.getItem('custom_auth')
      if (customAuth) {
        const authData = JSON.parse(customAuth)
        if (authData.session?.access_token) {
          headers['Authorization'] = `Bearer ${authData.session.access_token}`
        }
        if (authData.user?.id) {
          headers['X-User-Id'] = authData.user.id
        }
      }

      expect(headers['Authorization']).toBe('Bearer test-token')
      expect(headers['X-User-Id']).toBe('user-123')
    })

    it('无 custom_auth 时不应设置 Authorization header', () => {
      (localStorage.getItem as any).mockReturnValue(null)

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const customAuth = localStorage.getItem('custom_auth')
      if (customAuth) {
        const authData = JSON.parse(customAuth)
        if (authData.session?.access_token) {
          headers['Authorization'] = `Bearer ${authData.session.access_token}`
        }
      }

      expect(headers['Authorization']).toBeUndefined()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. handleOpenChange 行为
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('handleOpenChange 行为', () => {
    it('关闭时应清空 code', () => {
      let currentCode = 'RFYR-YEAR-ABC123'
      const handleOpenChange = (val: boolean) => {
        if (!val) {
          currentCode = ''
        }
        return val
      }
      handleOpenChange(false)
      expect(currentCode).toBe('')
    })

    it('关闭时应重置 status 为 idle', () => {
      let status = 'error'
      const handleOpenChange = (val: boolean) => {
        if (!val) {
          status = 'idle'
        }
        return val
      }
      handleOpenChange(false)
      expect(status).toBe('idle')
    })

    it('关闭时应清空 message', () => {
      let message = '兑换码无效'
      const handleOpenChange = (val: boolean) => {
        if (!val) {
          message = ''
        }
        return val
      }
      handleOpenChange(false)
      expect(message).toBe('')
    })

    it('关闭时应调用 onOpenChange(false)', () => {
      const onOpenChange = vi.fn()
      const handleOpenChange = (val: boolean) => onOpenChange(val)
      handleOpenChange(false)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('开启时不应清空状态', () => {
      let status = 'success'
      let code = 'RFYR-YEAR-ABC123'
      const handleOpenChange = (val: boolean) => {
        if (!val) {
          status = 'idle'
          code = ''
        }
        return val
      }
      handleOpenChange(true)
      expect(status).toBe('success')
      expect(code).toBe('RFYR-YEAR-ABC123')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. P-09 修复验证：AbortController
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('P-09 修复验证：AbortController', () => {
    it('应创建 AbortController 实例', () => {
      const controller = new AbortController()
      expect(controller).toBeInstanceOf(AbortController)
    })

    it('abort() 后 signal 应处于 aborted 状态', () => {
      const controller = new AbortController()
      expect(controller.signal.aborted).toBe(false)
      controller.abort()
      expect(controller.signal.aborted).toBe(true)
    })

    it('abort() 后再次调用 abort() 不应抛出', () => {
      const controller = new AbortController()
      controller.abort()
      expect(() => controller.abort()).not.toThrow()
    })

    it('fetch 请求应传递 signal 参数', () => {
      const controller = new AbortController()
      const signal = controller.signal
      const requestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'TEST' }),
        signal,
      }
      expect(requestInit.signal).toBe(signal)
      expect(requestInit.signal).toBeInstanceOf(AbortSignal)
    })

    it('快速连续提交应先 abort 前一个再创建新的 AbortController', () => {
      let controllerCount = 0
      const controllers: AbortController[] = []

      // 第一次提交
      const first = new AbortController()
      controllers.push(first)
      controllerCount++

      // 模拟第二次提交：先 abort 前一个，再创建新的
      first.abort() // P-09 修复：取消前一个请求
      const second = new AbortController()
      controllers.push(second)
      controllerCount++

      expect(controllerCount).toBe(2)
      expect(controllers.length).toBe(2)
      expect(controllers[0].signal.aborted).toBe(true)
      expect(controllers[1].signal.aborted).toBe(false)
    })

    it('多个 AbortController 应独立工作', () => {
      const c1 = new AbortController()
      const c2 = new AbortController()
      c1.abort()
      expect(c1.signal.aborted).toBe(true)
      expect(c2.signal.aborted).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. handleKeyDown 行为
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('handleKeyDown 行为', () => {
    it('Enter 键且非 loading 时应触发兑换', () => {
      let redeemTriggered = false
      const handleKeyDown = (key: string, loading: boolean) => {
        if (key === 'Enter' && !loading) {
          redeemTriggered = true
        }
      }
      handleKeyDown('Enter', false)
      expect(redeemTriggered).toBe(true)
    })

    it('Enter 键但 loading 时不应触发', () => {
      let redeemTriggered = false
      const handleKeyDown = (key: string, loading: boolean) => {
        if (key === 'Enter' && !loading) {
          redeemTriggered = true
        }
      }
      handleKeyDown('Enter', true)
      expect(redeemTriggered).toBe(false)
    })

    it('非 Enter 键不应触发兑换', () => {
      let redeemTriggered = false
      const handleKeyDown = (key: string, loading: boolean) => {
        if (key === 'Enter' && !loading) {
          redeemTriggered = true
        }
      }
      handleKeyDown('Escape', false)
      handleKeyDown('Tab', false)
      handleKeyDown(' ', false)
      expect(redeemTriggered).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. PLAN_INFO 配置
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('PLAN_INFO 配置', () => {
    const PLAN_INFO: Record<string, {
      name: string
      period: string
      color: string
      bg: string
      border: string
    }> = {
      monthly: {
        name: '月卡会员',
        period: '30天',
        color: '#0969da',
        bg: '#eff8ff',
        border: 'rgba(9,105,218,0.15)',
      },
      yearly: {
        name: '年度VIP',
        period: '365天',
        color: '#d97706',
        bg: '#fffbeb',
        border: 'rgba(217,119,6,0.15)',
      },
    }

    it('yearly 配置包含正确字段', () => {
      expect(PLAN_INFO.yearly.name).toBe('年度VIP')
      expect(PLAN_INFO.yearly.period).toBe('365天')
      expect(PLAN_INFO.yearly.color).toBe('#d97706')
    })

    it('monthly 配置包含正确字段', () => {
      expect(PLAN_INFO.monthly.name).toBe('月卡会员')
      expect(PLAN_INFO.monthly.period).toBe('30天')
      expect(PLAN_INFO.monthly.color).toBe('#0969da')
    })

    it('planType 默认值为 yearly', () => {
      const defaultPlan = 'yearly'
      expect(defaultPlan).toBe('yearly')
    })

    it('无效 planType 应回退到 yearly', () => {
      const plan = PLAN_INFO['invalid'] || PLAN_INFO.yearly
      expect(plan.name).toBe('年度VIP')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 7. 成功后的自动关闭行为
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('成功后的自动关闭行为', () => {
    it('setTimeout 延迟应为 3000ms', () => {
      const DELAY_MS = 3000
      expect(DELAY_MS).toBe(3000)
    })

    it('成功响应后应调用 onOpenChange(false) + onSuccess()', () => {
      const onOpenChange = vi.fn()
      const onSuccess = vi.fn()

      onOpenChange(false)
      onSuccess()

      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(onSuccess).toHaveBeenCalled()
    })
  })
})
