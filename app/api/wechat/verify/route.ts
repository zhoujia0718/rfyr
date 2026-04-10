/**
 * POST /api/wechat/verify
 * 验证微信登录验证码
 *
 * 请求体：{ sceneId: string, code: string, referrerCode?: string }
 *
 * 流程：
 *   1. 验证验证码
 *   2. 根据 openid 查找或创建用户
 *   3. 建立邀请关系（如有 referrerCode）
 *   4. 标记会话 verified
 *   5. 返回 userId（前端自行建立会话）
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createReferral } from "@/lib/referral"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = "force-dynamic"

interface VerifyBody {
  sceneId: string
  code: string
  referrerCode?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyBody = await request.json()
    const { sceneId, code, referrerCode } = body

    if (!sceneId || !code) {
      return NextResponse.json({ success: false, message: "缺少必要参数" }, { status: 400 })
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ success: false, message: "验证码格式错误" }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. 查找会话
    const { data: session, error: sessionError } = await supabase
      .from("wechat_login_sessions")
      .select("*")
      .eq("scene_id", sceneId)
      .limit(1)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ success: false, message: "会话不存在" }, { status: 404 })
    }

    // 2. 检查状态（code_sent 才允许验证）
    if (session.status === "verified") {
      return NextResponse.json({ success: false, message: "已验证过，请刷新页面" }, { status: 400 })
    }
    if (session.status === "expired" || session.status === "cancelled") {
      return NextResponse.json({ success: false, message: "会话已过期" }, { status: 400 })
    }

    // 3. 验证验证码
    if (!session.code || session.code !== code) {
      return NextResponse.json({ success: false, message: "验证码错误" }, { status: 400 })
    }
    if (session.code_expires_at && new Date(session.code_expires_at) < new Date()) {
      await supabase.from("wechat_login_sessions").update({ status: "expired" }).eq("id", session.id)
      return NextResponse.json({ success: false, message: "验证码已过期" }, { status: 400 })
    }

    const openid = session.openid
    if (!openid) {
      return NextResponse.json({ success: false, message: "未获取到微信用户信息" }, { status: 400 })
    }

    // 4. 根据 openid 查找或创建用户
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, wechat_openid")
      .eq("wechat_openid", openid)
      .maybeSingle()

    let userId: string

    if (existingUser) {
      userId = existingUser.id
      console.log("[WeChat Verify] 已绑定用户登录:", userId)
    } else {
      // 创建新用户
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: `${openid}@wechat.user`,
        password: `wechat_${Date.now()}`,
        user_metadata: { wechat_openid: openid, source: "wechat" },
        email_confirm: true,
      })

      if (authError || !authData.user) {
        console.error("[WeChat Verify] 创建用户失败:", authError)
        return NextResponse.json({ success: false, message: "创建账号失败" }, { status: 500 })
      }

      userId = authData.user.id

      const { error: userError } = await supabase.from("users").insert({
        id: userId,
        username: `用户${userId.slice(0, 6)}`,
        wechat_openid: openid,
      })

      if (userError) {
        console.error("[WeChat Verify] 写入 users 失败:", userError)
        return NextResponse.json({ success: false, message: "创建账号失败" }, { status: 500 })
      }

      console.log("[WeChat Verify] 新用户注册，userId:", userId)
    }

    // 5. 标记会话已验证
    await supabase
      .from("wechat_login_sessions")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .eq("id", session.id)

    // 6. 处理邀请关系
    if (referrerCode) {
      try {
        await createReferral(userId, referrerCode)
      } catch (err) {
        console.error("[WeChat Verify] 建立邀请关系失败:", err)
      }
    }

    return NextResponse.json({ success: true, userId })
  } catch (err: any) {
    console.error("[WeChat Verify] 失败:", err)
    return NextResponse.json({ success: false, message: err.message || "验证失败" }, { status: 500 })
  }
}
