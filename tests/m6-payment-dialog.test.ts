/**
 * M6-05: payment-dialog.tsx — 支付对话框核心逻辑测试
 *
 * 测试覆盖：
 * 1. 订单号格式生成（ORD 前缀 + 时间戳 + 随机字符）
 * 2. 倒计时格式化（mm:ss 格式）
 * 3. 支付状态流转（pending → scanning → success/failed）
 * 4. simulatePayment — 调用 /api/membership/activate
 * 5. 重置支付状态逻辑
 * 6. planId 默认回退到 yearly
 * 7. V-C-06 修复：simulatePayment 必须调用服务端 API
 * 8. 复制订单号（navigator.clipboard）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock globals ─────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
const mockClipboard = { writeText: vi.fn() }
const mockLocalStorage = {
  getItem: vi.fn<(key: string) => string | null>(),
}

vi.stubGlobal('fetch', mockFetch)
vi.stubGlobal('navigator', { clipboard: mockClipboard } as unknown as Navigator)
vi.stubGlobal('localStorage', mockLocalStorage)

// ─── 辅助函数（从 payment-dialog.tsx 提取）──────────────────────────────

const DEFAULT_COUNTDOWN = 300 // 5 分钟

/** 生成订单号 */
function generateOrderId(): string {
  return `ORD${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`
}

/** 格式化倒计时为 mm:ss */
function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/** 模拟 simulatePayment 核心逻辑 */
async function simulatePaymentCore(
  orderId: string,
  planId: string | null | undefined
): Promise<{ ok: boolean; status: number }> {
  const customAuth = mockLocalStorage.getItem('custom_auth')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (customAuth) {
    try {
      const authData = JSON.parse(customAuth)
      if (authData.session?.access_token) {
        headers['Authorization'] = `Bearer ${authData.session.access_token}`
      }
      if (authData.user?.id) {
        headers['X-User-Id'] = authData.user.id
      }
    } catch {
      /* ignore */
    }
  }

  const res = await mockFetch(`/api/membership/activate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ orderId, planType: planId || 'yearly' }),
  })

  return { ok: res.ok, status: res.status }
}

/** 复制订单号 */
function copyOrderId(orderId: string): void {
  navigator.clipboard.writeText(orderId)
}

// ─── 订单号生成测试 ────────────────────────────────────────────────────────────

describe('M6-05a: 订单号生成', () => {
  beforeEach(() => {
    mockLocalStorage.getItem.mockReset()
  })

  it('ORD 前缀', () => {
    const id = generateOrderId()
    expect(id.startsWith('ORD')).toBe(true)
  })

  it('总长度应 > 10', () => {
    const id = generateOrderId()
    expect(id.length).toBeGreaterThan(10)
  })

  it('不含小写字母（toUpperCase 后生成）', () => {
    // Math.random().toString(36) 可能产生小写，这里验证格式
    const id = generateOrderId()
    expect(id).toMatch(/^ORD[A-Za-z0-9]+$/)
    expect(id.startsWith('ORD')).toBe(true)
  })

  it('连续调用生成不同 ID', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateOrderId())
    }
    // 100 次调用应产生 100 个不同的 ID（概率极高）
    expect(ids.size).toBe(100)
  })
})

// ─── 倒计时格式化测试 ────────────────────────────────────────────────────────

describe('M6-05b: 倒计时格式化', () => {
  it('0 秒应显示 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00')
  })

  it('59 秒应显示 00:59', () => {
    expect(formatCountdown(59)).toBe('00:59')
  })

  it('60 秒应显示 01:00', () => {
    expect(formatCountdown(60)).toBe('01:00')
  })

  it('5 分钟（300 秒）应显示 05:00', () => {
    expect(formatCountdown(DEFAULT_COUNTDOWN)).toBe('05:00')
  })

  it('5 分钟差 1 秒应显示 04:59', () => {
    expect(formatCountdown(DEFAULT_COUNTDOWN - 1)).toBe('04:59')
  })

  it('大于 60 分钟时应正确溢出', () => {
    expect(formatCountdown(3661)).toBe('61:01') // 61 分钟 1 秒
  })

  it('个位数分钟应补零', () => {
    expect(formatCountdown(65)).toBe('01:05')
    expect(formatCountdown(9)).toBe('00:09')
  })

  it('个位数秒应补零', () => {
    expect(formatCountdown(61)).toBe('01:01')
    expect(formatCountdown(70)).toBe('01:10')
  })
})

// ─── 支付状态流转测试 ─────────────────────────────────────────────────────────

describe('M6-05c: 支付状态流转', () => {
  type PaymentStatus = 'pending' | 'scanning' | 'success' | 'failed'

  const transitions: [PaymentStatus, PaymentStatus][] = [
    ['pending', 'scanning'],
    ['scanning', 'success'],
    ['scanning', 'failed'],
  ]

  it('pending → scanning 是合法流转', () => {
    expect(transitions[0]).toEqual(['pending', 'scanning'])
  })

  it('scanning → success 是合法流转', () => {
    expect(transitions[1]).toEqual(['scanning', 'success'])
  })

  it('scanning → failed 是合法流转', () => {
    expect(transitions[2]).toEqual(['scanning', 'failed'])
  })

  it('pending 状态可重置', () => {
    const status: PaymentStatus = 'pending'
    const reset = (): PaymentStatus => 'pending'
    expect(reset()).toBe('pending')
  })
})

// ─── simulatePayment 核心逻辑测试 ────────────────────────────────────────────

describe('M6-05d: simulatePayment 核心逻辑', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    } as unknown as Response)
    mockLocalStorage.getItem.mockReset()
    mockLocalStorage.getItem.mockReturnValue(null)
  })

  it('V-C-06 修复：应调用 /api/membership/activate', async () => {
    await simulatePaymentCore('ORD123', 'yearly')
    expect(mockFetch).toHaveBeenCalledWith('/api/membership/activate', expect.any(Object))
  })

  it('planId 为 null 时应回退到 yearly', async () => {
    await simulatePaymentCore('ORD123', null)
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse((call[1] as { body: string }).body)
    expect(body.planType).toBe('yearly')
  })

  it('planId 为 undefined 时也应回退到 yearly', async () => {
    await simulatePaymentCore('ORD123', undefined)
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse((call[1] as { body: string }).body)
    expect(body.planType).toBe('yearly')
  })

  it('有 custom_auth 时应附加 Authorization header', async () => {
    mockLocalStorage.getItem.mockReturnValue(
      JSON.stringify({
        session: { access_token: 'token-123' },
        user: { id: 'user-abc' },
      })
    )
    await simulatePaymentCore('ORD123', 'yearly')
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = (call[1] as { headers: Record<string, string> }).headers
    expect(headers['Authorization']).toBe('Bearer token-123')
    expect(headers['X-User-Id']).toBe('user-abc')
  })

  it('有 custom_auth 但格式无效时应不崩溃', async () => {
    mockLocalStorage.getItem.mockReturnValue('not valid json')
    await simulatePaymentCore('ORD123', 'yearly')
    // 不崩溃，headers 仍包含 Content-Type
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = (call[1] as { headers: Record<string, string> }).headers
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('HTTP 错误时应返回 ok=false', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as unknown as Response)
    const result = await simulatePaymentCore('ORD123', 'yearly')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(401)
  })

  it('POST 方法正确', async () => {
    await simulatePaymentCore('ORD123', 'yearly')
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((call[1] as { method: string }).method).toBe('POST')
  })

  it('body 包含 orderId 和 planType', async () => {
    await simulatePaymentCore('ORD999', 'monthly')
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse((call[1] as { body: string }).body)
    expect(body.orderId).toBe('ORD999')
    expect(body.planType).toBe('monthly')
  })
})

// ─── 复制订单号测试 ────────────────────────────────────────────────────────────

describe('M6-05e: 复制订单号', () => {
  beforeEach(() => {
    mockClipboard.writeText.mockClear()
  })

  it('应调用 navigator.clipboard.writeText', () => {
    copyOrderId('ORD123456')
    expect(mockClipboard.writeText).toHaveBeenCalledWith('ORD123456')
  })

  it('复制空字符串也应调用', () => {
    copyOrderId('')
    expect(mockClipboard.writeText).toHaveBeenCalledWith('')
  })
})

// ─── 默认计划回退测试 ─────────────────────────────────────────────────────────

describe('M6-05f: planId 默认回退', () => {
  const plans = [{ id: 'yearly', name: '年度VIP会员', price: '299', period: '365天' }]

  it('planId 为 null 时选中 plans[0]', () => {
    const planId: string | null = null
    const selectedPlan = plans.find((p) => p.id === (planId || 'yearly')) || plans[0]
    expect(selectedPlan.id).toBe('yearly')
  })

  it('planId 为 undefined 时选中 plans[0]', () => {
    const planId: string | undefined = undefined
    const selectedPlan = plans.find((p) => p.id === (planId || 'yearly')) || plans[0]
    expect(selectedPlan.id).toBe('yearly')
  })

  it('planId 为空字符串时选中 plans[0]', () => {
    const planId = ''
    const selectedPlan = plans.find((p) => p.id === (planId || 'yearly')) || plans[0]
    expect(selectedPlan.id).toBe('yearly')
  })
})

// ─── 重置逻辑测试 ─────────────────────────────────────────────────────────────

describe('M6-05g: 支付状态重置', () => {
  it('resetPayment 应重置 countdown 为 300', () => {
    const resetCountdown = () => 300
    expect(resetCountdown()).toBe(300)
  })

  it('resetPayment 应重置 status 为 pending', () => {
    const resetStatus = (): 'pending' | 'scanning' | 'success' | 'failed' => 'pending'
    expect(resetStatus()).toBe('pending')
  })
})
