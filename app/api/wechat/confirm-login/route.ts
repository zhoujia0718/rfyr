/**
 * POST /api/wechat/confirm-login
 * 用户在微信内打开登录确认页后，点击「确认登录」按钮调用此接口
 *
 * 请求体：{ sceneId: string }
 *
 * 流程：
 *   1. 通过 sceneId 找到 pending 会话（由前端在 URL 参数中传入）
 *   2. 等待 openid（由回调接口通过 sceneId 关联写入）
 *   3. 如已有 openid → 立即发验证码，标记 code_sent
 *   4. 如尚无 openid → 返回 waiting，告知前端继续轮询
 *
 * 真正发验证码的时机是：回调接口收到扫码事件，写入 openid 后，
 * 前端自动轮询到 code_sent 状态 → 用户输入验证码
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = "force-dynamic"

interface ConfirmBody {
  sceneId: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ConfirmBody = await request.json()
    const { sceneId } = body

    if (!sceneId) {
      return NextResponse.json({ error: "缺少 sceneId" }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 查找会话
    const { data: session, error } = await supabase
      .from("wechat_login_sessions")
      .select("*")
      .eq("scene_id", sceneId)
      .eq("status", "pending")
      .limit(1)
      .single()

    if (error || !session) {
      return NextResponse.json({ error: "会话不存在或已过期" }, { status: 404 })
    }

    // 检查是否过期
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      await supabase.from("wechat_login_sessions").update({ status: "expired" }).eq("id", session.id)
      return NextResponse.json({ error: "会话已过期，请刷新网站重新扫码" }, { status: 400 })
    }

    // openid 还未到达（回调尚未触发），告知前端继续等待
    if (!session.openid) {
      return NextResponse.json({ status: "waiting", message: "等待微信确认中..." })
    }

    // openid 已存在 → 立即发验证码
    const { generateCode, sendTextMessage } = await import("@/lib/wechat")
    const code = generateCode()
    const codeExpiresAt = new Date(Date.now() + 5 * 60 * 1000)

    await supabase
      .from("wechat_login_sessions")
      .update({
        code,
        code_sent_at: new Date().toISOString(),
        code_expires_at: codeExpiresAt.toISOString(),
        // 保持 status=pending，status 在 verify 时变为 verified
      })
      .eq("id", session.id)

    await sendTextMessage(
      session.openid,
      `【日富一日】您的验证码是：${code}\n\n5 分钟内有效，请返回网站输入完成登录。`
    )

    console.log("[WeChat confirm-login] 验证码已发:", code, "openid:", session.openid)

    return NextResponse.json({ status: "code_sent" })
  } catch (err: any) {
    console.error("[WeChat confirm-login] 失败:", err)
    return NextResponse.json({ error: err.message || "处理失败" }, { status: 500 })
  }
}
