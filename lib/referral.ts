/**
 * 邀请关系系统
 *
 * 规则：
 *   每成功邀请一位新用户注册，给邀请人增加阅读次数（从配置读取）
 *
 *   - 非会员：bonus_read_count（终身累计，写数据库）
 *   - 月卡/年卡：bonus_daily_count（今日奖励，写数据库 + 每天北京时间重置）
 *
 *   年度会员奖励策略说明（2026-04-20）：
 *   年度会员邀请奖励会正常发放（bonus_daily_count），但由于年度会员
 *   没有任何阅读限制，这些奖励目前不会被消费。这是【预期行为】：
 *     1. 作为留存激励：让年度会员持续邀请
 *     2. 预留接口：未来若新增"年度会员专属高级内容"功能，
 *        可以让这些奖励用于解锁高级内容，而不影响基本无限制访问
 *   如需修改行为（例如年度会员不发放奖励，或奖励兑换其他权益），
 *   修改 isReferrerMember 判断即可。
 *
 * 安全修复记录（M5 系列）：
 *   M5-04 FIX: 推荐关系插入改用 upsert，消除 SELECT-INSERT 竞态（并发重复邀请）
 *   M5-05 FIX: 奖励更新改用原子 RPC increment，消除读-增-写 竞态（并发奖励丢失）
 */

import { createClient } from "@supabase/supabase-js"
import { getReadingSettings } from "@/lib/reading-settings"
import { toLocalDateString } from "@/lib/utils"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── 推荐链深度检查 ─────────────────────────────────────────────────────────

/**
 * V-H-04 FIX: 向上追溯推荐链，返回 refereeId 的所有上游推荐人 ID 列表
 * 若链中已包含 referrerId，说明存在循环引用
 */
// Use a looser SupabaseClient type to avoid generic schema conflicts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

async function buildReferralChain(
  supabase: AnySupabaseClient,
  startUserId: string,
  maxDepth: number
): Promise<string[]> {
  const chain: string[] = []
  let currentId: string | null = startUserId

  for (let i = 0; i < maxDepth; i++) {
    if (!currentId) break
    const { data: referral } = await supabase
      .from("referrals")
      .select("referrer_id")
      .eq("referee_id", currentId)
      .maybeSingle() as { data: { referrer_id: string } | null; error: null }
    if (!referral) break
    chain.push(referral.referrer_id)
    currentId = referral.referrer_id
  }

  return chain
}

// ─── 建立邀请关系 ─────────────────────────────────────────────────────────---

/**
 * 被邀请人注册成功后调用此函数建立邀请关系
 * 同时给邀请人增加阅读次数
 *
 * V-H-04 FIX: 增加推荐链深度限制（最多 3 层），防止循环/多账号套利攻击
 * M5-04  FIX: 推荐关系插入改用 upsert，消除并发重复邀请
 * M5-05  FIX: 奖励更新改用原子 RPC increment，消除并发奖励丢失
 *
 * @param refereeId  被邀请人用户 ID
 * @param referrerCode 邀请人邀请码
 * @param maxDepth   最大推荐链深度，默认 3
 */
export async function createReferral(
  refereeId: string,
  referrerCode: string,
  maxDepth: number = 3
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. 通过邀请码找到邀请人
  const { data: referrer, error: referrerError } = await supabase
    .from("referrer_codes")
    .select("user_id")
    .eq("code", referrerCode.toLowerCase())
    .maybeSingle()

  if (referrerError || !referrer) {
    return
  }

  // 2. 不能邀请自己
  if (referrer.user_id === refereeId) {
    return
  }

  // V-H-04 FIX: 检查推荐链深度，防止循环套利
  const chain = await buildReferralChain(supabase, refereeId, maxDepth)
  if (chain.length >= maxDepth) {
    return
  }
  if (chain.includes(referrer.user_id)) {
    return
  }

  // 原子插入推荐关系：利用 DB 唯一约束保证同一对 (referrer, referee) 只能插入一次。
  // 仅在真正新增成功时（非重复）才发放奖励，避免重复奖励。
  const { error: insertError } = await supabase
    .from("referrals")
    .insert({ referrer_id: referrer.user_id, referee_id: refereeId })

  if (insertError) {
    if (insertError.code === "23505") {
      // 唯一约束冲突：邀请关系已存在，不重复发奖励
      return
    }
    if (insertError.code === "42501") {
      throw new Error(`[createReferral] RLS permission denied for referrals INSERT: ${insertError.message}`)
    }
    throw insertError
  }

  // 5. 获取阅读设置、邀请人的会员状态
  const [settings, referrerUser] = await Promise.all([
    getReadingSettings(),
    supabase.from("users").select("vip_tier").eq("id", referrer.user_id).single(),
  ])

  const isReferrerMember = !!(
    referrerUser.data?.vip_tier != null &&
    (String(referrerUser.data?.vip_tier).toLowerCase().includes("monthly") ||
     String(referrerUser.data?.vip_tier).toLowerCase().includes("year"))
  )

  const today = toLocalDateString()

  // M5-05 FIX: 使用原子 RPC 消除奖励更新竞态
  // 旧方案：SELECT → 计算 → UPDATE（两步之间存在竞态窗口，后者覆盖前者）
  // 新方案：atomic_increment_counter RPC 在 PostgreSQL 层保证原子性
  if (!isReferrerMember) {
    // 非会员：终身奖励 bonus_read_count（原子 increment）
    // P8 修复：RPC 不可用时降级到带乐观锁的直接 UPDATE
    let rpcSuccess = false
    try {
      const { error: rpcErr } = await supabase.rpc("atomic_increment_counter", {
        table_name: "user_profiles",
        column_name: "bonus_read_count",
        row_id: referrer.user_id,
        increment_by: settings.referral_bonus_count,
      })
      if (!rpcErr) rpcSuccess = true
    } catch { /* RPC 不存在 */ }

    if (!rpcSuccess) {
      try {
        const { data: prof } = await supabase
          .from("user_profiles")
          .select("bonus_read_count")
          .eq("id", referrer.user_id)
          .single()
        const current = Number(prof?.bonus_read_count ?? 0)
        const { error: updateErr } = await supabase
          .from("user_profiles")
          .update({ bonus_read_count: current + settings.referral_bonus_count })
          .eq("id", referrer.user_id)
          .eq("bonus_read_count", current)
        if (updateErr) {
          console.error("[createReferral] 非会员奖励更新失败:", updateErr)
          throw updateErr
        }
      } catch (e) {
        console.error("[createReferral] ❌ 非会员奖励发放失败（atomic_increment_counter RPC 不可用，降级写入也失败。referrer_id:", referrer.user_id, "增量:", settings.referral_bonus_count)
        throw e
      }
    }
  } else {
    // 会员：检查是否跨天，再原子更新 bonus_daily_count
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("bonus_daily_reset_date")
      .eq("id", referrer.user_id)
      .maybeSingle()

    const resetDate = profile?.bonus_daily_reset_date ?? "1970-01-01"

    // P8 修复：RPC 不可用时降级到带乐观锁的直接 UPDATE（会员每日奖励路径）
    // 注意：RPC 只更新 bonus_daily_count，bonus_daily_reset_date 需要由调用方单独维护
    const incrementDailyBonus = async () => {
      let rpcSuccess = false
      try {
        const { error: rpcErr } = await supabase.rpc("atomic_increment_counter", {
          table_name: "user_profiles",
          column_name: "bonus_daily_count",
          row_id: referrer.user_id,
          increment_by: settings.referral_bonus_count,
        })
        if (!rpcErr) rpcSuccess = true
      } catch { /* RPC 不存在 */ }

      if (!rpcSuccess) {
        try {
          const { data: prof } = await supabase
            .from("user_profiles")
            .select("bonus_daily_count")
            .eq("id", referrer.user_id)
            .single()
          const current = Number(prof?.bonus_daily_count ?? 0)
          const { error: updateErr } = await supabase
            .from("user_profiles")
            .update({
              bonus_daily_count: current + settings.referral_bonus_count,
              bonus_daily_reset_date: today,
            })
            .eq("id", referrer.user_id)
            .eq("bonus_daily_count", current)
          if (updateErr) {
            console.error("[createReferral] 会员每日奖励更新失败:", updateErr)
            throw updateErr
          }
        } catch (e) {
          console.error("[createReferral] ❌ 会员每日奖励发放失败（RPC 不可用，降级写入也失败。referrer_id:", referrer.user_id, "增量:", settings.referral_bonus_count)
          throw e
        }
      } else {
        // RPC 成功：同步更新 bonus_daily_reset_date，避免日期未同步导致的奖励统计错误
        // 使用无条件 UPDATE（忽略失败），确保即使 RPC 后日期不一致也能修复
        await supabase
          .from("user_profiles")
          .update({ bonus_daily_reset_date: today })
          .eq("id", referrer.user_id)
          .then(() => {}, () => {})
      }
    }

    if (resetDate !== today) {
      // 跨天：原子 increment bonus_daily_count + 无条件设置重置日期
      // 使用 UPDATE ... SET bonus_daily_reset_date = today（无条件），避免条件更新竞态
      // bonus_daily_count 的增量由 incrementDailyBonus() 保证原子性
      await Promise.all([
        incrementDailyBonus(),
        supabase
          .from("user_profiles")
          .update({ bonus_daily_reset_date: today })
          .eq("id", referrer.user_id)
          .then(() => {}, () => {}),
      ])
    } else {
      // 未跨天：直接原子 increment
      await incrementDailyBonus()
    }
  }
}

// ─── 获取用户邀请信息 ───────────────────────────────────────────────────────

export interface ReferralInfo {
  referrerCode: string
  referralCount: number
  membershipType: "none" | "monthly" | "yearly"
  bonusReadCount: number
  bonusDailyCount: number
}

export async function getReferralInfo(userId: string): Promise<ReferralInfo | null> {
  const supabase = createClient(supabaseUrl, supabaseKey)

  const [codeResult, countResult, userResult, profileResult] = await Promise.all([
    supabase.from("referrer_codes").select("code").eq("user_id", userId).single(),
    supabase.from("referrals").select("id", { count: "exact" }).eq("referrer_id", userId),
    supabase.from("users").select("vip_tier").eq("id", userId).single(),
    supabase.from("user_profiles").select("bonus_read_count, bonus_daily_count, bonus_daily_reset_date").eq("id", userId).single(),
  ])

  if (!codeResult.data) return null

  const tier = userResult.data?.vip_tier || "none"
  const isMonthly = tier === "monthly" || String(tier).includes("monthly")
  const isYearly = tier === "yearly" || String(tier).includes("year")
  const membershipType: "none" | "monthly" | "yearly" = isYearly ? "yearly" : isMonthly ? "monthly" : "none"

  const resetDate = profileResult.data?.bonus_daily_reset_date ?? '1970-01-01'
  const today = toLocalDateString()

  // 每日奖励从数据库读取，但需要判断是否已跨天（跨天后归零，不读取历史值）
  let bonusDailyCount = 0
  if (isMonthly || isYearly) {
    if (resetDate === today) {
      bonusDailyCount = Number(profileResult.data?.bonus_daily_count ?? 0)
    } else {
      // 已跨天，bonus_daily_count 已过期（应该由 createReferral 触发重置，这里做兜底）
      bonusDailyCount = 0
    }
  }

  return {
    referrerCode: codeResult.data.code,
    referralCount: countResult.count || 0,
    membershipType,
    bonusReadCount: Number(profileResult.data?.bonus_read_count ?? 0),
    bonusDailyCount,
  }
}
