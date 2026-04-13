/**
 * POST /api/referral/validate
 * 校验邀请码是否存在
 */
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ valid: false, message: "参数错误" }, { status: 400 })
  }

  const code = (body.code || "").trim()
  if (!code) {
    // 空码视为无邀请码，正常通过
    return NextResponse.json({ valid: true, exists: false })
  }

  const { createClient } = await import("@supabase/supabase-js")
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from("referrer_codes")
    .select("user_id")
    .eq("code", code.toLowerCase())
    .maybeSingle()

  if (error) {
    console.error("[Referral Validate] 查询失败:", error)
    return NextResponse.json({ valid: false, message: "校验失败，请稍后重试" }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ valid: false, message: "邀请码不存在，请核对后再填" })
  }

  return NextResponse.json({ valid: true, exists: true })
}
