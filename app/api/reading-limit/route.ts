/**
 * GET  /api/reading-limit  — 查询当前已读篇数和邀请奖励
 * POST /api/reading-limit  — 记录一次已读（body: { articleId: string }）
 *
 * 规则（2026-04-20 修订）：
 *   - 已登录用户：记录已读（/api/articles/[id] 负责强制校验，这里仅追踪）
 *   - bonus_read_count：非会员终身累计（写数据库）
 *   - bonus_daily_count：会员每日邀请奖励（createReferral 时写入 + 每天北京时间重置）
 *
 * P1 修复：recordVisit 使用条件 UPDATE 原子操作，消除 TOCTOU 竞态
 */
import { NextRequest, NextResponse } from "next/server"
import { recordVisit } from "@/lib/reading-limit"
import { supabaseAdmin } from "@/lib/supabase"
import { toLocalDateString } from "@/lib/utils"

export const dynamic = "force-dynamic"

async function getAuthUserId(request: NextRequest): Promise<string | null> {
  const { getUserIdFromBearer } = await import("@/lib/server-auth-user")
  return await getUserIdFromBearer(request)
}

export async function GET(request: NextRequest) {
  const userId = await getAuthUserId(request)

  // V-M-05 FIX: 未经认证时返回 401，不返回全零数据（防止用户数据枚举）
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  // 服务器未配置时返回 500（不等于未登录）
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "服务端配置错误" }, { status: 500 })
  }

  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("notes_read_count, notes_read_ids, today_read_ids, bonus_read_count, bonus_daily_count, bonus_daily_reset_date, daily_read_count, last_read_date")
    .eq("id", userId)
    .single()

  const today = toLocalDateString()
  const lastReadDate = typeof data?.last_read_date === "string" ? data.last_read_date.split("T")[0] : null
  const dailyReadCount = lastReadDate === today ? Number(data?.daily_read_count ?? 0) : 0

  // bonus_daily_count 已由 createReferral 维护（每天北京时间重置）
  const resetDate = typeof data?.bonus_daily_reset_date === "string"
    ? data.bonus_daily_reset_date.split("T")[0]
    : null
  const dailyBonusCount = (resetDate === today)
    ? Number(data?.bonus_daily_count ?? 0)
    : 0

  return NextResponse.json({
    readCount: Number(data?.notes_read_count ?? 0),
    readIds: data?.notes_read_ids ?? [],
    todayReadIds: data?.today_read_ids ?? [],
    dailyReadCount,
    bonusCount: Number(data?.bonus_read_count ?? 0),
    dailyBonusCount,
  })
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId(request)

  if (!userId) {
    return NextResponse.json({ success: false, message: "未登录" }, { status: 401 })
  }

  let body: { articleId?: string; dailyLimit?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: "无效请求体" }, { status: 400 })
  }

  const { articleId, dailyLimit } = body
  if (!articleId || typeof articleId !== "string") {
    return NextResponse.json({ success: false, message: "缺少 articleId" }, { status: 400 })
  }

  const data = await recordVisit(userId, articleId, dailyLimit)

  // 读取 bonus 信息（bonus_daily_count 由 createReferral 维护）
  let bonusCount = 0
  let dailyBonusCount = 0
  let resetDate: string | null = null
  if (supabaseAdmin) {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("bonus_read_count, bonus_daily_count, bonus_daily_reset_date")
      .eq("id", userId)
      .single()
    bonusCount = Number(profile?.bonus_read_count ?? 0)
    const today = toLocalDateString()
    const dbResetDate = typeof profile?.bonus_daily_reset_date === "string"
      ? profile.bonus_daily_reset_date.split("T")[0]
      : null
    resetDate = dbResetDate
    dailyBonusCount = dbResetDate === today ? Number(profile?.bonus_daily_count ?? 0) : 0
  }

  return NextResponse.json({
    success: true,
    ...data,
    bonusCount,
    dailyBonusCount,
  })
}
