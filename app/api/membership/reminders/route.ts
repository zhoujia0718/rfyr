/**
 * ============================================================
 * GET /api/membership/reminders
 *
 * 获取当前用户的会员到期提醒信息
 *
 * P10 修复：添加会员到期提醒机制
 * - 会员到期前 3 天显示横幅提醒
 * - 会员已到期显示提示
 * ============================================================
 */
import { NextRequest, NextResponse } from "next/server"
import { getUserIdFromBearer } from "@/lib/server-auth-user"
import { getMembershipInfo } from "@/lib/membership-utils"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromBearer(request)

  if (!userId) {
    return NextResponse.json({ showReminder: false })
  }

  try {
    const info = await getMembershipInfo(userId)

    if (!info.endDate) {
      return NextResponse.json({ showReminder: false })
    }

    const endDate = new Date(info.endDate)
    const now = new Date()
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

    // 已过期
    if (daysRemaining < 0) {
      return NextResponse.json({
        showReminder: true,
        type: "expired",
        daysRemaining,
        message: `您的${info.isMonthly ? "月卡" : info.isYearly ? "年度VIP" : "会员"}已于 ${Math.abs(daysRemaining)} 天前到期，续费可继续享受专属权益`,
      })
    }

    // 3 天内到期
    if (daysRemaining <= 3) {
      return NextResponse.json({
        showReminder: true,
        type: "expiring",
        daysRemaining,
        message: `您的${info.isMonthly ? "月卡" : info.isYearly ? "年度VIP" : "会员"}将在 ${daysRemaining} 天后到期，及时续费保障阅读不中断`,
      })
    }

    return NextResponse.json({ showReminder: false })
  } catch (err) {
    console.error("[Membership Reminders] 检查失败:", err)
    return NextResponse.json({ showReminder: false })
  }
}
