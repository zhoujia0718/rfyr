/**
 * P1 修复：Magic Link 会话 Token 刷新工具
 *
 * Magic Link 会话的 access_token 有效期约 1 小时。
 * 本模块在 token 即将过期时通过 refresh_token 自动续期，
 * 并将新 token 写回 localStorage 的 custom_auth。
 *
 * 只对 source === "magic_link" 的会话生效；
 * fakeToken（admin 登录）有效期 7 天，不走此流程。
 */

import { supabase } from "./supabase"

const REFRESH_BUFFER_SECONDS = 120 // token 到期前 2 分钟触发刷新

/**
 * 检查并在需要时刷新 Magic Link 会话 token。
 * 调用方可在发送 API 请求前调用此函数以确保 token 有效。
 *
 * @returns 刷新后的 access_token（或原有 token 无需刷新时的原值），
 *          若无会话或刷新失败则返回 null
 */
export async function refreshSessionIfNeeded(): Promise<string | null> {
  if (typeof window === "undefined") return null

  try {
    const raw = localStorage.getItem("custom_auth")
    if (!raw) return null

    const authData = JSON.parse(raw)

    // 仅处理 Magic Link 会话
    if (authData.source !== "magic_link") {
      return authData.session?.access_token || authData.fakeToken || null
    }

    const expiresAt = Number(authData.session?.expires_at ?? 0)
    const now = Math.floor(Date.now() / 1000)

    // 距离到期超过缓冲期，无需刷新
    if (expiresAt > now + REFRESH_BUFFER_SECONDS) {
      return authData.session?.access_token || null
    }

    const refreshToken = authData.session?.refresh_token
    if (!refreshToken) {
      return authData.session?.access_token || null
    }

    // 使用 refresh_token 刷新会话
    const { data, error } = await supabase.auth.setSession({
      access_token: authData.session.access_token,
      refresh_token: refreshToken,
    })

    if (error || !data.session) {
      console.warn("[session-refresh] 刷新失败:", error?.message)
      return authData.session?.access_token || null
    }

    // 将新会话写回 localStorage
    const newAuth = {
      ...authData,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    }
    localStorage.setItem("custom_auth", JSON.stringify(newAuth))

    return data.session.access_token
  } catch {
    return null
  }
}
