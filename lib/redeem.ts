/**
 * 兑换码系统
 *
 * 规则：
 *   周卡：RFYR-WEEK-XXXXXX，7 天有效期
 *   年卡：RFYR-YEAR-XXXXXX，365 天有效期
 *   每个用户免费领取周卡 1 次（weekly_free_used 标记）
 *   付费购买周卡最多 4 次（含免费，共最多 5 次）
 *   兑换码生成后 3 天内必须使用，过期作废
 *   兑换后写入 memberships 表
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const WEEKLY_DAYS = 7
const YEARLY_DAYS = 365
const CODE_EXPIRY_DAYS = 3 // 兑换码生成后 3 天内必须使用
const MAX_WEEKLY_FREE = 1  // 每人免费周卡次数
const MAX_WEEKLY_TOTAL = 4 // 付费周卡最多 4 次（含免费）

// ─── 生成兑换码 ────────────────────────────────────────────────────────────

function generateRedeemCode(type: "weekly" | "yearly"): string {
  const prefix = type === "weekly" ? "RFYR-WEEK" : "RFYR-YEAR"
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // 避开易混淆字符
  let suffix = ""
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${prefix}-${suffix}`
}

export async function generateRedeemCodes(
  type: "weekly" | "yearly",
  count: number,
  createdBy: string
): Promise<string[]> {
  const supabase = createClient(supabaseUrl, supabaseKey)
  const codes: string[] = []

  for (let i = 0; i < count; i++) {
    let code = generateRedeemCode(type)
    // 防止碰撞，重试
    let retry = 0
    while (retry < 10) {
      const { data } = await supabase
        .from("redeem_codes")
        .select("id")
        .eq("code", code)
        .maybeSingle()
      if (!data) break
      code = generateRedeemCode(type)
      retry++
    }
    codes.push(code)

    const expiresAt = new Date(Date.now() + CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from("redeem_codes").insert({
      code,
      type,
      status: "unused",
      created_by: createdBy,
      expires_at: expiresAt,
    })
  }

  return codes
}

// ─── 兑换兑换码 ─────────────────────────────────────────────────────────────

interface RedeemPayload {
  membershipType: "weekly" | "yearly"
  expiresAt: string
  source: "redeem" | "free"
}

export async function redeemCode(
  userId: string,
  code: string
): Promise<{ success: true; data: RedeemPayload } | { success: false; message: string }> {
  const supabase = createClient(supabaseUrl, supabaseKey)

  let weeklyProfile: { weekly_free_used?: boolean; weekly_purchase_count?: number } | null = null

  // 1. 查询兑换码
  const { data: redeemCodeData, error: codeError } = await supabase
    .from("redeem_codes")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle()

  if (codeError || !redeemCodeData) {
    return { success: false, message: "兑换码无效" }
  }

  if (redeemCodeData.status === "used") {
    return { success: false, message: "兑换码已被使用" }
  }

  if (redeemCodeData.status === "expired" || new Date(redeemCodeData.expires_at) < new Date()) {
    return { success: false, message: "兑换码已过期" }
  }

  // 2. 周卡检查：每人免费次数限制
  if (redeemCodeData.type === "weekly") {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("weekly_free_used, weekly_purchase_count")
      .eq("id", userId)
      .maybeSingle()

    weeklyProfile = profile

    if (redeemCodeData.created_by === userId) {
      // 不能用自己的码
      return { success: false, message: "不能使用自己生成的兑换码" }
    }

    if (redeemCodeData.source !== "purchase" && profile?.weekly_free_used === true) {
      return { success: false, message: "您已使用过免费周卡" }
    }

    const totalUsed = profile?.weekly_purchase_count || 0
    if (totalUsed >= MAX_WEEKLY_TOTAL) {
      return { success: false, message: `周卡兑换次数已达上限（${MAX_WEEKLY_TOTAL} 次）` }
    }
  }

  // 3. 计算会员有效期
  const days = redeemCodeData.type === "weekly" ? WEEKLY_DAYS : YEARLY_DAYS
  const startDate = new Date()
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + days)

  // 4. 检查用户是否已有同类有效会员，有则顺延，无则新建
  const { data: existingMembership } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", userId)
    .eq("membership_type", redeemCodeData.type)
    .eq("status", "active")
    .single()

  if (existingMembership) {
    // 顺延
    const existingEnd = new Date(existingMembership.end_date)
    const newEnd = new Date(existingEnd)
    newEnd.setDate(newEnd.getDate() + days)

    await supabase
      .from("memberships")
      .update({ end_date: newEnd.toISOString() })
      .eq("id", existingMembership.id)
  } else {
    await supabase.from("memberships").insert({
      user_id: userId,
      membership_type: redeemCodeData.type,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      status: "active",
      source: "redeem",
    })
  }

  // 5. 更新用户 vip_tier
  await supabase
    .from("users")
    .update({ vip_tier: redeemCodeData.type })
    .eq("id", userId)

  // 6. 标记兑换码已使用
  await supabase
    .from("redeem_codes")
    .update({ status: "used", user_id: userId, used_at: new Date().toISOString() })
    .eq("id", redeemCodeData.id)

  // 7. 更新 user_profiles 计数（仅周卡）
  if (redeemCodeData.type === "weekly") {
    const isFreeUse = !redeemCodeData.source
    await supabase
      .from("user_profiles")
      .update({
        weekly_free_used: isFreeUse ? true : undefined,
        weekly_purchase_count: (weeklyProfile?.weekly_purchase_count || 0) + 1,
      })
      .eq("id", userId)
  }

  console.log(`[Redeem] 用户 ${userId} 兑换 ${redeemCodeData.type} 成功，到期日：${endDate.toISOString()}`)

  return {
    success: true,
    data: {
      membershipType: redeemCodeData.type as "weekly" | "yearly",
      expiresAt: endDate.toISOString(),
      source: "redeem",
    },
  }
}
