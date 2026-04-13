/**
 * 短线笔记阅读次数限制 — 服务端读写
 *
 * 已登录用户的阅读篇数记录在 user_profiles 表：
 *   - notes_read_count : 已读篇数（不含 read_bonus）
 *   - notes_read_ids   : 已读文章 ID 列表（防重复计数）
 *
 * read_bonus（邀请加成）仍然叠加在 maxCount 上，
 * 因为它只影响上限，不影响已读篇数本身。
 */

import { supabaseAdmin } from "@/lib/supabase"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export interface ReadingLimitData {
  readCount: number
  readIds: string[]
}

// ─── 从请求中解析 userId（与 /api/membership/status 逻辑一致）──────────────

async function resolveUserIdFromRequest(request: Request): Promise<string | null> {
  const userIdHeader = request.headers.get("x-user-id")
  const authHeader = request.headers.get("authorization")

  if (userIdHeader?.trim()) {
    return userIdHeader.trim()
  }

  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim()
    if (!/^(pwd_|magic_|magic_refresh_|pwd_refresh_)/i.test(token)) {
      const sb = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: { user } } = await sb.auth.getUser(token)
      return user?.id ?? null
    }
  }

  return null
}

// ─── 服务端：获取阅读限制数据 ─────────────────────────────────────────────

export async function getReadingLimitData(userId: string): Promise<ReadingLimitData> {
  if (!supabaseAdmin) {
    console.error("[ReadingLimit] SUPABASE_SERVICE_ROLE_KEY 未配置")
    return { readCount: 0, readIds: [] }
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("notes_read_count, notes_read_ids")
    .eq("id", userId)
    .single()

  if (error || !data) {
    console.error("[ReadingLimit] 查询失败:", error)
    return { readCount: 0, readIds: [] }
  }

  return {
    readCount: Number(data.notes_read_count ?? 0),
    readIds: data.notes_read_ids ?? [],
  }
}

// ─── 服务端：记录已读（原子操作）───────────────────────────────────────────

export async function recordVisit(userId: string, articleId: string): Promise<ReadingLimitData> {
  if (!supabaseAdmin) {
    console.error("[ReadingLimit] SUPABASE_SERVICE_ROLE_KEY 未配置")
    return { readCount: 0, readIds: [] }
  }

  // 原子 upsert：先查再写，防止并发问题
  const { data: profile, error: fetchError } = await supabaseAdmin
    .from("user_profiles")
    .select("notes_read_count, notes_read_ids")
    .eq("id", userId)
    .single()

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("[ReadingLimit] 查询已读记录失败:", fetchError)
    return { readCount: 0, readIds: [] }
  }

  const existingIds: string[] = profile?.notes_read_ids ?? []
  const alreadyRead = existingIds.includes(articleId)

  const newIds = alreadyRead ? existingIds : [...existingIds, articleId]
  const newCount = alreadyRead
    ? (profile?.notes_read_count ?? 0)
    : (Number(profile?.notes_read_count ?? 0)) + 1

  const { data, error: upsertError } = await supabaseAdmin
    .from("user_profiles")
    .update({
      notes_read_count: newCount,
      notes_read_ids: newIds,
    })
    .eq("id", userId)
    .select("notes_read_count, notes_read_ids")
    .single()

  if (upsertError) {
    console.error("[ReadingLimit] 更新已读记录失败:", upsertError)
    return { readCount: newCount, readIds: newIds }
  }

  return {
    readCount: Number(data?.notes_read_count ?? newCount),
    readIds: data?.notes_read_ids ?? newIds,
  }
}

// ─── API 路由辅助：解析请求并获取 userId ──────────────────────────────────

export { resolveUserIdFromRequest }
