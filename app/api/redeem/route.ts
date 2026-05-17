/**
 * POST /api/redeem
 * 兑换兑换码
 * 请求体：{ code: string }
 *
 * 安全修复：
 *   M5-07 FIX: 添加兑换码格式正则预校验，避免无效请求打到数据库
 */

import { NextRequest, NextResponse } from "next/server"
import { redeemCode } from "@/lib/redeem"
import { getUserIdFromBearer } from "@/lib/server-auth-user"

export const dynamic = "force-dynamic"

// 兑换码格式：RFYR-MONTH- 或 RFYR-YEAR- 后跟 6 位字符（去 I O 0 1）
const REDEEM_CODE_REGEX = /^RFYR-(MONTH|YEAR)-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code } = body

    if (!code || typeof code !== "string") {
      return NextResponse.json({ success: false, message: "请输入兑换码" }, { status: 400 })
    }

    // M5-07 FIX: 格式预校验（不查数据库，过滤无效请求）
    const normalizedCode = code.trim().toUpperCase()
    if (!REDEEM_CODE_REGEX.test(normalizedCode)) {
      return NextResponse.json(
        { success: false, message: "兑换码格式不正确，应为 RFYR-MONTH-XXXXXX 或 RFYR-YEAR-XXXXXX" },
        { status: 400 }
      )
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

    const result = await redeemCode(userId, normalizedCode)

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...result.data })
  } catch (err: any) {
    console.error("[/api/redeem] 兑换失败:", {
      message: err.message,
      code: err.code,
      details: err.details,
      stack: err.stack,
    })
    return NextResponse.json({ success: false, message: err.message || "兑换失败" }, { status: 500 })
  }
}
