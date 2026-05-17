/**
 * 短线笔记阅读次数限制 — 服务端读写
 *
 * 已登录用户的阅读篇数记录在 user_profiles 表：
 *   - notes_read_count : 已读篇数（终身）
 *   - notes_read_ids   : 已读文章 ID 列表（防重复计数）
 *
 * 变更（2026-04-20）：
 *   P1: recordVisit 改为原子操作，使用条件 UPDATE 消除 TOCTOU 竞态窗口
 *       - SELECT → 检查是否已读 → UPDATE notes_read_count = count WHERE count = old_count
 *       - 若条件更新失败（并发冲突），自动重试
 *
 * 变更（2026-04-25）：
 *   Bug Fix: atomicWriteAttempt 中的 already_read 分支原本 early return，
 *            导致返回的 readCount 是本地预计算值（可能落后于数据库真实值）。
 *            现改为统一走原子 UPDATE，由数据库返回真实值。
 */

import { supabaseAdmin } from "@/lib/supabase"
import { getUserIdFromBearer } from "@/lib/server-auth-user"
import { toLocalDateString } from "@/lib/utils"

export interface ReadingLimitData {
  readCount: number
  readIds: string[]
  dailyReadCount: number
  lastReadDate: string | null
}

export interface RecordVisitResult extends ReadingLimitData {
  /** 当日已读文章 ID 列表 */
  todayReadIds: string[]
  /** 是否已读过（不重复计数） */
  alreadyRead: boolean
  /** 是否超出限制 */
  exceeded: boolean
}

// ─── 从请求中解析 userId（使用统一认证逻辑）──────────────────────────────

export async function resolveUserIdFromRequest(request: Request): Promise<string | null> {
  const headers = request.headers
  const authHeader = headers?.get("authorization")

  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null
  }

  const token = authHeader.slice(7).trim()
  if (!token) return null

  const userIdHeader = headers?.get("x-user-id")
  const { NextRequest } = await import("next/server")

  const headersObj: HeadersInit = { authorization: `Bearer ${token}` }
  if (userIdHeader) {
    headersObj["x-user-id"] = userIdHeader
  }

  const nextReq = new NextRequest("http://localhost", {
    headers: new Headers(headersObj),
  })

  return await getUserIdFromBearer(nextReq)
}

// ─── 服务端：获取阅读限制数据 ─────────────────────────────────────────────

export async function getReadingLimitData(userId: string): Promise<ReadingLimitData> {
  if (!supabaseAdmin) {
    console.error("[ReadingLimit] SUPABASE_SERVICE_ROLE_KEY 未配置")
    return { readCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null }
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("notes_read_count, notes_read_ids, daily_read_count, last_read_date")
    .eq("id", userId)
    .single()

  if (error || !data) {
    console.error("[ReadingLimit] 查询失败:", error)
    return { readCount: 0, readIds: [], dailyReadCount: 0, lastReadDate: null }
  }

  const today = toLocalDateString()
  const lastReadDate =
    typeof data.last_read_date === "string" ? data.last_read_date.split("T")[0] : null
  const dailyReadCount = lastReadDate === today ? Number(data.daily_read_count ?? 0) : 0

  return {
    readCount: Number(data.notes_read_count ?? 0),
    readIds: data.notes_read_ids ?? [],
    dailyReadCount,
    lastReadDate: data.last_read_date,
  }
}

// ─── 内部：单次原子写入尝试 ──────────────────────────────────────────────

/**
 * 原子写入尝试：条件 UPDATE 防止并发冲突
 *
 * @returns { ok: true, ... }  — 写入成功
 * @returns { ok: false, reason: 'conflict' }  — 并发冲突（需重试）
 * @returns { ok: false, reason: 'exceeded' }  — 超出限制
 */
type AtomicResult =
  | { ok: true; alreadyRead: boolean; readCount: number; dailyReadCount: number }
  | { ok: false; reason: "conflict" | "exceeded" }

async function atomicWriteAttempt(
  userId: string,
  articleId: string,
  currentCount: number,
  currentDailyCount: number,
  existingIds: string[],
  shouldResetDaily: boolean,
  today: string,
  dailyLimit: number | null // null = 无每日限制
): Promise<AtomicResult> {
  // 新天重读：不重复加入 notes_read_ids，但要计入每日次数
  const newIds = existingIds.includes(articleId) ? existingIds : [...existingIds, articleId]
  const projectedCount = newIds.length
  const projectedDailyCount = shouldResetDaily ? 1 : currentDailyCount + 1

  // 已读判断：仅在当天重复阅读同一篇时跳过计数（统一走原子写入）
  // 新的一天即使曾经读过也要重新计入每日次数
  const skipCounting = !shouldResetDaily && existingIds.includes(articleId)

  // 每日限制检查（如果配置了）
  if (!skipCounting && dailyLimit !== null && projectedDailyCount > dailyLimit) {
    return { ok: false, reason: "exceeded" }
  }

  if (!supabaseAdmin) return { ok: false, reason: "exceeded" }

  // 条件 UPDATE：只有 notes_read_count 未变化时才写入
  // 这是消除 TOCTOU 竞态的关键：SELECT 返回旧 count，UPDATE 要求 count 仍等于旧值
  const { data: updated, error } = await supabaseAdmin
    .from("user_profiles")
    .update({
      notes_read_count: projectedCount,
      notes_read_ids: newIds,
      // skipCounting 时不增加每日计数，保持不变
      daily_read_count: skipCounting ? currentDailyCount : projectedDailyCount,
      last_read_date: today,
    })
    .eq("id", userId)
    .eq("notes_read_count", currentCount) // 原子性保证：旧值匹配才写入
    .select("notes_read_count, daily_read_count, last_read_date")
    .single()

  if (error || !updated) {
    // 条件更新失败（并发冲突）：其他请求修改了数据
    return { ok: false, reason: "conflict" }
  }

  return {
    ok: true,
    alreadyRead: skipCounting,
    readCount: updated.notes_read_count,
    dailyReadCount: updated.daily_read_count,
  }
}

// ─── 服务端：记录已读（原子操作 v2）─────────────────────────────────────

/**
 * 记录已读（原子操作）
 *
 * 使用条件 UPDATE 实现原子性：即使并发请求同时到达，也只有第一个能成功写入，
 * 其他请求在 UPDATE WHERE 时条件不满足会失败，然后重新查询判断。
 *
 * @param userId 用户 ID
 * @param articleId 文章 ID
 * @param dailyLimit 每日上限（null = 无限制，如年度会员）
 */
export async function recordVisit(
  userId: string,
  articleId: string,
  dailyLimit: number | null = null
): Promise<RecordVisitResult> {
  if (!supabaseAdmin) {
    return {
      readCount: 0,
      readIds: [],
      dailyReadCount: 0,
      lastReadDate: null,
      todayReadIds: [],
      alreadyRead: false,
      exceeded: false,
    }
  }

  const today = toLocalDateString()

  // 最多重试 3 次（防止极端并发情况）
  for (let attempt = 0; attempt < 3; attempt++) {
    // 读取当前状态
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from("user_profiles")
      .select("notes_read_count, notes_read_ids, today_read_ids, daily_read_count, last_read_date")
      .eq("id", userId)
      .single()

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("[ReadingLimit] 查询已读记录失败:", fetchError)
      return {
        readCount: 0,
        readIds: [],
        dailyReadCount: 0,
        lastReadDate: null,
        todayReadIds: [],
        alreadyRead: false,
        exceeded: false,
      }
    }

    const existingIds: string[] = profile?.notes_read_ids ?? []
    const existingTodayIds: string[] = profile?.today_read_ids ?? []
    const lastReadDate = profile?.last_read_date
      ? String(profile.last_read_date).split("T")[0]
      : null
    const shouldResetDaily = lastReadDate !== today
    const currentCount = Number(profile?.notes_read_count ?? 0)
    const currentDailyCount = shouldResetDaily
      ? 0
      : Number(profile?.daily_read_count ?? 0)

    const result = await atomicWriteAttempt(
      userId,
      articleId,
      currentCount,
      currentDailyCount,
      existingIds,
      shouldResetDaily,
      today,
      dailyLimit
    )

    if (result.ok) {
      // UPDATE 成功，DB 返回真实值（即使 alreadyRead=true 也是真实值）
      return {
        readCount: result.readCount,
        // existingIds 可能落后于 DB，但 DB 中的 notes_read_ids 已正确，无需重建
        readIds: result.alreadyRead
          ? existingIds
          : (existingIds.includes(articleId) ? existingIds : [...existingIds, articleId]),
        dailyReadCount: result.dailyReadCount,
        lastReadDate: today,
        todayReadIds: result.alreadyRead
          ? existingTodayIds
          : [...existingTodayIds, articleId],
        alreadyRead: result.alreadyRead,
        exceeded: false,
      }
    }

    if (result.reason === "exceeded") {
      // 超出限制
      return {
        readCount: currentCount,
        readIds: existingIds,
        dailyReadCount: currentDailyCount,
        lastReadDate: today,
        todayReadIds: existingTodayIds,
        alreadyRead: false,
        exceeded: true,
      }
    }

    // conflict：并发冲突，重新尝试
    // 继续下一次循环
  }

  // 3 次重试后仍失败，返回乐观结果（由下次访问纠正）
  console.warn("[ReadingLimit] 3次原子写入均失败，忽略")
  const { data: finalProfile } = await supabaseAdmin
    .from("user_profiles")
    .select("notes_read_count, notes_read_ids, today_read_ids, daily_read_count, last_read_date")
    .eq("id", userId)
    .single()

  const finalLastReadDate = finalProfile?.last_read_date
    ? String(finalProfile.last_read_date).split("T")[0]
    : null
  const finalShouldReset = finalLastReadDate !== today

  return {
    readCount: Number(finalProfile?.notes_read_count ?? 0),
    readIds: finalProfile?.notes_read_ids ?? [],
    dailyReadCount: finalShouldReset
      ? 0
      : Number(finalProfile?.daily_read_count ?? 0),
    lastReadDate: today,
    todayReadIds: finalProfile?.today_read_ids ?? [],
    alreadyRead: (finalProfile?.notes_read_ids ?? []).includes(articleId),
    exceeded: false,
  }
}
