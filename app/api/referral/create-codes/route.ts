/**
 * POST /api/referral/create-codes
 * 管理员生成兑换码
 * 请求体：{ type: "weekly" | "yearly", count: number }
 */

import { NextRequest, NextResponse } from "next/server"
import { generateRedeemCodes } from "@/lib/redeem"
import { resolveAppUserId } from "@/lib/app-user-id"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, count = 1 } = body

    if (!["weekly", "yearly"].includes(type)) {
      return NextResponse.json({ success: false, message: "type 必须是 weekly 或 yearly" }, { status: 400 })
    }

    const userId = await resolveAppUserId()
    if (!userId) {
      return NextResponse.json({ success: false, message: "请先登录" }, { status: 401 })
    }

    const n = Math.min(Math.max(Number(count), 1), 50)
    const codes = await generateRedeemCodes(type as "weekly" | "yearly", n, userId)

    return NextResponse.json({ success: true, codes })
  } catch (err: any) {
    console.error("[Referral] 生成兑换码失败:", err)
    return NextResponse.json({ success: false, message: err.message || "生成失败" }, { status: 500 })
  }
}
