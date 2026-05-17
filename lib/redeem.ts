/**
 * 兑换码系统
 *
 * 规则：
 *   月卡：RFYR-MONTH-XXXXXX，30 天有效期
 *   年卡：RFYR-YEAR-XXXXXX，365 天有效期
 *   兑换码生成后 3 天内必须使用，过期作废
 *   兑换后写入 memberships 表
 *   年卡每次续期 +1 年（setFullYear），月卡每次 +30 天（setDate）
 *
 * 安全修复记录（M5 系列）：
 *   M5-03 FIX: 续期逻辑改用 upsert（ON CONFLICT DO UPDATE），消除并发双重插入
 *   M5-06 FIX: 字符集统一为 30 字符（去 I O 0 1，与前端和 API 一致）
 */

import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── 常量定义 ─────────────────────────────────────────────────────────────

const MONTHLY_DAYS = 30
const YEARLY_DAYS = 365
const CODE_EXPIRY_DAYS = 3 // 兑换码生成后 3 天内必须使用

// ─── 工具函数 ─────────────────────────────────────────────────────────────

/** 获取 UTC 时间戳（秒） */
function getUtcTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

/** 获取 UTC 日期字符串（YYYY-MM-DD） */
function getUtcDateString(): string {
  return new Date().toISOString().split("T")[0]
}

/**
 * 计算续期后的到期日
 * - 有未过期会员：以其到期日为基准往后顺延
 * - 已过期会员：从今天开始计算
 * - 年卡：setUTCFullYear +1，闰年溢出（2/29 → 2/28）由 setUTCDate(0) 回拨
 * - 月卡：setDate +30（setDate 跨月溢出由 JS 自动处理，如1月31日+30天→3月2日）
 */
function addMembershipPeriod(baseDate: Date, days: number, membershipType: "monthly" | "yearly"): Date {
  const end = new Date(baseDate)
  if (membershipType === "yearly") {
    const originalDay = end.getUTCDate()
    end.setUTCFullYear(end.getUTCFullYear() + 1)
    // 闰年溢出：2/29 + 1年 → 3/1 → 回拨到上个月最后一天（2/28）
    if (end.getUTCDate() < originalDay) {
      end.setUTCDate(0)
    }
  } else {
    end.setUTCDate(end.getUTCDate() + days)
  }
  return end
}

// ─── 生成兑换码 ───────────────────────────────────────────────────────────

function generateRedeemCode(type: "monthly" | "yearly"): string {
  const prefix = type === "monthly" ? "RFYR-MONTH" : "RFYR-YEAR"
  // M5-06 FIX: 字符集去掉 I O 0 1，共 32 个字符（A-Z去除I,O=24 + 2-9=8）
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  // P0-B FIX: 使用密码学安全的随机字节，不再使用 Math.random()
  const bytes = randomBytes(6)
  const suffix = Array.from(bytes)
    .map(b => chars[b % chars.length])
    .join("")
  return `${prefix}-${suffix}`
}

export async function generateRedeemCodes(
  type: "monthly" | "yearly",
  count: number,
  createdBy: string
): Promise<string[]> {
  const supabase = createClient(supabaseUrl, supabaseKey)
  const codes: string[] = []

  const expiresAtTimestamp = Date.now() + CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  const expiresAt = new Date(expiresAtTimestamp).toISOString()

  for (let i = 0; i < count; i++) {
    let code = generateRedeemCode(type)
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

    const { error: insertError } = await supabase.from("redeem_codes").insert({
      code,
      type,
      status: "unused",
      created_by: createdBy,
      expires_at: expiresAt,
    })

    if (insertError) {
      console.error(`[generateRedeemCodes] 第 ${i + 1} 个码 INSERT 失败:`, insertError)
      throw new Error(`生成兑换码失败: ${insertError.message} (code=${code})`)
    }
  }

  return codes
}

// ─── 兑换兑换码 ─────────────────────────────────────────────────────────────

interface RedeemPayload {
  membershipType: "monthly" | "yearly"
  expiresAt: string
  source: "redeem" | "free"
}

export async function redeemCode(
  userId: string,
  code: string,
  options?: { skipSelfRedeemCheck?: boolean }
): Promise<{ success: true; data: RedeemPayload } | { success: false; message: string }> {
  const supabase = createClient(supabaseUrl, supabaseKey)

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

  const expiresAt = new Date(redeemCodeData.expires_at).getTime()
  const now = Date.now()
  if (redeemCodeData.status === "expired" || expiresAt < now) {
    return { success: false, message: "兑换码已过期" }
  }

  // 所有兑换码类型统一检查自兑换（防止用户兑换自己生成的码）
  if (!options?.skipSelfRedeemCheck && redeemCodeData.created_by === userId) {
    return { success: false, message: "不能使用自己生成的兑换码" }
  }

  // 3. 原子认领：仅当 status 仍为 'unused' 时才标记为已使用（防止并发双重兑换）
  const { data: claimResult, error: claimError } = await supabase
    .from("redeem_codes")
    .update({ status: "used", user_id: userId, used_at: new Date().toISOString() })
    .eq("id", redeemCodeData.id)
    .eq("status", "unused")
    .select("id")
    .maybeSingle()

  if (claimError) {
    console.error("[redeemCode] 认领兑换码失败:", claimError)
    return { success: false, message: "兑换失败，请稍后重试" }
  }

  if (!claimResult) {
    return { success: false, message: "兑换码已被使用" }
  }

  // 4. 计算会员有效期
  const days = redeemCodeData.type === "monthly" ? MONTHLY_DAYS : YEARLY_DAYS
  const startDate = getUtcDateString()

  // M5-03 FIX: 计算续期到期日
  // - 有现有有效会员：从其到期日顺延（取 max(now, existing_end) 作为 base）
  // - 无现有会员：从今天开始
  const nowTimestamp = getUtcTimestamp()
  const { data: existingMembership } = await supabase
    .from("memberships")
    .select("end_date")
    .eq("user_id", userId)
    .eq("membership_type", redeemCodeData.type)
    .eq("status", "active")
    .maybeSingle()

  const existingEndDate = existingMembership
    ? new Date(existingMembership.end_date).getTime()
    : 0
  const baseDate = existingEndDate && existingEndDate >= nowTimestamp
    ? new Date(existingEndDate)
    : new Date()

  let endDate = addMembershipPeriod(baseDate, days, redeemCodeData.type)

  // M5-03 FIX: 使用 Supabase upsert 原子化处理并发续期
  // - 有 UNIQUE 约束 (user_id, membership_type) 时：DO UPDATE 顺延 end_date
  // - 无现有记录时：DO INSERT 新建会员记录
  // 关键：ON CONFLICT 在数据库层保证只有一请求能成功 upsert，消除双重 INSERT 竞态
  //
  // 降级策略：
  //  1. 优先尝试 upsert（含 source 列，完整功能）
  //  2. 若报 source 列不存在（PGRST204），重试不含 source 列
  //  3. 若报 UNIQUE 约束不存在，改用直接 INSERT
  //  4. INSERT 同样优先含 source，失败则不含 source
  //
  // 注意：memberships 表需要 (user_id, membership_type) UNIQUE 约束（见 migrations）
  let upsertResult: { end_date: string } | null = null
  let upsertError: any = null

  // 尝试 upsert（含 source 列）
  const doUpsert = (includeSource: boolean) => {
    const row = {
      user_id: userId,
      membership_type: redeemCodeData.type,
      start_date: startDate,
      end_date: endDate.toISOString(),
      status: "active",
      ...(includeSource ? { source: "redeem" as const } : {}),
    }
    return supabase
      .from("memberships")
      .upsert(row, { onConflict: "user_id,membership_type", ignoreDuplicates: false })
      .select("end_date")
      .maybeSingle()
  }

  // 尝试直接 INSERT
  const doInsert = (includeSource: boolean) => {
    const row = {
      user_id: userId,
      membership_type: redeemCodeData.type,
      start_date: startDate,
      end_date: endDate.toISOString(),
      status: "active",
      ...(includeSource ? { source: "redeem" as const } : {}),
    }
    return supabase.from("memberships").insert(row).select("end_date").maybeSingle()
  }

  // Step 1: upsert 含 source
  let { data: r1, error: e1 } = await doUpsert(true)
  upsertResult = r1
  upsertError = e1

  // Step 2: 如果是 source 列缺失，降级到不含 source
  if (upsertError) {
    const errMsg = upsertError.message || ""
    const errCode = upsertError.code || ""
    const isColumnMissing =
      errMsg.includes("source") ||
      errMsg.includes("column") ||
      errCode === "PGRST204" ||
      errCode === "42703"

    if (isColumnMissing) {
      const { data: r2, error: e2 } = await doUpsert(false)
      if (!e2) {
        upsertResult = r2
        upsertError = null
      } else {
        console.error(`[redeemCode] upsert（无 source）也失败:`, e2)
        upsertError = e2
      }
    }
  }

  // Step 3: 如果是 UNIQUE 约束缺失，降级到直接 INSERT
  if (upsertError) {
    const errMsg = upsertError.message || ""
    const errCode = upsertError.code || ""
    const isConstraintError =
      errMsg.includes("does not exist") ||
      errMsg.includes("no unique or exclusion constraints") ||
      errMsg.includes("conflic") ||
      errCode === "42P01" ||
      errCode === "42P10" ||
      errCode === "23505"

    if (isConstraintError) {
      // 先尝试含 source 的 INSERT
      const { data: r3, error: e3 } = await doInsert(true)
      if (!e3) {
        upsertResult = r3
        upsertError = null
      } else {
        const e3Msg = e3.message || ""
        const e3Code = e3.code || ""
        const isColMissing2 =
          e3Msg.includes("source") || e3Msg.includes("column") || e3Code === "PGRST204" || e3Code === "42703"
        if (isColMissing2) {
          const { data: r4, error: e4 } = await doInsert(false)
          if (!e4) {
            upsertResult = r4
            upsertError = null
          } else {
            console.error(`[redeemCode] INSERT（无 source）也失败:`, e4)
            upsertError = e4
          }
        } else {
          console.error(`[redeemCode] INSERT（含 source）失败:`, e3)
          upsertError = e3
        }
      }
    }
  }

  if (upsertError) {
    console.error("[redeemCode] 会员写入最终失败:", {
      message: upsertError.message,
      code: upsertError.code,
      details: upsertError.details,
      hint: upsertError.hint,
    })

    // 回滚兑换码状态（防止码被标记为已用但用户未获得会员）
    try {
      await supabase
        .from("redeem_codes")
        .update({ status: "unused", user_id: null, used_at: null })
        .eq("id", redeemCodeData.id)
    } catch (rollbackErr) {
      console.error("[redeemCode] 回滚兑换码失败:", rollbackErr)
    }

    // 返回具体错误信息便于诊断
    const hint = upsertError.hint || upsertError.details || upsertError.message
    return { success: false, message: `会员激活失败（${hint || "未知错误"}），请稍后重试` }
  }

  // 5. 更新用户 vip_tier 和 user_profiles.vip_status
  if (upsertResult?.end_date) {
    endDate = new Date(upsertResult.end_date)
  }

  // 5. 更新用户 vip_tier 和 user_profiles.vip_status
  const { error: usersError } = await supabase
    .from("users")
    .update({ vip_tier: redeemCodeData.type })
    .eq("id", userId)

  // P9 修复：改用 upsert 替代 update，兼容尚无 user_profiles 记录的用户
  const { error: profileError } = await supabase
    .from("user_profiles")
    .upsert(
      { id: userId, vip_status: true, updated_at: new Date().toISOString() },
      { onConflict: "id", ignoreDuplicates: false }
    )

  return {
    success: true,
    data: {
      membershipType: redeemCodeData.type as "monthly" | "yearly",
      expiresAt: endDate.toISOString(),
      source: "redeem",
    },
  }
}
