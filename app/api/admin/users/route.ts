/**
 * 管理员用户管理 API
 *
 * POST /api/admin/users — 创建用户
 *
 * BUG-PAGE-03 修复：
 * 之前 admin/users/create/page.tsx 的 handleSubmit 是假实现，
 * 只有 alert() 和 window.location.href，完全没有调用任何 API。
 * 现在通过此接口连接真实后端。
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server-admin-auth"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 邮箱格式校验
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// 用户名格式校验（字母、数字、下划线，3-32 位）
function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,32}$/.test(username)
}

export async function POST(request: NextRequest) {
  // 1. 管理员认证
  const authError = requireAdmin(request)
  if (authError) return authError

  // 2. 解析参数
  let body: {
    username?: string
    email?: string
    phone?: string
    nickname?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
  }

  const { username, email, phone, nickname } = body

  // 3. 参数校验
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "用户名不能为空" }, { status: 400 })
  }
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "用户名格式不正确（3-32 位，支持中文、字母、数字、下划线）" },
      { status: 400 }
    )
  }

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "邮箱不能为空" }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 })
  }

  // phone 和 nickname 为可选字段，但长度有限制
  if (phone && phone.length > 20) {
    return NextResponse.json({ error: "手机号长度不能超过 20 位" }, { status: 400 })
  }
  if (nickname && nickname.length > 50) {
    return NextResponse.json({ error: "昵称长度不能超过 50 位" }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 4. 检查用户名是否已存在
  const { data: existingByUsername, error: usernameError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username.trim())
    .maybeSingle()

  if (usernameError) {
    console.error("[AdminUsers] 检查用户名失败:", usernameError)
    return NextResponse.json({ error: "服务器错误，请稍后重试" }, { status: 500 })
  }

  if (existingByUsername) {
    return NextResponse.json({ error: "用户名已存在" }, { status: 409 })
  }

  // 5. 检查邮箱是否已存在
  const { data: existingByEmail, error: emailError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email.trim())
    .maybeSingle()

  if (emailError) {
    console.error("[AdminUsers] 检查邮箱失败:", emailError)
    return NextResponse.json({ error: "服务器错误，请稍后重试" }, { status: 500 })
  }

  if (existingByEmail) {
    return NextResponse.json({ error: "邮箱已被使用" }, { status: 409 })
  }

  // 6. 创建用户（事务化：users + user_profiles）
  // 先创建 users 表记录
  const { data: newUser, error: userError } = await supabase
    .from("users")
    .insert({
      username: username.trim(),
      email: email.trim(),
      phone: phone?.trim() || null,
      nickname: nickname?.trim() || username.trim(),
      vip_tier: "none",
      created_at: new Date().toISOString(),
    })
    .select("id, username, email, created_at")
    .single()

  if (userError || !newUser) {
    console.error("[AdminUsers] 创建用户失败:", userError)
    return NextResponse.json({ error: "创建用户失败，请稍后重试" }, { status: 500 })
  }

  // 再创建 user_profiles 表记录
  const { error: profileError } = await supabase
    .from("user_profiles")
    .insert({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      nickname: nickname?.trim() || newUser.username,
      vip_status: false,
      notes_read_count: 0,
      bonus_read_count: 0,
      daily_read_count: 0,
      bonus_daily_count: 0,
      monthly_free_used: false,
      monthly_purchase_count: 0,
    })

  if (profileError) {
    // 回滚：删除已创建的 users 记录
    console.error("[AdminUsers] 创建 user_profiles 失败，回滚 users 记录:", profileError)
    await supabase.from("users").delete().eq("id", newUser.id)
    return NextResponse.json({ error: "创建用户资料失败，已回滚" }, { status: 500 })
  }

  return NextResponse.json(
    {
      success: true,
      message: "用户创建成功",
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        created_at: newUser.created_at,
      },
    },
    { status: 201 }
  )
}
