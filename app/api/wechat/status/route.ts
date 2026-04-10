/**
 * GET /api/wechat/status?sceneId=xxx
 * 前端轮询：查询登录会话状态
 *
 * 状态流：
 *   pending    - 二维码已生成，等待扫码
 *   openid_set - 用户已扫码，等待点击菜单
 *   code_sent  - 验证码已发送，等待输入验证码
 *   verified   - 验证完成（前端收到此状态后自动登录）
 *   expired    - 会话过期
 *   cancelled  - 已取消
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sceneId = searchParams.get("sceneId")

  if (!sceneId) {
    return NextResponse.json({ error: "缺少 sceneId" }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from("wechat_login_sessions")
    .select("*")
    .eq("scene_id", sceneId)
    .limit(1)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 })
  }

  // 会话整体过期
  if (
    data.status !== "verified" &&
    data.expires_at &&
    new Date(data.expires_at) < new Date()
  ) {
    await supabase
      .from("wechat_login_sessions")
      .update({ status: "expired" })
      .eq("id", data.id)
    return NextResponse.json({ status: "expired" })
  }

  return NextResponse.json({ status: data.status })
}
