/**
 * POST /api/redeem
 * 兑换兑换码
 * 请求体：{ code: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { redeemCode } from "@/lib/redeem"
import { getUserIdFromBearer } from "@/lib/server-auth-user"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code } = body

    if (!code || typeof code !== "string") {
      return NextResponse.json({ success: false, message: "请输入兑换码" }, { status: 400 })
    }

    const userId = await getUserIdFromBearer(request)
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "请先登录。若已登录仍提示此项，请退出后使用邮箱密码重新登录再兑换。",
        },
        { status: 401 }
      )
    }

    const result = await redeemCode(userId, code.trim())

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...result.data })
  } catch (err: any) {
    console.error("[Redeem] 兑换失败:", err)
    return NextResponse.json({ success: false, message: err.message || "兑换失败" }, { status: 500 })
  }
}
