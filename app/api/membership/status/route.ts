/**
 * GET /api/membership/status
 * 获取当前用户的会员状态
 * 使用 service role key 绕过 RLS，直接从 users 表读取 vip_tier
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // 从 header 获取 userId（由前端传入）
  const userIdHeader = request.headers.get("x-user-id")
  const authHeader = request.headers.get("authorization")

  let userId: string | null = null

  if (userIdHeader?.trim()) {
    userId = userIdHeader.trim()
  } else if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim()
    // 如果不是伪造 token，尝试验证真实 Supabase token
    if (!/^(pwd_|magic_|magic_refresh_|pwd_refresh_)/i.test(token)) {
      const supabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id ?? null
    }
  }

  if (!userId) {
    return NextResponse.json({ vip_tier: "none" })
  }

  // 用 service role key 直接查 users 表和 user_profiles 表
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("vip_tier")
    .eq("id", userId)
    .single()

  if (userError || !userRow) {
    return NextResponse.json({ vip_tier: "none" })
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("read_bonus")
    .eq("id", userId)
    .single()

  return NextResponse.json({
    vip_tier: userRow.vip_tier || "none",
    read_bonus: Number(profile?.read_bonus ?? 0),
  })
}
