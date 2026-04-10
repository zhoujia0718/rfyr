/**
 * GET /api/referral/info
 * 获取当前用户的邀请信息
 * 需要登录
 */

import { NextRequest, NextResponse } from "next/server"
import { getReferralInfo } from "@/lib/referral"
import { resolveAppUserId } from "@/lib/app-user-id"

export const dynamic = "force-dynamic"

export async function GET() {
  const userId = await resolveAppUserId()
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  const info = await getReferralInfo(userId)
  if (!info) {
    return NextResponse.json({ error: "未找到邀请信息" }, { status: 404 })
  }

  return NextResponse.json(info)
}
