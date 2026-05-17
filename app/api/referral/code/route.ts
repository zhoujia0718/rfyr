/**
 * GET /api/referral/code
 * 获取当前用户的邀请码，无则自动创建
 *
 * 安全修复：
 *   M5-10 FIX: 移除 require() 动态导入，统一使用顶层 import
 *   V-H-07 FIX: 使用加密安全的随机字节替代 Math.random()
 */
import { NextRequest, NextResponse } from "next/server"
import { getUserIdFromBearer } from "@/lib/server-auth-user"
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"

export const dynamic = "force-dynamic"

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromBearer(request)

  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // 查已有
  const { data: existing, error: selectErr } = await supabase
    .from("referrer_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle()

  if (selectErr) {
    return NextResponse.json({ error: `查询失败: ${selectErr.message}` }, { status: 500 })
  }

  if (existing?.code) {
    return NextResponse.json({ code: existing.code })
  }

  // P17 修复：无则创建，INSERT 冲突时最多重试 3 次
  // 使用十六进制字符（0-9a-f），与 verifyEmailCode 中 user.id.replace(/-/g,'').slice(0,8)
  // 生成的格式保持一致，确保 URL 参数 captureReferrerFromUrl 的格式校验能通过。
  let code = Array.from(randomBytes(8)).map(b => b % 16).map(n => n < 10 ? String(n) : String.fromCharCode(97 + n - 10)).join("")
  let insertedCode: string | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error: insertErr } = await supabase
      .from("referrer_codes")
      .insert({ user_id: userId, code })
      .select("code")
      .maybeSingle()

    if (!insertErr && data?.code) {
      insertedCode = data.code
      break
    }

    if (insertErr?.code === "23505") {
      // 唯一约束冲突：重新生成邀请码后重试
      code = Array.from(randomBytes(8)).map(b => b % 16).map(n => n < 10 ? String(n) : String.fromCharCode(97 + n - 10)).join("")
      continue
    }

    return NextResponse.json({ error: `创建失败: ${insertErr?.message}` }, { status: 500 })
  }

  if (!insertedCode) {
    return NextResponse.json({ error: "创建邀请码失败，请稍后重试" }, { status: 500 })
  }

  return NextResponse.json({ code: insertedCode })
}
