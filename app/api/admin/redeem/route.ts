/**
 * POST /api/admin/redeem
 *
 * 管理员生成兑换码
 * 请求体：{ type: "weekly" | "yearly", count: number }
 *
 * GET /api/admin/redeem
 *
 * 查询兑换码列表（可选参数：status, type, page, limit）
 */

import { NextRequest, NextResponse } from "next/server"
import { generateRedeemCodes } from "@/lib/redeem"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = "force-dynamic"

/** 生成兑换码 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, count = 1 } = body

    if (!type || !["weekly", "yearly"].includes(type)) {
      return NextResponse.json({ ok: false, error: "type 必须是 weekly 或 yearly" }, { status: 400 })
    }

    if (typeof count !== "number" || count < 1 || count > 50) {
      return NextResponse.json({ ok: false, error: "数量必须在 1-50 之间" }, { status: 400 })
    }

    // 从 cookie 中读取 admin-session 获取管理员 ID
    const adminSessionCookie = request.cookies.get("admin-session")
    const adminSessionLocal = request.cookies.get("admin-session-local")

    let adminId = "unknown"
    if (adminSessionLocal?.value) {
      try {
        const session = JSON.parse(decodeURIComponent(adminSessionLocal.value))
        adminId = session.userId || "unknown"
      } catch {
        adminId = adminSessionCookie?.value || "unknown"
      }
    } else if (adminSessionCookie?.value) {
      adminId = adminSessionCookie.value
    }

    const codes = await generateRedeemCodes(type, count, adminId)

    return NextResponse.json({ ok: true, codes, type, count: codes.length })
  } catch (err: any) {
    console.error("[AdminRedeem] 生成失败:", err)
    return NextResponse.json({ ok: false, error: err.message || "生成失败" }, { status: 500 })
  }
}

/** 删除指定兑换码 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ ok: false, error: "缺少 id 参数" }, { status: 400 })
    }

    const { error } = await supabase.from("redeem_codes").delete().eq("id", id)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[AdminRedeem] 删除失败:", err)
    return NextResponse.json({ ok: false, error: err.message || "删除失败" }, { status: 500 })
  }
}

/** 管理员兑换（可兑换自己生成的码） */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { code } = body

    if (!code || typeof code !== "string") {
      return NextResponse.json({ ok: false, error: "请输入兑换码" }, { status: 400 })
    }

    // 从 cookie 中读取 admin-session 获取管理员 ID
    const adminSessionCookie = request.cookies.get("admin-session")
    const adminSessionLocal = request.cookies.get("admin-session-local")

    let adminId = "unknown"
    if (adminSessionLocal?.value) {
      try {
        const session = JSON.parse(decodeURIComponent(adminSessionLocal.value))
        adminId = session.userId || "unknown"
      } catch {
        adminId = adminSessionCookie?.value || "unknown"
      }
    } else if (adminSessionCookie?.value) {
      adminId = adminSessionCookie.value
    }

    if (!adminId || adminId === "unknown") {
      return NextResponse.json({ ok: false, error: "请先登录管理员账号" }, { status: 401 })
    }

    // 使用 skipSelfRedeemCheck 跳过自兑换检查
    const { redeemCode } = await import("@/lib/redeem")
    const result = await redeemCode(adminId, code.trim(), { skipSelfRedeemCheck: true })

    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, ...result.data })
  } catch (err: any) {
    console.error("[AdminRedeem] 兑换失败:", err)
    return NextResponse.json({ ok: false, error: err.message || "兑换失败" }, { status: 500 })
  }
}
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)

    const status = searchParams.get("status")
    const type = searchParams.get("type")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")))
    const offset = (page - 1) * limit

    let query = supabase
      .from("redeem_codes")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== "all") query = query.eq("status", status)
    if (type && type !== "all") query = query.eq("type", type)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      codes: data ?? [],
      total: count ?? 0,
      page,
      limit,
    })
  } catch (err: any) {
    console.error("[AdminRedeem] 查询失败:", err)
    return NextResponse.json({ ok: false, error: err.message || "查询失败" }, { status: 500 })
  }
}
