/**
 * GET /api/membership/status
 * 获取当前用户的会员状态
 *
 * 修复记录：
 * - P2: 返回统一 MemberTier，响应格式标准化
 * - P3: 使用 getMembershipInfo 同时检查 memberships.end_date 和 users.vip_tier
 * ============================================================
 */
import { NextRequest, NextResponse } from "next/server"
import { getUserIdFromBearer } from "@/lib/server-auth-user"
import { getMembershipInfo } from "@/lib/membership-utils"
import { MEMBER_TIERS } from "@/lib/member-tiers"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromBearer(request)

  if (!userId) {
    return NextResponse.json({ tier: MEMBER_TIERS.NONE })
  }

  // P3 修复：使用 getMembershipInfo 统一检查 memberships 表（含 end_date）和 users.vip_tier
  const info = await getMembershipInfo(userId)

  return NextResponse.json({
    tier: info.tier,
    endDate: info.endDate ?? null,
    daysRemaining: info.daysRemaining ?? null,
    isMonthly: info.isMonthly,
    isYearly: info.isYearly,
    isPermanent: info.isPermanent,
  })
}
