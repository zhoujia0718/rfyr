/**
 * 微信回调接口
 * GET  - 微信服务器验签
 * POST - 接收微信事件推送：
 *        1. SCAN 事件（用户扫码）→ 记录 openid，状态变为 openid_set
 *        2. CLICK 事件（点击菜单）→ 发送验证码，状态变为 code_sent
 */

import { NextRequest, NextResponse } from "next/server"
import { verifySignature, parseXmlMessage, buildTextReply, buildEmptyReply } from "@/lib/wechat"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── GET: 微信服务器验签 ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const signature = searchParams.get("signature") || ""
  const timestamp = searchParams.get("timestamp") || ""
  const nonce = searchParams.get("nonce") || ""
  const echostr = searchParams.get("echostr") || ""

  if (!verifySignature(signature, timestamp, nonce)) {
    return new NextResponse("signature verification failed", { status: 403 })
  }

  if (echostr) {
    return new NextResponse(echostr, { status: 200 })
  }

  return new NextResponse("ok", { status: 200 })
}

// ─── POST: 接收微信事件推送 ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const xml = await request.text()
    const msg = parseXmlMessage(xml)
    const msgType = msg.MsgType || ""

    if (msgType === "event") {
      return handleEvent(msg)
    }

    return new NextResponse(buildEmptyReply(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (err) {
    console.error("[WeChat POST] 处理错误:", err)
    return new NextResponse(buildEmptyReply(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
}

// ─── 事件处理 ───────────────────────────────────────────────────────────────

async function handleEvent(msg: Record<string, string>) {
  const event = msg.Event || ""

  if (event === "SCAN") {
    return handleScan(msg)
  }

  if (event === "CLICK") {
    return handleMenuClick(msg)
  }

  return new NextResponse(buildEmptyReply(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}

// ─── SCAN 事件（用户扫码）───────────────────────────────────────────────────

async function handleScan(msg: Record<string, string>) {
  const sceneId = msg.EventKey || ""
  const openid = msg.FromUserName || ""
  const toUser = msg.FromUserName || ""
  const fromUser = msg.ToUserName || ""

  console.log("[WeChat SCAN] sceneId:", sceneId, "openid:", openid)

  if (!sceneId.startsWith("rfyr_")) {
    return new NextResponse(buildEmptyReply(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 查找 pending 会话
  const { data: session, error } = await supabase
    .from("wechat_login_sessions")
    .select("*")
    .eq("scene_id", sceneId)
    .eq("status", "pending")
    .limit(1)
    .single()

  if (error || !session) {
    console.log("[WeChat SCAN] 会话不存在或已处理，sceneId:", sceneId)
    return new NextResponse(buildEmptyReply(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  // 写入 openid，状态变为 openid_set
  await supabase
    .from("wechat_login_sessions")
    .update({ openid, status: "openid_set" })
    .eq("id", session.id)

  console.log("[WeChat SCAN] openid 已记录，sceneId:", sceneId)

  // 回复用户提示（公众号内才会收到此消息）
  const reply = buildTextReply(
    toUser,
    fromUser,
    "已检测到登录请求，请在公众号底部菜单点击「免费登录」获取验证码。"
  )

  return new NextResponse(reply, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}

// ─── CLICK 事件（点击菜单）─────────────────────────────────────────────────

async function handleMenuClick(msg: Record<string, string>) {
  const eventKey = msg.EventKey || ""
  const openid = msg.FromUserName || ""
  const toUser = msg.FromUserName || ""
  const fromUser = msg.ToUserName || ""

  if (eventKey !== "LOGIN_CLICK") {
    return new NextResponse(buildEmptyReply(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  console.log("[WeChat CLICK] openid:", openid)

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 查找 openid_set 状态的会话（刚扫码完的）
  const { data: session } = await supabase
    .from("wechat_login_sessions")
    .select("*")
    .eq("openid", openid)
    .eq("status", "openid_set")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (!session) {
    // 兜底：找 pending 状态的（极端情况：SCAN 事件未触发）
    const { data: fallback } = await supabase
      .from("wechat_login_sessions")
      .select("*")
      .eq("openid", openid)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (!fallback) {
      const reply = buildTextReply(toUser, fromUser,
        "未找到登录请求，请先在网站扫码后再点击此菜单。"
      )
      return new NextResponse(reply, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }
    // 更新 openid 到 pending 会话
    await supabase.from("wechat_login_sessions").update({ status: "openid_set" }).eq("id", fallback.id)
  }

  const targetSession = session || (await supabase.from("wechat_login_sessions").select("*").eq("openid", openid).eq("status", "openid_set").order("created_at", { ascending: false }).limit(1).then(r => r.data?.[0]))

  if (!targetSession) {
    return new NextResponse(buildEmptyReply(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  // 生成验证码并发送
  const { generateCode, sendTextMessage } = await import("@/lib/wechat")
  const code = generateCode()
  const codeExpiresAt = new Date(Date.now() + 5 * 60 * 1000)

  await supabase
    .from("wechat_login_sessions")
    .update({
      code,
      code_sent_at: new Date().toISOString(),
      code_expires_at: codeExpiresAt.toISOString(),
      status: "code_sent",
    })
    .eq("id", targetSession.id)

  try {
    await sendTextMessage(
      openid,
      `【日富一日】您的验证码是：${code}\n\n5 分钟内有效，请返回网站输入完成登录。`
    )
  } catch (err) {
    console.error("[WeChat CLICK] 发送消息失败:", err)
  }

  const reply = buildTextReply(toUser, fromUser,
    "验证码已发送，请返回网站页面输入验证码完成登录。"
  )

  return new NextResponse(reply, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
