/**
 * GET /api/referral/stats
 * 获取当前用户的邀请统计数据
 */
import { NextRequest, NextResponse } from "next/server"
import { getUserIdFromBearer } from "@/lib/server-auth-user"
import { getReferralInfo } from "@/lib/referral"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromBearer(request)

  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    const info = await getReferralInfo(userId)
    if (!info) {
      return NextResponse.json({ referralCount: 0, bonusReadCount: 0, bonusDailyCount: 0, membershipType: "none" })
    }
    return NextResponse.json({
      referralCount: info.referralCount,
      bonusReadCount: info.bonusReadCount,
      bonusDailyCount: info.bonusDailyCount,
      membershipType: info.membershipType,
      referrerCode: info.referrerCode,
    })
  } catch (e: any) {
    console.error("[Referral Stats] 获取失败:", e)
    return NextResponse.json({ error: "获取失败" }, { status: 500 })
  }
}
