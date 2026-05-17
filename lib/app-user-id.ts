import { supabase } from "@/lib/supabase"

/** 从 localStorage 构建 API 认证请求头（Bearer token + X-User-Id） */
export function getClientAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (typeof window === "undefined") return headers
  try {
    const raw = localStorage.getItem("custom_auth")
    if (!raw) return headers
    const auth = JSON.parse(raw) as { session?: { access_token?: string; refresh_token?: string; expires_at?: number }; fakeToken?: string; user?: { id?: string } }
    // fakeToken 优先（7天有效）；降级到 session.access_token（Supabase JWT，1小时有效）
    const token = auth.fakeToken || auth.session?.access_token
    if (token) headers["Authorization"] = `Bearer ${token}`
    if (auth.user?.id) headers["X-User-Id"] = String(auth.user.id)
  } catch { /* ignore */ }
  return headers
}

/**
 * 异步版本：当 custom_auth 里只有 Supabase JWT（无 fakeToken）且 JWT 已过期时，
 * 尝试用 refresh_token 换取新 session，再返回请求头。
 * 新注册/登录流程会存 fakeToken（7 天），只有旧会话需要这里的刷新逻辑。
 */
export async function getClientAuthHeadersAsync(): Promise<Record<string, string>> {
  const headers = getClientAuthHeaders()
  if (typeof window === "undefined") return headers

  try {
    const raw = localStorage.getItem("custom_auth")
    if (!raw) return headers
    const auth = JSON.parse(raw) as {
      session?: { access_token?: string; refresh_token?: string; expires_at?: number }
      fakeToken?: string
      user?: { id?: string }
    }

    // 已有 fakeToken → 不需要刷新
    if (auth.fakeToken) return headers

    // 无 JWT 或 JWT 未过期 → 不需要刷新
    const jwt = auth.session?.access_token
    const expiresAt = auth.session?.expires_at ?? 0
    const nowSec = Math.floor(Date.now() / 1000)
    if (!jwt || expiresAt > nowSec + 60) return headers

    // JWT 已过期或即将过期，尝试刷新
    const refreshToken = auth.session?.refresh_token
    if (!refreshToken) return headers

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
    if (error || !data.session) return headers

    // 更新 localStorage
    auth.session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? nowSec + 3600,
    }
    localStorage.setItem("custom_auth", JSON.stringify(auth))

    headers["Authorization"] = `Bearer ${data.session.access_token}`
    if (auth.user?.id) headers["X-User-Id"] = String(auth.user.id)
  } catch { /* ignore */ }
  return headers
}

/** 与 SiteHeader 一致：custom_auth 有效期内优先，避免与 Supabase session / 陈旧 userId 不一致 */
export async function resolveAppUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null

  const customRaw = localStorage.getItem("custom_auth")
  if (customRaw) {
    try {
      const authData = JSON.parse(customRaw) as { loginTime?: number; user?: { id?: string } }
      if (authData.loginTime && authData.loginTime > 0 && authData.user?.id) {
        return String(authData.user.id)
      }
    } catch {
      /* ignore */
    }
  }

  // custom_auth 无效或已过期时直接返回 null，
  // 不调用 getSession()（后者会对 refresh_token 已失效的用户触发 AuthError 并 console.error）
  return null
}

/**
 * 与 SiteHeader 展示的「已登录」一致：仅 valid custom_auth。
 * 不包含孤立的 localStorage `userId`（避免未登录却被判为已登录、误显示阅读篇数等问题）。
 *
 * custom_auth 有效时直接返回，不调用 getSession()。
 * getSession() 会对 refresh_token 已失效的用户触发 AuthError 并 console.error 报错。
 */
export async function resolveAuthenticatedUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null

  const customRaw = localStorage.getItem("custom_auth")
  if (customRaw) {
    try {
      const authData = JSON.parse(customRaw) as { loginTime?: number; user?: { id?: string } }
      if (authData.loginTime && authData.loginTime > 0 && authData.user?.id) {
        return String(authData.user.id)
      }
    } catch {
      /* ignore */
    }
  }

  // Supabase session 兜底（magic link / OAuth 等非 custom_auth 登录方式）
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id) {
      return session.user.id
    }
  } catch {
    /* ignore */
  }

  return null
}

export interface AppUser {
  id: string
  email?: string
  username?: string
  vip_tier?: string
  [key: string]: unknown
}

/** 返回完整的用户对象（含 vip_tier），与 SiteHeader.getMembershipBadge 逻辑完全一致 */
export async function resolveAppUser(): Promise<AppUser | null> {
  if (typeof window === "undefined") return null

  const customRaw = localStorage.getItem("custom_auth")
  if (customRaw) {
    try {
      const authData = JSON.parse(customRaw) as { loginTime?: number; user?: AppUser }
      if (authData.loginTime && authData.loginTime > 0 && authData.user?.id) {
        const { data: userData } = await supabase
          .from("users")
          .select("*")
          .eq("id", authData.user.id)
          .single()
        if (userData) {
          const merged = { ...authData.user, ...userData }
          localStorage.setItem("custom_auth", JSON.stringify({ ...authData, user: merged }))
          return merged
        }
        return authData.user
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const { data: { session: authSession } } = await supabase.auth.getSession()
    const authUser = authSession?.user ?? null
    if (authUser) {
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single()
      return userData ?? { id: authUser.id, email: authUser.email }
    }
  } catch {
    /* ignore */
  }

  const lid = localStorage.getItem("userId")
  if (lid?.trim()) {
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", lid.trim())
      .single()
    return userData
  }

  return null
}
