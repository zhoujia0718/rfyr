/**
 * 页面初始化数据共享缓存（客户端模块级单例）
 *
 * 解决问题：MembershipProvider 和 ReadingContext 各自独立调用 API，
 * 导致页面加载时 3 次请求瀑布。
 *
 * 方案：两个 Provider 共享同一个 /api/init Promise。
 *   - 第一个调用的 Provider 创建请求；
 *   - 第二个 Provider 直接复用已有 Promise（零额外请求）；
 *   - auth-refresh 事件触发后清除缓存，下次调用重新请求。
 */

export interface InitData {
  /** false 表示服务端明确拒绝认证（token 无效/过期）；undefined 表示已认证或网络降级 */
  authenticated?: boolean
  membership: {
    tier: string
    endDate: string | null
    daysRemaining: number | null
    isMonthly: boolean
    isYearly: boolean
    isPermanent: boolean
  }
  readingLimit: {
    readCount: number
    readIds: string[]
    todayReadIds: string[]
    dailyReadCount: number
    bonusCount: number
    dailyBonusCount: number
  } | null
  settings: {
    guest_read_limit: number
    monthly_daily_limit: number
    referral_bonus_count: number
    show_read_progress: boolean
  }
}

let _pendingRequest: Promise<InitData> | null = null
let _cachedData: InitData | null = null
let _cachedAt = 0
const CACHE_TTL = 90 * 1000 // 90 秒内复用（避免 Provider 竞争，同时保持数据相对新鲜）

/** 管理员更新阅读设置后，其他 Tab 会触发 rfyr_settings_updated，清除缓存以获取最新值 */
if (typeof window !== "undefined") {
  const handler = () => {
    _cachedData = null
    _pendingRequest = null
    _cachedAt = 0
  }
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === "rfyr_settings_updated") handler()
  })
}

/** 登录成功后 reload，跳过 singleton 缓存强制发新请求 */
export function clearInitCache(): void {
  _pendingRequest = null
  _cachedData = null
  _cachedAt = 0
}

/** 检查是否刚登录（reload 后立即调用，跳过缓存） */
function isJustLoggedIn(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem('rfyr_just_logged_in') === '1'
  } catch {
    return false
  }
}

/** 清除刚登录标记 */
function clearJustLoggedIn(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem('rfyr_just_logged_in')
  } catch {}
}

/**
 * 从 init-cache 同步获取 settings（无网络请求）。
 * 适合 useReadingSettings 等 hook 在 init-cache 已存在时直接读取。
 */
export function getSettingsFromCache(): InitData["settings"] | null {
  if (_cachedData && Date.now() - _cachedAt < CACHE_TTL) {
    return _cachedData.settings
  }
  return null
}

/** 构建 auth headers（从 localStorage 读取） */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  try {
    const raw = localStorage.getItem("custom_auth")
    if (!raw) return headers
    const authData = JSON.parse(raw)
    const token = authData.fakeToken || authData.session?.access_token
    if (token) headers["Authorization"] = `Bearer ${token}`
    if (authData.user?.id) headers["X-User-Id"] = authData.user.id
  } catch { /* ignore */ }
  return headers
}

/**
 * 获取初始化数据（共享 Promise，第二个调用者零开销）
 * 登录成功后 reload 会跳过缓存，强制发新请求。
 */
export async function getInitData(): Promise<InitData> {
  // 登录后 reload：跳过缓存，强制发新请求
  const justLoggedIn = isJustLoggedIn()
  if (justLoggedIn) {
    clearJustLoggedIn()
    clearInitCache()
  }

  // 返回 90 秒内的缓存结果（仅在非登录后 reload 时使用）
  if (!justLoggedIn && _cachedData && Date.now() - _cachedAt < CACHE_TTL) {
    return _cachedData
  }

  // 复用进行中的请求（两个 Provider 同时 mount 时触发）
  if (!justLoggedIn && _pendingRequest) {
    return _pendingRequest
  }

  _pendingRequest = fetch("/api/init", { headers: buildHeaders(), cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) {
        const status = res.status
        const text = await res.text().catch(() => '')
        throw Object.assign(new Error('API error'), { status, body: text })
      }
      return res.json() as Promise<InitData>
    })
    .then(data => {
      _cachedData = data
      _cachedAt = Date.now()
      _pendingRequest = null
      return data
    })
    .catch((err) => {
      _pendingRequest = null
      const status = err?.status ?? 0
      // 401/403：token 无效，清除登录态后降级
      if (status === 401 || status === 403) {
        try {
          localStorage.removeItem('custom_auth')
          localStorage.removeItem('rfyr_membership_cache')
        } catch {}
        window.dispatchEvent(new CustomEvent('rfyr:show-login'))
      }
      // 降级默认值
      const fallback: InitData = {
        membership: {
          tier: "none", endDate: null, daysRemaining: null,
          isMonthly: false, isYearly: false, isPermanent: false,
        },
        readingLimit: null,
        settings: { guest_read_limit: 3, monthly_daily_limit: 8, referral_bonus_count: 2, show_read_progress: false },
      }
      return fallback
    })

  return _pendingRequest
}
