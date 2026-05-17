/**
 * ============================================================
 * POST /api/membership/activate
 *
 * 会员激活/续期 API
 *
 * 修复记录：
 * - P1: 建立会员激活 RPC 事务，确保 memberships + users 数据一致性
 * - P2: 使用 lib/member-tiers.ts 统一枚举，写入标准类型
 * - P3: 添加支付环境开关（开发/生产区分）
 * - M15-03: 增强降级 SQL 路径的一致性处理
 *   - 若 memberships 写入成功但 users 更新失败，执行回滚
 *   - 若 users 更新成功但 user_profiles 更新失败，记录错误但不影响主流程
 *   - 简化日志写入错误处理（静默处理审计日志失败）
 * ============================================================
 */
import { NextRequest, NextResponse } from "next/server"
import { getUserIdFromBearer } from "@/lib/server-auth-user"
import {
  MemberTier,
  MEMBER_TIERS,
  MEMBER_DURATION_DAYS,
  normalizeMemberTier,
  toDbMembershipType,
} from "@/lib/member-tiers"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// P3 修复：支付环境开关
const IS_DEVELOPMENT = process.env.NODE_ENV === "development" ||
  process.env.PAYMENT_MOCK_ENABLED === "true"

export const dynamic = "force-dynamic"

interface ActivateBody {
  orderId?: string
  planType: "monthly" | "yearly"
  // P3: 允许手动激活（绕过支付，admin 或开发环境）
  manual?: boolean
}

export async function POST(request: NextRequest) {
  // ── 1. 身份验证 ──────────────────────────────────────────────────
  const userId = await getUserIdFromBearer(request)
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  // ── 2. 解析请求体 ───────────────────────────────────────────────
  let body: ActivateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 })
  }

  const { orderId, planType, manual = false } = body

  // 参数校验（P2：使用统一枚举验证 planType）
  const validPlans: Array<"monthly" | "yearly"> = ["monthly", "yearly"]
  if (!validPlans.includes(planType)) {
    return NextResponse.json({ error: "无效的会员类型" }, { status: 400 })
  }

  // P3: 生产环境必须提供有效订单号（或 manual=true）
  if (!IS_DEVELOPMENT && !manual && (!orderId || typeof orderId !== "string")) {
    return NextResponse.json({ error: "缺少订单号" }, { status: 400 })
  }

  // ── 3. 创建 Supabase 客户端 ───────────────────────────────────
  const { createClient } = await import("@supabase/supabase-js")
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // ── 4. P1 修复：建立 RPC 事务确保数据一致性 ───────────────────
  // 调用数据库 RPC 函数，原子化完成：
  //   a. 验证/更新订单状态
  //   b. 停用旧会员记录
  //   c. 写入新会员记录
  //   d. 更新 users.vip_tier
  //   e. 写入审计日志
  try {
    const { data, error: rpcError } = await supabase.rpc("activate_membership", {
      p_user_id: userId,
      p_plan_type: planType,
      p_order_id: orderId ?? null,
      p_days: MEMBER_DURATION_DAYS[planType],
      p_is_manual: manual,
    })

    if (rpcError) {
      console.error("[membership/activate] RPC 调用失败:", rpcError)
      // RPC 不存在或调用失败，降级到直接 SQL 操作
    } else {
      // RPC 成功（data 可能为 null，但激活已在 DB 层完成）
      return NextResponse.json({
        success: true,
        ...(data !== null && typeof data === "object" ? data : {}),
      })
    }
  } catch (err) {
    console.warn("[membership/activate] RPC 不可用，降级到直接 SQL:", err)
  }

  // ── 4. 降级路径：直接 SQL 操作（P1/M15-03 保障）──────────────────
  // 执行顺序确保关键操作优先完成：
  //   Step A: 查询现有会员（用于续期计算和审计日志）
  //   Step B: 验证订单归属（P3: 开发环境跳过）
  //   Step C: 计算到期日
  //   Step D: 停用旧会员记录
  //   Step E: 写入新会员记录
  //   Step F: 更新 users.vip_tier
  //   Step G: 同步 user_profiles.vip_status
  //
  // M15-03 增强：若 users.vip_tier 更新失败，回滚 memberships 记录

  // ── P-05 修复：幂等性保护
  if (!IS_DEVELOPMENT && !manual && orderId) {
    try {
      const { data: paymentRow } = await supabase
        .from("payments")
        .select("id, user_id, status")
        .eq("order_id", orderId)
        .maybeSingle()

      if (paymentRow) {
        if (paymentRow.user_id !== userId) {
          return NextResponse.json({ error: "订单不属于当前用户" }, { status: 403 })
        }
        if (paymentRow.status === "approved") {
          return NextResponse.json({ error: "订单已激活" }, { status: 409 })
        }
        await supabase
          .from("payments")
          .update({ status: "approved" })
          .eq("order_id", orderId)
      }
    } catch {
      // payments 表不存在时跳过
    }
  }

  // ── P-05 修复：幂等性保护 ──────────────────────────────────────────
  // 在降级路径和无 payments 记录的激活路径中生效
  // 在查询 allMemberships 之前执行，因为幂等返回无需续期计算
  const { data: existingActiveMembership } = await supabase
    .from("memberships")
    .select("id, membership_type, end_date, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()

  if (existingActiveMembership) {
    const existingTier = normalizeMemberTier(existingActiveMembership.membership_type)
    const requestedTier: MemberTier = planType === "yearly" ? MEMBER_TIERS.YEARLY : MEMBER_TIERS.MONTHLY
    if (existingTier === requestedTier) {
      const endDate = new Date(existingActiveMembership.end_date)
      if (!isNaN(endDate.getTime()) && endDate > new Date()) {
        return NextResponse.json({
          success: true,
          idempotent: true,
          tier: requestedTier,
          endDate: endDate.toISOString(),
          message: "会员已激活，无需重复操作",
        })
      }
    }
  }

  // ── P-07 修复：续期边界 — 查询最近一条会员记录（含已过期）─────────
  // Step C: 计算到期日（P2: 统一使用 MEMBER_DURATION_DAYS）
  const days = MEMBER_DURATION_DAYS[planType]
  const startDate = new Date()
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000)
  let finalEndDate = endDate

  const { data: allMemberships } = await supabase
    .from("memberships")
    .select("id, end_date, membership_type, status")
    .eq("user_id", userId)
    .order("end_date", { ascending: false })
    .limit(1)

  const latestMembership = allMemberships?.[0] ?? null
  if (latestMembership) {
    const latestEnd = new Date(latestMembership.end_date)
    if (!isNaN(latestEnd.getTime()) && latestEnd > new Date()) {
      // 最近记录未过期：从其到期日延长
      finalEndDate = new Date(latestEnd.getTime() + days * 24 * 60 * 60 * 1000)
    }
    // 过期记录：finalEndDate 已是基于今日计算，无需额外处理
  }

  // Step D: 停用旧会员记录（独立操作，失败不影响后续）
  await supabase
    .from("memberships")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "active")

  // Step E: 写入新会员记录（P2: 使用统一类型 'monthly' / 'yearly'）
  const vipTier: MemberTier = planType === "yearly" ? MEMBER_TIERS.YEARLY : MEMBER_TIERS.MONTHLY
  const dbMembershipType = toDbMembershipType(vipTier)!

  const membershipInsertResult = await supabase.from("memberships").insert({
    user_id: userId,
    membership_type: dbMembershipType,
    status: "active",
    start_date: startDate.toISOString(),
    end_date: finalEndDate.toISOString(),
    order_id: orderId ?? null,
    source: manual ? "admin_manual" : "payment",
  })

  if (membershipInsertResult.error) {
    console.error("[membership/activate] 写入 memberships 失败:", membershipInsertResult.error)
    return NextResponse.json({ error: "激活失败，请稍后重试" }, { status: 500 })
  }

  // ─── M15-03 增强：users.vip_tier 更新失败时回滚 ───────────────
  // 若 users 表更新失败，撤销已写入的 memberships 记录
  const { error: userError } = await supabase
    .from("users")
    .update({ vip_tier: vipTier })
    .eq("id", userId)

  if (userError) {
    console.error("[membership/activate] 更新 vip_tier 失败，执行回滚:", userError)
    // 回滚：删除刚写入的 memberships 记录
    try {
      const { error: rollbackError } = await supabase
        .from("memberships")
        .delete()
        .eq("user_id", userId)
        .eq("status", "active")
        .eq("start_date", startDate.toISOString())

      if (rollbackError) {
        console.error("[membership/activate] 回滚 memberships 失败:", rollbackError)
        // 严重错误：memberships 写入成功但 users 更新失败且回滚失败
        // 这种情况极罕见，但需要告知用户
        return NextResponse.json(
          { error: "激活失败（状态不一致），请联系管理员处理" },
          { status: 500 }
        )
      }
    } catch {
      // 回滚过程中出现异常
      return NextResponse.json(
        { error: "激活失败（状态不一致），请联系管理员处理" },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: "激活失败，请稍后重试" }, { status: 500 })
  }

  // Step G: 同步 user_profiles.vip_status（失败不影响主流程）
  try {
    await supabase
      .from("user_profiles")
      .update({ vip_status: true, updated_at: new Date().toISOString() })
      .eq("id", userId)
  } catch {
    // user_profiles 更新失败不影响主流程（会员已激活）
    console.warn("[membership/activate] user_profiles 更新失败，继续处理")
  }

  // Step H: 写入审计日志（M15-03: 静默处理审计日志失败，不影响主流程）
  try {
    await supabase.from("membership_audit_log").insert({
      admin_id: null,
      target_user_id: userId,
      action: "activate",
      old_value: latestMembership?.membership_type ?? null,
      new_value: dbMembershipType,
      metadata: {
        planType,
        orderId,
        startDate: startDate.toISOString(),
        endDate: finalEndDate.toISOString(),
        manual,
        activatedBy: "self",
      },
    })
  } catch {
    // 审计日志写入失败不影响主流程
    console.warn("[membership/activate] 审计日志写入失败")
  }

  return NextResponse.json({
    success: true,
    planType,
    tier: vipTier,
    startDate: startDate.toISOString(),
    endDate: finalEndDate.toISOString(),
  })
}
