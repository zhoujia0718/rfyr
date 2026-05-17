/**
 * GET /api/admin/dashboard
 *
 * 服务端统一获取管理后台仪表盘数据。
 * 使用 Service Role Key + HMAC cookie 验证，完全绕开 RLS 限制。
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdmin, parseAdminFromCookie } from "@/lib/server-admin-auth"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) return authError

  const { userId: adminId } = parseAdminFromCookie(request)

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 并行获取所有核心数据
  const [
    articlesResult,
    categoriesResult,
    usersResult,
    membershipsResult,
    articlesCountResult,
    usersCountResult,
    membershipsCountResult,
  ] = await Promise.all([
    supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("memberships")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("articles")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("users")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("memberships")
      .select("*", { count: "exact", head: true }),
  ])

  // 构建用户名映射
  const userNameMap: Record<string, string> = {}
  for (const user of usersResult.data ?? []) {
    if (user.id === "00000000-0000-0000-0000-000000000001") {
      userNameMap[user.id] = "普通用户"
    } else if (user.id === "00000000-0000-0000-0000-000000000002") {
      userNameMap[user.id] = "管理员"
    } else {
      userNameMap[user.id] = user.username || user.phone || "日富一日用户"
    }
  }

  const membershipsWithNames = (membershipsResult.data ?? []).map((m) => ({
    ...m,
    user_name: userNameMap[m.user_id] ?? "日富一日用户",
  }))

  // 构建分类树
  type CategoryRow = { id: string; name: string; icon?: string | null; description?: string | null; href?: string | null; parent_id?: string | null }

  type CategoryTreeNode = {
    id: string; name: string; icon?: string; description?: string; href?: string; parentId?: string | null; children: CategoryTreeNode[]
  }

  function buildTree(items: CategoryRow[], parentId?: string): CategoryTreeNode[] {
    return (items ?? [])
      .filter((item) =>
        parentId === undefined
          ? item.parent_id === null
          : item.parent_id === parentId
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        icon: item.icon || '',
        description: item.description || '',
        href: item.href || '',
        parentId: item.parent_id,
        children: buildTree(items, item.id),
      }))
  }

  return NextResponse.json(
    {
      stats: {
        totalUsers: usersCountResult.count ?? 0,
        totalMemberships: membershipsCountResult.count ?? 0,
        totalArticles: articlesCountResult.count ?? 0,
        todayVisits: 0,
      },
      articles: articlesResult.data ?? [],
      categories: buildTree(categoriesResult.data ?? []),
      users: usersResult.data ?? [],
      memberships: membershipsWithNames,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  )
}
