/**
 * GET /api/referral/info
 * 获取当前用户的邀请信息
 * 需要登录
 *
 * 安全修复：resolveAppUserId 只在客户端使用（依赖 window），
 * 服务端应使用 getUserIdFromBearer 从 Authorization header 获取用户 ID。
 */
import { NextRequest, NextResponse } from "next/server"
import { getReferralInfo } from "@/lib/referral"
import { getUserIdFromBearer } from "@/lib/server-auth-user"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromBearer(request)
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  const info = await getReferralInfo(userId)
  if (!info) {
    return NextResponse.json({ error: "未找到邀请信息" }, { status: 404 })
  }

  return NextResponse.json(info)
}
