/**
 * POST /api/wechat/send-code
 * 用户在网站点击「发送验证码」后调用此接口
 * 生成 scene_id 并创建会话，同时将 scene_id 嵌入二维码
 * 用户扫码后点击公众号菜单，服务器从事件中拿到 openid，关联到此 scene_id
 */

import { NextResponse } from "next/server"
import { createQRCode, getQRCodeImageUrl } from "@/lib/wechat"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    // 1. 生成唯一 scene_id（包含时间戳和随机字符串，避免碰撞）
    const sceneId = `rfyr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    // 2. 创建微信二维码（有效期 5 分钟）
    const ticket = await createQRCode(sceneId, 300)
    const qrUrl = getQRCodeImageUrl(ticket)

    // 3. 写入数据库
    const supabase = createClient(supabaseUrl, supabaseKey)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const { error } = await supabase.from("wechat_login_sessions").insert({
      scene_id: sceneId,
      status: "pending",
      expires_at: expiresAt,
    })

    if (error) {
      console.error("[WeChat send-code] 写入会话失败:", error)
      return NextResponse.json({ error: "创建登录会话失败" }, { status: 500 })
    }

    return NextResponse.json({
      sceneId,
      qrUrl,
      expiresAt,
    })
  } catch (err: any) {
    console.error("[WeChat send-code] 失败:", err)
    return NextResponse.json({ error: err.message || "发送失败" }, { status: 500 })
  }
}
