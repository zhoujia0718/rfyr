/**
 * ============================================================
 * PUT /api/admin/membership/operations
 *
 * 批量会员操作：renew / cancel / upgrade / downgrade
 *
 * 修复记录：
 * - P2: 使用统一 MemberTier，不再使用 monthly_vip / annual_vip
 * - P8: 添加审计日志记录
 * - P1: 使用 RPC 函数确保数据一致性
 * ============================================================
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdmin, parseAdminFromCookie } from "@/lib/server-admin-auth"
import { MEMBER_DURATION_DAYS } from "@/lib/member-tiers"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface RequestBody {
  action: "renew" | "cancel" | "upgrade" | "downgrade"
  membershipId: string
  userId?: string
  planType?: "monthly" | "yearly"
}

export async function PUT(request: NextRequest) {
  // 1. 管理员认证
  const authError = requireAdmin(request)
  if (authError) return authError

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
  }

  const { action, membershipId, userId, planType } = body
  const { userId: adminId } = parseAdminFromCookie(request)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 2. 参数校验
  const ALLOWED_ACTIONS = ['renew', 'cancel', 'upgrade', 'downgrade'] as const
  const ALLOWED_PLANS = ['monthly', 'yearly', 'permanent'] as const

  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "无效的操作类型" }, { status: 400 })
  }

  if (!membershipId) {
    return NextResponse.json({ error: "缺少 membershipId" }, { status: 400 })
  }

  // ── renew ──────────────────────────────────────────────────────
  if (action === "renew") {
    const { data: membership } = await supabase
      .from("memberships")
      .select("membership_type, end_date, user_id")
      .eq("id", membershipId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "会员记录不存在" }, { status: 404 })
    }

    // P2 修复：统一类型判断
    const tier = String(membership.membership_type ?? '').toLowerCase().replace(/[_]/g, '')
    const isYearly = tier.includes('year') || tier.includes('annual')
    const days = isYearly ? MEMBER_DURATION_DAYS.yearly : MEMBER_DURATION_DAYS.monthly

    const currentEnd = new Date(membership.end_date)
    const base = currentEnd > new Date() ? currentEnd : new Date()
    const newEnd = new Date(base)
    newEnd.setUTCDate(newEnd.getUTCDate() + days)

    // P8: 使用 RPC 写入（确保一致性 + 审计）
    let rpcSucceeded = false
    const { data, error: rpcError } = await supabase.rpc("activate_membership", {
      p_user_id: membership.user_id,
      p_plan_type: isYearly ? "yearly" : "monthly",
      p_days: days,
      p_is_manual: true,
    })

    if (!rpcError) {
      rpcSucceeded = true
    } else {
      // RPC 不可用时降级
      console.error("[AdminMembershipOps] RPC activate_membership 失败，降级为直接更新:", rpcError)
      const { error: fallbackError } = await supabase
        .from("memberships")
        .update({ end_date: newEnd.toISOString().split("T")[0], status: "active" })
        .eq("id", membershipId)

      if (fallbackError) {
        console.error("[AdminMembershipOps] 降级更新也失败:", fallbackError)
        return NextResponse.json(
          { error: "续费操作失败，请稍后重试" },
          { status: 500 }
        )
      }
    }

    // 写入审计日志（静默失败，不影响主流程）
    ;(async () => {
      try {
        await supabase.from("membership_audit_log").insert({
          admin_id: adminId,
          target_user_id: membership.user_id,
          action: "renew",
          old_value: membership.membership_type,
          new_value: membership.membership_type,
          metadata: { days, newEndDate: newEnd.toISOString() },
        })
      } catch { /* ignore */ }
    })()

    return NextResponse.json({
      success: true,
      message: `会员已成功续费${isYearly ? "一年" : "30天"}`,
    })
  }

  // ── cancel ──────────────────────────────────────────────────────
  if (action === "cancel") {
    const { data: membership } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("id", membershipId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "会员记录不存在" }, { status: 404 })
    }

    // P8: 使用 RPC
    const { error: cancelRpcError } = await supabase.rpc("cancel_membership", {
      p_user_id: membership.user_id,
    })

    if (cancelRpcError) {
      // 降级：直接 SQL
      console.error("[AdminMembershipOps] RPC cancel_membership 失败，降级:", cancelRpcError)
      const [profileResult, userResult, deleteResult] = await Promise.all([
        supabase.from("user_profiles").update({ vip_status: false, updated_at: new Date().toISOString() }).eq("id", membership.user_id),
        supabase.from("users").update({ vip_tier: "none" }).eq("id", membership.user_id),
        supabase.from("memberships").delete().eq("id", membershipId),
      ])

      if (profileResult.error || userResult.error || deleteResult.error) {
        return NextResponse.json(
          { error: "取消会员失败，请稍后重试" },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true, message: "会员已取消" })
  }

  // ── upgrade ─────────────────────────────────────────────────────
  if (action === "upgrade") {
    if (!userId || !planType) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 })
    }
    if (!ALLOWED_PLANS.includes(planType)) {
      return NextResponse.json({ error: "无效的会员类型" }, { status: 400 })
    }

    const days = MEMBER_DURATION_DAYS[planType]

    const { error: upgradeRpcError } = await supabase.rpc("activate_membership", {
      p_user_id: userId,
      p_plan_type: planType,
      p_days: days,
      p_is_manual: true,
    })

    if (upgradeRpcError) {
      // 降级
      console.error("[AdminMembershipOps] RPC activate_membership (upgrade) 失败，降级:", upgradeRpcError)
      const [userResult, profileResult, deleteResult] = await Promise.all([
        supabase.from("users").update({ vip_tier: planType }).eq("id", userId),
        supabase.from("user_profiles").update({ vip_status: true, updated_at: new Date().toISOString() }).eq("id", userId),
        supabase.from("memberships").delete().eq("user_id", userId),
      ])

      if (userResult.error || profileResult.error) {
        return NextResponse.json({ error: "升级失败，请稍后重试" }, { status: 500 })
      }

      const { error: insertError } = await supabase.from("memberships").insert({
        user_id: userId,
        membership_type: planType,
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        status: "active",
      })

      if (insertError) {
        return NextResponse.json({ error: "升级失败，请稍后重试" }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: `用户已成功升级为${planType === "yearly" ? "年卡" : "月卡"}会员`,
    })
  }

  // ── downgrade ────────────────────────────────────────────────────
  if (action === "downgrade") {
    if (!userId) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 })
    }

    const days = MEMBER_DURATION_DAYS.monthly
    const newEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    const [userResult, membershipResult] = await Promise.all([
      supabase.from("users").update({ vip_tier: "monthly" }).eq("id", userId),
      supabase.from("memberships").update({
        membership_type: "monthly",
        end_date: newEnd.toISOString().split("T")[0],
      }).eq("id", membershipId),
    ])

    if (userResult.error || membershipResult.error) {
      return NextResponse.json(
        { error: "降级操作失败，请稍后重试" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: "已降级为月卡" })
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 })
}
