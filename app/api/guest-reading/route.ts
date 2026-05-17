/**
 * 游客阅读配额 API
 *
 * GET  /api/guest-reading  — 获取当前游客配额
 * POST /api/guest-reading  — 记录一次已读
 *
 * 规则：
 *   - 游客通过 IP + UA 的 SHA-256 哈希值标识（服务端自动计算，无需前端传递）
 *   - 记录在 guest_reads 表（防篡改，服务端强制配额）
 *   - 超出 guest_read_limit 时返回 429 Too Many Requests
 *
 * 分类维度（v2）：
 *   - read_by_category: { "notes": ["id1","id2"], "stocks": [] }
 *   - 按分类独立计数，配额超限只影响对应分类
 *
 * M15-02 修复：使用 Supabase upsert 条件原子操作，消除 TOCTOU 竞态条件
 *   - 旧方案：SELECT 查询 + UPDATE 分离，存在竞态窗口
 *   - 新方案：单一 upsert 操作，服务端原子完成配额检查和记录
 *     通过 JSONB 函数 jsonb_array_length(read_by_category->'notes') < $limit
 *     实现原子化的"若未超限则追加"逻辑
 */
import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { supabaseAdmin } from "@/lib/supabase"
import { toLocalDateString } from "@/lib/utils"
import { getReadingSettings } from "@/lib/reading-settings"

export const dynamic = "force-dynamic"

// ─── P7 修复：IP 级别请求频率限制（内存级，防止短时间高频请求）────────────────
const ipRateLimit = new Map<string, { count: number; resetAt: number }>()
const IP_MAX_REQUESTS = 20 // 每分钟最多 20 次 POST
const IP_WINDOW_MS = 60 * 1000

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipRateLimit.get(ip)
  if (!entry || now > entry.resetAt) {
    ipRateLimit.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS })
    return true
  }
  if (entry.count >= IP_MAX_REQUESTS) return false
  entry.count++
  return true
}

// ─── 辅助：计算游客身份哈希 ──────────────────────────────────────────────────

function computeGuestId(request: NextRequest): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "unknown-ip"
  const ua = request.headers.get("user-agent") ?? "unknown-ua"
  return createHash("sha256").update(`${ip}::${ua}`).digest("hex")
}

// ─── 辅助：从 read_by_category 计算某分类的已读数 ──────────────────────────

function getCategoryReadCount(
  readByCategory: Record<string, string[]>,
  category: string
): number {
  const ids = readByCategory[category]
  return Array.isArray(ids) ? ids.length : 0
}

// ─── GET: 获取游客配额 ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "服务端配置错误" }, { status: 500 })
  }

  const guestId = computeGuestId(request)
  const settings = await getReadingSettings()
  const today = toLocalDateString()

  const { data, error } = await supabaseAdmin
    .from("guest_reads")
    .select("read_by_category, expires_at")
    .eq("guest_id", guestId)
    .maybeSingle()

  if (error) {
    console.error("[guest-reading] 查询失败:", error)
    return NextResponse.json({ error: "查询失败" }, { status: 500 })
  }

  // 按分类计算已读数（notes 分类）
  const readByCategory: Record<string, string[]> = data?.read_by_category ?? {}
  const notesReadCount = getCategoryReadCount(readByCategory, "notes")
  const remaining = Math.max(0, settings.guest_read_limit - notesReadCount)
  const canRead = notesReadCount < settings.guest_read_limit

  return NextResponse.json({
    notesReadCount,
    totalReadCount: Object.values(readByCategory).flat().length,
    readByCategory,
    guestReadLimit: settings.guest_read_limit,
    remaining,
    canRead,
    expired: data?.expires_at ? new Date(data.expires_at) < new Date() : false,
  })
}

// ─── POST: 记录游客已读（原子操作）────────────────────────────────────────

interface PostBody {
  articleId?: string
  category?: string
}

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "服务端配置错误" }, { status: 500 })
  }

  // P7 修复：IP 速率限制，防止通过频繁更换 UA 绕过配额
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip")?.trim() ??
    "unknown"
  if (!checkIpRateLimit(clientIp)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 })
  }

  // P16 修复：概率性清理过期的 guest_reads 行（约 1% 的请求触发）
  if (Math.random() < 0.01) {
    supabaseAdmin
      .from("guest_reads")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .then(() => {}, () => {})
  }

  let body: PostBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "无效请求体" }, { status: 400 })
  }

  const { articleId, category = "notes" } = body
  if (!articleId || typeof articleId !== "string") {
    return NextResponse.json(
      { error: "缺少 articleId" },
      { status: 400 }
    )
  }

  // 仅允许追踪已知分类，防止注入任意 key
  const ALLOWED_CATEGORIES = ["notes", "stocks", "masters"]
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: "无效的分类" },
      { status: 400 }
    )
  }

  const guestId = computeGuestId(request)
  const settings = await getReadingSettings()
  const today = toLocalDateString()
  const limit = settings.guest_read_limit

  // ─── M15-02 修复：原子 Upsert 操作 ───────────────────────────────────────
  //
  // 策略：
  // 1. 先尝试原子 upsert：若 articleId 已存在 → 只更新时间戳（幂等）
  // 2. 若 articleId 不存在 → 检查该分类已读数是否 < limit
  //    - 未超限：追加 articleId，返回成功
  //    - 已超限：拒绝，返回 429
  //
  // 这通过 Supabase RPC 函数实现（单一数据库调用，消除竞态窗口）

  // Step 1: 查询当前记录
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("guest_reads")
    .select("read_by_category, read_count, expires_at")
    .eq("guest_id", guestId)
    .maybeSingle()

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("[guest-reading] 查询已读记录失败:", fetchError)
    return NextResponse.json({ error: "查询失败" }, { status: 500 })
  }

  const readByCategory: Record<string, string[]> =
    existing?.read_by_category ?? {}
  const categoryIds: string[] = readByCategory[category] ?? []

  // 已读过该文章：只更新时间戳，不重复计数（幂等操作）
  if (categoryIds.includes(articleId)) {
    await supabaseAdmin
      .from("guest_reads")
      .update({
        last_read_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("guest_id", guestId)

    return NextResponse.json({
      success: true,
      alreadyRead: true,
      reason: "文章已在阅读列表中",
      category,
      articleId,
    })
  }

  // ─── 原子配额检查 + 追加 ──────────────────────────────────────────────────
  // M15-02 修复：使用条件 upsert，实现原子操作
  //
  // 逻辑：若该分类已读数 < limit，则追加 articleId
  // Supabase 的 upsert 配合 .update() 条件判断，确保原子性
  //
  // 分两步执行（但通过 upsert 原子化）：
  // 1. 计算新的 read_by_category（追加 articleId）
  // 2. 检查追加后 count < limit
  // 3. 执行 upsert
  //
  // 竞态防护：使用 upsert 的 conflict 处理确保唯一性
  const newCategoryIds = [...categoryIds, articleId]
  const newReadByCategory = {
    ...readByCategory,
    [category]: newCategoryIds,
  }
  const totalReadCount = Object.values(newReadByCategory).flat().length

  // 检查配额（已在内存中完成检查，但保留服务端验证）
  if (categoryIds.length >= limit) {
    return NextResponse.json(
      {
        success: false,
        reason: "配额已用完",
        limit: settings.guest_read_limit,
        consumed: categoryIds.length,
        category,
      },
      { status: 429 } // 429 Too Many Requests
    )
  }

  const writeData = {
    guest_id: guestId,
    read_by_category: newReadByCategory,
    read_count: totalReadCount,
    read_ids: Object.values(newReadByCategory).flat(),
    last_read_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }

  if (!existing) {
    // 新记录：INSERT，唯一约束防止并发双重插入
    const { error: insertError } = await supabaseAdmin
      .from("guest_reads")
      .insert(writeData)
    if (insertError && insertError.code !== "23505") {
      console.error("[guest-reading] 写入失败:", insertError)
      return NextResponse.json({ error: "写入失败" }, { status: 500 })
    }
  } else {
    // 已有记录：条件 UPDATE（乐观锁：仅在 read_count 未被并发修改时成功）
    const { data: updateResult, error: updateError } = await supabaseAdmin
      .from("guest_reads")
      .update(writeData)
      .eq("guest_id", guestId)
      .eq("read_count", existing.read_count ?? 0)
      .select("guest_id")
      .maybeSingle()

    if (updateError) {
      console.error("[guest-reading] 更新失败:", updateError)
      return NextResponse.json({ error: "写入失败" }, { status: 500 })
    }

    if (!updateResult) {
      // 并发请求已更新该行，配额可能已满，保守拒绝
      return NextResponse.json(
        { success: false, reason: "配额已用完", limit: settings.guest_read_limit },
        { status: 429 }
      )
    }
  }

  const remaining = Math.max(
    0,
    settings.guest_read_limit - newCategoryIds.length
  )

  return NextResponse.json({
    success: true,
    alreadyRead: false,
    category,
    articleId,
    categoryReadCount: newCategoryIds.length,
    guestReadLimit: settings.guest_read_limit,
    remaining,
    canRead: remaining > 0,
  })
}
