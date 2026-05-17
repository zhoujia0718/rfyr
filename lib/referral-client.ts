/**
 * 邀请码 URL 参数处理工具
 *
 * 逻辑：
 *   1. 用户通过 ?ref=xxx 链接访问网站 → 存入 localStorage（key: rfyr_referrer_code）
 *   2. 用户登录后，verify API 读取此码建立邀请关系
 *   3. 会员中心页面显示邀请信息
 */

import { supabase } from "@/lib/supabase"

const REFERRER_CODE_KEY = "rfyr_referrer_code"
const REFERRER_ARTICLE_KEY = "rfyr_referrer_article"

// 邀请码格式：支持两种格式
// 1. 新格式：8位小写十六进制（0-9a-f），与 /api/referral/code 生成格式一致
// 2. 老格式：RF- + 8位字母数字（数据库 trigger 历史遗留）
// 使用精确格式验证，防止 XSS 和畸形数据
const REFERRER_CODE_REGEX = /^(?:[0-9a-f]{8}|RF-[A-Z0-9]{8})$/i

/** 验证邀请码格式合法性 */
function isValidReferrerCode(code: string): boolean {
  return REFERRER_CODE_REGEX.test(code)
}

/** 捕获并存储：邀请码 + 来源文章 ID */
export function captureReferrerFromUrl(): string | null {
  if (typeof window === "undefined") return null

  const params = new URLSearchParams(window.location.search)
  const ref = params.get("ref")
  if (!ref) return null

  // 安全验证：只接受合法的邀请码格式，拒绝包含 HTML 标签的值
  if (!isValidReferrerCode(ref)) {
    console.warn("[Referral] 忽略非法邀请码格式:", ref)
    return null
  }

  try {
    // 统一转小写存储：数据库里 trigger 生成的是大写，查询时用 .toLowerCase()
    localStorage.setItem(REFERRER_CODE_KEY, ref.toLowerCase())

    // 从 URL 路径解析来源文章 ID（支持所有内容路径，排除列表页）
    const path = window.location.pathname
    const pathMatch = path.match(/^\/(notes|stocks|masters)\/(?!all$)([^/]+)$/)
    if (pathMatch) {
      localStorage.setItem(REFERRER_ARTICLE_KEY, pathMatch[2])
    }
  } catch {
    // ignore
  }

  return ref
}

/** 获取存储的来源文章 ID */
export function getStoredReferrerArticle(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(REFERRER_ARTICLE_KEY)
}

/** 清除来源文章 ID（注册成功后） */
export function clearStoredReferrerArticle(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(REFERRER_ARTICLE_KEY)
}

/** 获取存储的邀请码 */
export function getStoredReferrerCode(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(REFERRER_CODE_KEY)
}

/** 清除邀请码（注册成功后） */
export function clearStoredReferrerCode(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(REFERRER_CODE_KEY)
}

/**
 * 生成带邀请码的分享链接（?ref=），与微信 verify 里 createReferral 使用的 referrer_codes.code 一致。
 */
export function buildShareUrlWithReferrer(pageUrl: string, referrerCode: string): string {
  const code = referrerCode.trim()
  if (!code) return pageUrl
  try {
    const u = new URL(pageUrl)
    u.searchParams.set("ref", code)
    return u.toString()
  } catch {
    const hasQuery = pageUrl.includes("?")
    const sep = hasQuery ? "&" : "?"
    return `${pageUrl}${sep}ref=${encodeURIComponent(code)}`
  }
}

/**
 * 按用户 id 查询 referrer_codes 表中的短码（供分享链接使用）
 * 仅使用 localStorage 中的 custom_auth 数据，避免调用 supabase.auth.getSession()
 *（后者会触发空 refresh_token 刷新，对 magic link 用户会造成浏览器报错）
 */
export async function fetchReferrerCodeByUserId(userId: string): Promise<string | null> {
  try {
    const customAuth = localStorage.getItem("custom_auth")
    const headers: Record<string, string> = { "Content-Type": "application/json" }

    if (customAuth) {
      try {
        const authData = JSON.parse(customAuth)
        const token = authData.session?.access_token || authData.fakeToken
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
        if (authData.user?.id) {
          headers["X-User-Id"] = authData.user.id
        }
      } catch {
        headers["X-User-Id"] = userId
      }
    } else {
      // Supabase session 兜底（magic link / OAuth 等非 custom_auth 登录方式）
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`
        }
      } catch {
        /* ignore */
      }
      headers["X-User-Id"] = userId
    }

    const res = await fetch("/api/referral/code", { headers })
    if (res.ok) {
      const data = await res.json()
      return data.code ?? null
    }
  } catch {
    // ignore
  }
  return null
}
