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

/** 从 URL 参数读取邀请码并存储 */
export function captureReferrerFromUrl(): string | null {
  if (typeof window === "undefined") return null

  const params = new URLSearchParams(window.location.search)
  const ref = params.get("ref")
  if (!ref) return null

  // 存到 localStorage
  try {
    localStorage.setItem(REFERRER_CODE_KEY, ref)
    console.log("[Referral] 记录邀请码:", ref)
  } catch {
    // ignore
  }

  return ref
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

/** 按用户 id 查询 referrer_codes 表中的短码（供分享链接使用） */
export async function fetchReferrerCodeByUserId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("referrer_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) {
    console.warn("[Referral] 拉取邀请码失败:", error.message)
    return null
  }
  return data?.code ?? null
}
