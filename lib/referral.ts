/**
 * 邀请关系系统
 *
 * 规则：
 *   普通用户：每邀请 1 人，read_bonus +1，上限 10
 *   周卡会员：每邀请 1 人，read_bonus +2，上限 20
 *   年卡会员：不限制（全部可看）
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const READ_BONUS_NORMAL = 1  // 普通用户每次邀请加成
const READ_BONUS_WEEKLY = 2  // 周卡用户每次邀请加成
const MAX_BONUS_NORMAL = 10  // 普通用户上限
const MAX_BONUS_WEEKLY = 20  // 周卡用户上限

// ─── 建立邀请关系 ───────────────────────────────────────────────────────────

/**
 * 被邀请人注册成功后调用此函数建立邀请关系
 * @param refereeId  被邀请人用户 ID
 * @param referrerCode 邀请人邀请码
 */
export async function createReferral(refereeId: string, referrerCode: string): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. 通过邀请码找到邀请人
  const { data: referrer, error: referrerError } = await supabase
    .from("referrer_codes")
    .select("user_id")
    .eq("code", referrerCode.toLowerCase())
    .maybeSingle()

  if (referrerError || !referrer) {
    console.log("[Referral] 邀请码无效:", referrerCode)
    return
  }

  // 2. 不能邀请自己
  if (referrer.user_id === refereeId) {
    console.log("[Referral] 不能邀请自己")
    return
  }

  // 3. 插入邀请关系（unique 约束防止重复）
  const { error: insertError } = await supabase.from("referrals").insert({
    referrer_id: referrer.user_id,
    referee_id: refereeId,
  })

  if (insertError) {
    if (insertError.code === "23505") {
      console.log("[Referral] 已是邀请关系，跳过")
      return
    }
    console.error("[Referral] 插入邀请关系失败:", insertError)
    return
  }

  // 4. 查询邀请人当前身份，给邀请人加 read_bonus
  const { data: referrerUser } = await supabase
    .from("users")
    .select("vip_tier")
    .eq("id", referrer.user_id)
    .single()

  const tier = referrerUser?.vip_tier || "none"
  const isWeekly = tier === "weekly" || String(tier).includes("weekly")
  const isYearly = tier === "yearly" || String(tier).includes("yearly")

  if (isYearly) {
    // 年卡用户不限制，不需要加 read_bonus
    console.log("[Referral] 邀请人是年卡会员，无需加成")
    return
  }

  const bonus = isWeekly ? READ_BONUS_WEEKLY : READ_BONUS_NORMAL
  const maxBonus = isWeekly ? MAX_BONUS_WEEKLY : MAX_BONUS_NORMAL

  // 5. 查询邀请人当前 read_bonus
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("read_bonus")
    .eq("id", referrer.user_id)
    .single()

  const currentBonus = profile?.read_bonus || 0

  if (currentBonus >= maxBonus) {
    console.log("[Referral] 邀请人 read_bonus 已达上限:", maxBonus)
    return
  }

  const newBonus = Math.min(currentBonus + bonus, maxBonus)

  await supabase
    .from("user_profiles")
    .update({ read_bonus: newBonus })
    .eq("id", referrer.user_id)

  console.log(`[Referral] 邀请人 ${referrer.user_id} read_bonus: ${currentBonus} → ${newBonus}`)
}

// ─── 获取用户邀请信息 ───────────────────────────────────────────────────────

export interface ReferralInfo {
  referrerCode: string
  referralCount: number
  readBonus: number
  maxBonus: number
  membershipType: "none" | "weekly" | "yearly"
}

export async function getReferralInfo(userId: string): Promise<ReferralInfo | null> {
  const supabase = createClient(supabaseUrl, supabaseKey)

  const [codeResult, countResult, profileResult, userResult] = await Promise.all([
    supabase.from("referrer_codes").select("code").eq("user_id", userId).single(),
    supabase.from("referrals").select("id", { count: "exact" }).eq("referrer_id", userId),
    supabase.from("user_profiles").select("read_bonus").eq("id", userId).single(),
    supabase.from("users").select("vip_tier").eq("id", userId).single(),
  ])

  if (!codeResult.data) return null

  const tier = userResult.data?.vip_tier || "none"
  const isWeekly = tier === "weekly" || String(tier).includes("weekly")
  const isYearly = tier === "yearly" || String(tier).includes("yearly")
  const membershipType: "none" | "weekly" | "yearly" = isYearly ? "yearly" : isWeekly ? "weekly" : "none"
  const maxBonus = isYearly ? Infinity : isWeekly ? MAX_BONUS_WEEKLY : MAX_BONUS_NORMAL

  return {
    referrerCode: codeResult.data.code,
    referralCount: countResult.count || 0,
    readBonus: profileResult.data?.read_bonus || 0,
    maxBonus,
    membershipType,
  }
}
