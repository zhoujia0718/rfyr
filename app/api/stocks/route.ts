/**
 * ============================================================
 * GET /api/stocks
 *
 * 获取个股挖掘分类下的文章列表
 * 服务端根据用户会员等级过滤，保护付费内容不被未授权用户访问
 *
 * M15-01/M15-04 修复：
 * - 移除客户端 CSS blur/pointer-events 隐藏（可被 DevTools 绕过）
 * - 服务端验证会员等级，只返回用户有权限访问的文章
 * - 未经认证的用户只能看到 access_level='free' 的文章
 * ============================================================
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUserIdFromBearer } from "@/lib/server-auth-user"

/** 会员等级层级 */
const MEMBER_LEVELS: Record<string, number> = {
  free: 0,
  monthly: 1,
  yearly: 2,
  permanent: 3,
}

/** 文章访问层级 */
const ACCESS_LEVELS: Record<string, number> = {
  free: 0,
  monthly: 1,
  yearly: 2,
}

function getArticleAccessLevel(article: Record<string, unknown>): number {
  const level = String(article.access_level ?? article.access_level ?? "monthly").toLowerCase()
  return ACCESS_LEVELS[level] ?? 1
}

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = (searchParams.get("category") || "个股挖掘").trim()

  // 单个 client（service key 权限，可同时查 users 和 articles）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const userId = await getUserIdFromBearer(request)

  // 并行：用户会员等级 + 文章列表（原来是串行，节省一次 DB round-trip）
  const [userResult, articlesResult] = await Promise.all([
    userId
      ? supabase.from("users").select("vip_tier").eq("id", userId).single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("articles")
      .select("id, short_id, title, category, publishdate, access_level, created_at")
      .eq("category", category)
      .order("publishdate", { ascending: false }),
  ])

  let userLevel = 0
  if (userResult.data?.vip_tier) {
    userLevel = MEMBER_LEVELS[String(userResult.data.vip_tier).toLowerCase()] ?? 0
  }

  if (articlesResult.error) {
    console.error("[api/stocks] 查询失败:", articlesResult.error)
    return NextResponse.json({ error: "查询失败" }, { status: 500 })
  }

  const allArticles = articlesResult.data ?? []
  const accessibleArticles = allArticles.filter(
    (article) => userLevel >= getArticleAccessLevel(article)
  )
  const totalCount = allArticles.length
  const hasLockedContent = totalCount > accessibleArticles.length

  return NextResponse.json(
    {
      articles: accessibleArticles,
      meta: { total: totalCount, accessible: accessibleArticles.length, userLevel, hasLockedContent },
    },
    {
      headers: { "Cache-Control": "private, max-age=60" },
    }
  )
}
