/**
 * POST /api/referral/create-codes
 * 管理员生成兑换码
 * 请求体：{ type: "monthly" | "yearly", count: number }
 *
 * 安全修复：此 API 必须由管理员调用，添加了 requireAdmin 检查
 */
import { NextRequest, NextResponse } from "next/server"
import { generateRedeemCodes } from "@/lib/redeem"
import { requireAdmin, parseAdminFromCookie } from "@/lib/server-admin-auth"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  // 检查管理员权限
  const adminCheck = requireAdmin(request)
  if (adminCheck) {
    return adminCheck
  }

  try {
    const body = await request.json()
    const { type, count = 1 } = body

    if (!["monthly", "yearly"].includes(type)) {
      return NextResponse.json({ success: false, message: "type 必须是 monthly 或 yearly" }, { status: 400 })
    }

    const n = Math.min(Math.max(Number(count), 1), 50)

    // 从 admin session cookie 中获取 admin userId（HMAC 验证已在 requireAdmin 完成）
    const { userId: adminUserId } = parseAdminFromCookie(request)

    if (!adminUserId) {
      return NextResponse.json({ success: false, message: "无法获取管理员身份" }, { status: 401 })
    }

    const codes = await generateRedeemCodes(type as "monthly" | "yearly", n, adminUserId)

    return NextResponse.json({ success: true, codes })
  } catch (err: any) {
    console.error("[Referral] 生成兑换码失败:", err)
    return NextResponse.json({ success: false, message: err.message || "生成失败" }, { status: 500 })
  }
}
