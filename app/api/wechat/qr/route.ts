/**
 * 微信登录完整流程设计
 *
 * 步骤：
 * 1. GET  /api/wechat/qr          → 生成临时二维码（scene_id = rfyr_xxx）
 * 2. POST /api/wechat/callback     → 接收 SCAN 事件，记录 openid
 * 3. POST /api/wechat/callback     → 用户点击「免费登录」菜单 → 发送验证码
 * 4. GET  /api/wechat/status       → 前端轮询，查状态
 * 5. POST /api/wechat/verify       → 用户输入验证码 → 完成登录
 *
 * 会话状态：pending → openid_set → code_sent → verified
 */

import { NextResponse } from "next/server"
import { createQRCode, getQRCodeImageUrl } from "@/lib/wechat"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const sceneId = `rfyr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // 临时二维码，5分钟有效期，eventKey = sceneId
    const ticket = await createQRCode(sceneId, 300)
    const qrUrl = getQRCodeImageUrl(ticket)

    const supabase = createClient(supabaseUrl, supabaseKey)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const { error } = await supabase.from("wechat_login_sessions").insert({
      scene_id: sceneId,
      status: "pending",
      expires_at: expiresAt,
    })

    if (error) {
      console.error("[WeChat QR] 写入会话失败:", error)
      return NextResponse.json({ error: "创建登录会话失败" }, { status: 500 })
    }

    return NextResponse.json({ sceneId, qrUrl })
  } catch (err: any) {
    console.error("[WeChat QR] 失败:", err)
    return NextResponse.json({ error: err.message || "生成二维码失败" }, { status: 500 })
  }
}
