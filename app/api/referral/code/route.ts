/**
 * GET /api/referral/code
 * 获取当前用户的邀请码，无则自动创建
 */
import { NextRequest, NextResponse } from "next/server"
import { getUserIdFromBearer } from "@/lib/server-auth-user"

export const dynamic = "force-dynamic"

async function getSupabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js")
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  // 优先用 service role key，备选 anon key（referrer_codes RLS 已开放读取）
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(request: NextRequest) {
  console.log("[Referral API] headers:", {
    authorization: request.headers.get("authorization"),
    x_user_id: request.headers.get("x-user-id"),
    cookie: request.headers.get("cookie"),
  })

  const userId = await getUserIdFromBearer(request)
  console.log("[Referral API] getUserIdFromBearer 返回:", userId)

  if (!userId) {
    console.log("[Referral API] 未通过认证，返回 401")
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  let supabase
  try {
    supabase = await getSupabaseAdmin()
  } catch (err) {
    console.error("[Referral] 创建 Supabase 客户端失败:", err)
    return NextResponse.json({ error: "服务配置错误" }, { status: 500 })
  }

  // 查已有
  const { data: existing, error: selectErr } = await supabase
    .from("referrer_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle()

  if (selectErr) {
    console.error("[Referral] 查询邀请码失败:", selectErr)
    return NextResponse.json({ error: `查询失败: ${selectErr.message}` }, { status: 500 })
  }

  if (existing?.code) {
    return NextResponse.json({ code: existing.code })
  }

  // 无则创建
  const chars = "abcdefghijkmnpqrstuvwxyz23456789"
  let code = ""
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }

  const { data, error: insertErr } = await supabase
    .from("referrer_codes")
    .insert({ user_id: userId, code })
    .select("code")
    .maybeSingle()

  if (insertErr) {
    console.error("[Referral] 创建邀请码失败:", insertErr)
    return NextResponse.json({ error: `创建失败: ${insertErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ code: data!.code })
}
