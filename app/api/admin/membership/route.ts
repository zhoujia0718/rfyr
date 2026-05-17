/**
 * 管理员手动开通会员 API
 * P0-C FIX: 原页面 handleSubmit 是空壳，此接口提供真实开通逻辑
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdmin } from "@/lib/server-admin-auth"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 支持的会员类型和有效期（天）
const MEMBERSHIP_CONFIG: Record<string, { days: number; type: string }> = {
  monthly: { days: 30, type: "monthly" },
  yearly: { days: 365, type: "yearly" },
}

export async function POST(request: NextRequest) {
  // 1. 管理员认证
  const authError = requireAdmin(request)
  if (authError) return authError

  // 2. 解析参数
  let body: { userId?: string; membershipType?: string; duration?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
  }

  const { userId, membershipType, duration } = body

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "缺少 userId" }, { status: 400 })
  }
  if (!membershipType || !MEMBERSHIP_CONFIG[membershipType]) {
    return NextResponse.json(
      { error: "membershipType 必须是 monthly 或 yearly" },
      { status: 400 }
    )
  }
  const days = typeof duration === "number" && duration > 0 ? duration : MEMBERSHIP_CONFIG[membershipType].days
  const membershipTypeValue = MEMBERSHIP_CONFIG[membershipType].type

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 3. 验证用户存在
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, email, username")
    .eq("id", userId)
    .maybeSingle()

  if (userError || !user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 })
  }

  // 4. 计算到期日
  const startDate = new Date().toISOString()
  const endDate = new Date()
  endDate.setUTCDate(endDate.getUTCDate() + days)
  const endDateStr = endDate.toISOString()

  // 5. 写入 memberships 表
  // 检查是否已有有效会员，有则顺延，无则新建
  const { data: existing } = await supabase
    .from("memberships")
    .select("id, end_date")
    .eq("user_id", userId)
    .eq("membership_type", membershipTypeValue)
    .eq("status", "active")
    .maybeSingle()

  if (existing) {
    // 顺延
    const existingEnd = new Date(existing.end_date).getTime()
    const base = existingEnd > Date.now() ? new Date(existingEnd) : new Date()
    const newEnd = new Date(base)
    newEnd.setUTCDate(newEnd.getUTCDate() + days)
    await supabase
      .from("memberships")
      .update({ end_date: newEnd.toISOString() })
      .eq("id", existing.id)
  } else {
    // 新建
    await supabase.from("memberships").insert({
      user_id: userId,
      membership_type: membershipTypeValue,
      start_date: startDate,
      end_date: endDateStr,
      status: "active",
      source: "admin_manual",
    })
  }

  // 6. 更新 users.vip_tier
  await supabase
    .from("users")
    .update({ vip_tier: membershipTypeValue })
    .eq("id", userId)

  // 7. 同步更新 user_profiles.vip_status
  await supabase
    .from("user_profiles")
    .update({ vip_status: true, updated_at: new Date().toISOString() })
    .eq("id", userId)

  return NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, username: user.username },
    membership: {
      type: membershipTypeValue,
      days,
      endDate: endDateStr,
    },
  })
}
