/**
 * GET /api/dev/login
 *
 * 仅用于本地开发 / 调试。
 * 直接写入 custom_auth，跳过微信登录流程。
 *
 * 参数：
 *   userId   - 指定要登录的用户 ID（不传则用 dev_test_user）
 *   tier     - 指定会员档位：none | weekly | yearly（可选，直接写入 users 表）
 *
 * 示例（浏览器控制台）：
 *   // 普通用户登录
 *   fetch('/api/dev/login').then(r=>r.json()).then(d=>location.reload())
 *   // 指定用户 + 年卡
 *   fetch('/api/dev/login?userId=xxx&tier=yearly').then(r=>r.json()).then(d=>location.reload())
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let userId = searchParams.get("userId")?.trim() || ""
  const tier = searchParams.get("tier")?.trim() || "none"

  if (!["none", "weekly", "yearly"].includes(tier)) {
    return NextResponse.json({ ok: false, error: "tier 必须是 none | weekly | yearly" }, { status: 400 })
  }

  // 若未指定 userId，查找或创建 dev_test_user
  if (!userId) {
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("username", "dev_test_user")
      .maybeSingle()

    if (existing) {
      userId = existing.id
    } else {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: `dev_test_${Date.now()}@rfyr.local`,
        password: `dev_${Date.now()}`,
        email_confirm: true,
        user_metadata: { source: "dev" },
      })
      if (authErr || !authData.user) {
        return NextResponse.json({ ok: false, error: "创建测试账号失败: " + authErr?.message }, { status: 500 })
      }
      userId = authData.user.id
      await supabaseAdmin.from("users").upsert({
        id: userId,
        username: "dev_test_user",
        vip_tier: tier,
      })
    }
  }

  // 更新会员档位
  await supabaseAdmin.from("users").update({ vip_tier: tier }).eq("id", userId)

  // 同时写 custom_auth（这样前端 MembershipProvider 无需等待 DB 就能知道 tier）
  const session = {
    loginTime: Date.now(),
    user: { id: userId, vip_tier: tier },
  }

  return NextResponse.json(
    {
      ok: true,
      userId,
      tier,
      message: "custom_auth 已写入，请刷新页面",
      dev: true,
    },
    {
      headers: {
        "X-Dev-User-Id": userId,
        "X-Dev-Session": JSON.stringify(session),
      },
    }
  )
}
