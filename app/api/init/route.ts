/**
 * GET /api/init
 *
 * 页面初始化一次性接口：将原本 3 个独立请求合并为 1 个
 *   - GET /api/membership/status   → membershipInfo
 *   - GET /api/reading-limit       → readingLimit
 *   - GET /api/reading-settings    → settings
 *
 * 减少客户端首屏请求瀑布（3 round-trips → 1），降低感知延迟约 200-400ms。
 *
 * 未登录时：只返回 settings（reading-settings）和空的 membershipInfo；
 *           readingLimit 返回 null（客户端降级为游客流程）。
 */
import { NextRequest, NextResponse } from "next/server"
import { getUserIdFromBearer } from "@/lib/server-auth-user"
import { getMembershipInfo } from "@/lib/membership-utils"
import { getReadingSettings } from "@/lib/reading-settings"
import { supabaseAdmin } from "@/lib/supabase"
import { toLocalDateString } from "@/lib/utils"
import { MEMBER_TIERS } from "@/lib/member-tiers"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // 并行：认证 + 读取设置（settings 不依赖 userId）
  const [userId, settings] = await Promise.all([
    getUserIdFromBearer(request),
    getReadingSettings(),
  ])

  // 未登录：只返回 settings
  if (!userId) {
    return NextResponse.json({
      authenticated: false,
      membership: { tier: MEMBER_TIERS.NONE },
      readingLimit: null,
      settings,
    })
  }

  // 已登录：并行查询会员 + 阅读记录
  const [memberInfo, profileResult] = await Promise.all([
    getMembershipInfo(userId),
    supabaseAdmin
      ? supabaseAdmin
          .from("user_profiles")
          .select("notes_read_count, notes_read_ids, today_read_ids, bonus_read_count, bonus_daily_count, bonus_daily_reset_date, daily_read_count, last_read_date")
          .eq("id", userId)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const today = toLocalDateString()
  const data = (profileResult as any).data

  // lastReadDate 判断是否为同一天（北京时间）
  const lastReadDate = typeof data?.last_read_date === "string"
    ? data.last_read_date.split("T")[0]
    : null
  // 每日已读数 = today_read_ids 数组长度（同一天内有效，跨天由 recordUserReadAtomic 重置为空数组）
  const todayReadIds: string[] = (data?.today_read_ids as string[] | null | undefined) ?? []
  const dailyReadCount = lastReadDate === today ? todayReadIds.length : 0

  const resetDate = typeof data?.bonus_daily_reset_date === "string"
    ? data.bonus_daily_reset_date.split("T")[0]
    : null
  const dailyBonusCount = resetDate === today ? Number(data?.bonus_daily_count ?? 0) : 0

  return NextResponse.json({
    membership: {
      tier: memberInfo.tier,
      endDate: memberInfo.endDate ?? null,
      daysRemaining: memberInfo.daysRemaining ?? null,
      isMonthly: memberInfo.isMonthly,
      isYearly: memberInfo.isYearly,
      isPermanent: memberInfo.isPermanent,
    },
    readingLimit: {
      readCount: Number(data?.notes_read_count ?? 0),
      readIds: data?.notes_read_ids ?? [],
      todayReadIds: data?.today_read_ids ?? [],
      dailyReadCount,
      bonusCount: Number(data?.bonus_read_count ?? 0),
      dailyBonusCount,
    },
    settings,
  })
}
