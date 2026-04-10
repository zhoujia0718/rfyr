/**
 * POST /api/admin/login
 *
 * 后台管理员登录接口。
 * 验证用户凭证后，通过 Response Cookie 设置 session。
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim()) ?? []

export async function POST(request: NextRequest) {
  let email: string
  let password: string

  try {
    const body = await request.json()
    email = body.email?.trim()
    password = body.password
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "请输入用户名和密码" }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // 密码校验必须用 anon key：Service Role 客户端上 signInWithPassword 常无法按预期工作
  const supabaseAuth = createClient(supabaseUrl, anonKey)

  const { data: signInData, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError || !signInData.user) {
    return NextResponse.json({ ok: false, error: "用户名或密码错误" }, { status: 401 })
  }

  const userId = signInData.user.id

  // 权限校验：如果是 ADMIN_EMAILS 配置了白名单，则只允许白名单用户
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ ok: false, error: "您没有后台管理权限" }, { status: 403 })
  }

  const loginTime = Date.now()
  const sessionPayload = JSON.stringify({ userId, email, loginTime })

  // 登录成功：写入两个 cookie（双重保险）
  const response = NextResponse.json({
    ok: true,
    userId,
    email,
    message: "登录成功",
  })

  // admin-session-local：主要认证 cookie（JSON 格式，7天有效期）
  response.cookies.set("admin-session-local", sessionPayload, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    httpOnly: false,
  })

  // admin-session：直接存 userId（旧版兼容，7天有效期）
  response.cookies.set("admin-session", userId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    httpOnly: false,
  })

  return response
}
