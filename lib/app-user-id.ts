import { supabase } from "@/lib/supabase"

/** 与 SiteHeader 一致：custom_auth 有效期内优先，避免与 Supabase session / 陈旧 userId 不一致 */
const CUSTOM_AUTH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export async function resolveAppUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null

  const customRaw = localStorage.getItem("custom_auth")
  if (customRaw) {
    try {
      const authData = JSON.parse(customRaw) as { loginTime?: number; user?: { id?: string } }
      const loginTime = typeof authData.loginTime === "number" ? authData.loginTime : 0
      // loginTime 可能是秒（新格式）或毫秒（旧格式），统一转毫秒
      const loginTimeMs = loginTime > 1e12 ? loginTime : loginTime * 1000
      if (loginTimeMs > 0 && Date.now() - loginTimeMs < CUSTOM_AUTH_MAX_AGE_MS && authData.user?.id) {
        return String(authData.user.id)
      }
    } catch {
      /* ignore */
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.id) return user.id

  const lid = localStorage.getItem("userId")
  return lid?.trim() || null
}

/**
 * 与 SiteHeader 展示的「已登录」一致：仅 valid custom_auth 或 Supabase 会话。
 * 不包含孤立的 localStorage `userId`（避免未登录却被判为已登录、误显示阅读篇数等问题）。
 */
export async function resolveAuthenticatedUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null

  const customRaw = localStorage.getItem("custom_auth")
  if (customRaw) {
    try {
      const authData = JSON.parse(customRaw) as { loginTime?: number; user?: { id?: string } }
      const loginTime = typeof authData.loginTime === "number" ? authData.loginTime : 0
      const loginTimeMs = loginTime > 1e12 ? loginTime : loginTime * 1000
      if (loginTimeMs > 0 && Date.now() - loginTimeMs < CUSTOM_AUTH_MAX_AGE_MS && authData.user?.id) {
        return String(authData.user.id)
      }
    } catch {
      /* ignore */
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
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
      const loginTime = typeof authData.loginTime === "number" ? authData.loginTime : 0
      const loginTimeMs = loginTime > 1e12 ? loginTime : loginTime * 1000
      if (loginTimeMs > 0 && Date.now() - loginTimeMs < CUSTOM_AUTH_MAX_AGE_MS && authData.user?.id) {
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

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (authUser) {
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single()
    return userData ?? { id: authUser.id, email: authUser.email }
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
