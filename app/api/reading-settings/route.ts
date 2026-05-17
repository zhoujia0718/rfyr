/**
 * 阅读设置 API
 * GET: 获取当前阅读限制配置（60秒服务端缓存，减少重复DB查询）
 * PUT: 更新阅读限制配置（仅管理员，更新后清除缓存）
 */
import { NextRequest, NextResponse } from "next/server"
import { getReadingSettings } from "@/lib/reading-settings"
import { clearSettingsCache } from "@/lib/reading-settings-server"
import { requireAdmin } from "@/lib/server-admin-auth"

export const revalidate = 60

// 获取阅读设置（允许任何人读取，全用户共享相同数据）
export async function GET() {
  const settings = await getReadingSettings()
  // reading_settings 是全局单行配置，极少变动，所有用户共享相同值
  // public: CDN/代理可缓存；max-age=60: 浏览器1分钟内不重新请求；
  // stale-while-revalidate=3600: 缓存过期后后台刷新，前台继续用旧值
  return NextResponse.json(settings, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=3600",
    },
  })
}

// 更新阅读设置（仅管理员，更新后清除本实例缓存）
export async function PUT(request: NextRequest) {
  // 使用 requireAdmin 验证 HMAC 签名，不只是检查 cookie 存在性
  const authError = requireAdmin(request)
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 })
  }

  const { guest_read_limit, monthly_daily_limit, referral_bonus_count, show_read_progress } = body

  if (
    typeof guest_read_limit !== "number" || guest_read_limit < 0 ||
    typeof monthly_daily_limit !== "number" || monthly_daily_limit < 0 ||
    typeof referral_bonus_count !== "number" || referral_bonus_count < 0 ||
    typeof show_read_progress !== "boolean"
  ) {
    return NextResponse.json({ error: "参数错误，数值必须为非负整数，开关必须为布尔值" }, { status: 400 })
  }

  // 动态导入以避免顶部 import 带来的环境变量读取问题
  const { createClient } = await import("@supabase/supabase-js")
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from("reading_settings")
    .upsert(
      { id: "global", guest_read_limit, monthly_daily_limit, referral_bonus_count, show_read_progress },
      { onConflict: "id" }
    )
    .select()
    .single()

  if (error) {
    console.error("更新阅读设置失败:", error)
    return NextResponse.json({ error: `更新失败: ${error.message}` }, { status: 500 })
  }

  clearSettingsCache()

  return NextResponse.json({
    success: true,
    settings: {
      guest_read_limit: data.guest_read_limit,
      monthly_daily_limit: data.monthly_daily_limit,
      referral_bonus_count: data.referral_bonus_count,
      show_read_progress: data.show_read_progress,
    },
  })
}
