/**
 * 开发环境快捷登录 API
 * 仅在开发环境可用，用于快速测试不同会员状态
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
  // 只允许开发环境使用
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not available in production" })
  }

  // 从 users 表中获取第一个用户作为测试用户
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data: users, error } = await supabase
    .from("users")
    .select("id, vip_tier")
    .limit(1)

  if (error || !users || users.length === 0) {
    return NextResponse.json({ ok: false, error: "No users found" })
  }

  const testUser = users[0]
  return NextResponse.json({
    ok: true,
    userId: testUser.id,
    tier: testUser.vip_tier || "none",
    message: "测试用户登录成功",
  })
}
