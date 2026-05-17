/**
 * POST /api/auth/logout
 *
 * P10 修复：注销当前 fakeToken 会话
 * 将 session_invalidated_before 时间戳写入 Supabase Auth app_metadata，
 * 后续 getUserIdFromBearer 检查此时间戳，使已颁发的 token 失效。
 *
 * 注意：5 分钟内（REVOCATION_CACHE_TTL）旧 token 仍可能通过缓存检查，
 * 这是可接受的折中（避免每次请求都查 DB）。
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUserIdFromBearer } from "@/lib/server-auth-user"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromBearer(request)
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const now = Math.floor(Date.now() / 1000)

    // 将 sib（session_invalidated_before）写入 auth user app_metadata
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { sib: now },
    })

    if (error) {
      console.error("[logout] 更新 app_metadata 失败:", error)
      return NextResponse.json({ error: "注销失败" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[logout] 异常:", err)
    return NextResponse.json({ error: "注销失败" }, { status: 500 })
  }
}
