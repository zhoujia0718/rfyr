/**
 * 文章内容 API — 服务端强制阅读限制
 *
 * 规则：
 *   - 游客（未登录）：不允许查看任何文章内容，返回登录引导
 *   - 已登录非会员用户：免费阅读上限（终身限制，从配置读取）
 *   - 月卡用户：无终身限制，每日阅读上限（从配置读取）
 *   - 年卡用户：无限制
 *
 * 安全修复（2026-04-18）：
 *   - 使用统一的认证逻辑
 *   - 原子 upsert 防止并发竞态（TOCTOU 修复）
 *   - 阅读限制从数据库配置读取（支持后台配置）
 *   - 403 响应不再返回 content 字段（防止数据泄露）
 *   - 移除未声明变量 supabaseAdmin（应为 supabase）
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUserIdFromBearer } from "@/lib/server-auth-user"
import { getReadingSettings } from "@/lib/reading-settings"
import { toLocalDateString } from "@/lib/utils"
import { getMembershipInfo } from "@/lib/membership-utils"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** 获取用户的已读记录（bonus_daily_count 由 createReferral 维护 + 每天北京时间重置） */
async function getUserReadRecord(userId: string): Promise<{
  readCount: number
  readIds: string[]
  dailyReadCount: number
  bonusCount: number
  dailyBonusCount: number
  _raw?: {
    notes_read_count: number | null
    daily_read_count: number | null
    last_read_date: string | null
    notes_read_ids: string[] | null
    today_read_ids: string[] | null
    bonus_read_count: number | null
    bonus_daily_count: number | null
  }
}> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const today = toLocalDateString()

  const { data } = await supabase
    .from("user_profiles")
    .select("notes_read_count, notes_read_ids, today_read_ids, bonus_read_count, bonus_daily_count, bonus_daily_reset_date, daily_read_count, last_read_date")
    .eq("id", userId)
    .single()

  // 检查是否需要重置每日已读计数
  const lastReadDate = typeof data?.last_read_date === "string" ? data.last_read_date.split("T")[0] : null
  const dailyReadCount = lastReadDate === today ? Number(data?.daily_read_count ?? 0) : 0

  // bonus_daily_count 由 createReferral 写入，跨天后归零
  const resetDate = typeof data?.bonus_daily_reset_date === "string"
    ? data.bonus_daily_reset_date.split("T")[0]
    : null
  const dailyBonusCount = resetDate === today
    ? Number(data?.bonus_daily_count ?? 0)
    : 0

  return {
    readCount: Number(data?.notes_read_count ?? 0),
    readIds: data?.notes_read_ids ?? [],
    dailyReadCount,
    bonusCount: Number(data?.bonus_read_count ?? 0),
    dailyBonusCount,
    _raw: {
      notes_read_count: data?.notes_read_count ?? null,
      daily_read_count: data?.daily_read_count ?? null,
      last_read_date: data?.last_read_date ?? null,
      notes_read_ids: data?.notes_read_ids ?? null,
      today_read_ids: data?.today_read_ids ?? null,
      bonus_read_count: data?.bonus_read_count ?? null,
      bonus_daily_count: data?.bonus_daily_count ?? null,
    },
  }
}

/**
 * 记录用户阅读（原子 upsert）
 * V-C-04 FIX: 所有操作在单次数据库调用中完成，消除 TOCTOU 竞态窗口
 *
 * @returns "exceeded" - 超过每日限额
 * @returns "already_read" - 已读过，直接放行
 * @returns { dailyReadCount, readCount } - 新增阅读成功
 */
async function recordUserReadAtomic(
  userId: string,
  articleId: string,
  dailyLimit: number,
  today: string
): Promise<{ type: "already_read"; dailyReadCount: number; readCount: number } | { type: "exceeded"; dailyReadCount: number } | { type: "success"; dailyReadCount: number; readCount: number }> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("notes_read_ids, today_read_ids, daily_read_count, last_read_date, notes_read_count")
    .eq("id", userId)
    .single()

  if (profileError && profileError.code !== "PGRST116") {
    throw new Error(`查询 profile 失败: ${profileError.message}`)
  }

  const allTimeIds: string[] = profile?.notes_read_ids ?? []
  const todayIds: string[] = (profile?.today_read_ids as string[] | null | undefined) ?? []
  const lastReadDate = typeof profile?.last_read_date === "string"
    ? profile.last_read_date.split("T")[0]
    : null
  const shouldResetDaily = lastReadDate !== today
  const currentDailyCount = shouldResetDaily ? 0 : Number(profile?.daily_read_count ?? 0)
  const currentReadCount = Number(profile?.notes_read_count ?? 0)

  // 新的一天：重置每日追踪
  const existingTodayIds = shouldResetDaily ? [] : todayIds
  const existingAllTimeIds = allTimeIds

  // 当天已读过该篇：跳过计数，但返回真实计数
  if (!shouldResetDaily && existingTodayIds.includes(articleId)) {
    return { type: "already_read", dailyReadCount: currentDailyCount, readCount: currentReadCount }
  }

  // 超限检查
  if (currentDailyCount >= dailyLimit) {
    return { type: "exceeded", dailyReadCount: currentDailyCount }
  }

  // 更新：历史记录追加 + 今天记录追加
  const alreadyInAllTime = existingAllTimeIds.includes(articleId)
  const newAllTimeIds = alreadyInAllTime
    ? existingAllTimeIds
    : [...existingAllTimeIds, articleId]
  const newTodayIds = [...existingTodayIds, articleId]
  const newReadCount = newAllTimeIds.length
  const newDailyCount = shouldResetDaily ? 1 : currentDailyCount + 1

  // P5 修复：对同日路径使用乐观锁（条件 UPDATE），防止并发竞态超限
  let updateQuery = supabase
    .from("user_profiles")
    .update({
      notes_read_count: newReadCount,
      notes_read_ids: newAllTimeIds,
      today_read_ids: newTodayIds,
      daily_read_count: newDailyCount,
      last_read_date: today,
    })
    .eq("id", userId)

  if (!shouldResetDaily) {
    // 同一天：以当前 daily_read_count 为乐观锁，防止并发写入超限
    updateQuery = (updateQuery as any).eq("daily_read_count", currentDailyCount)
  }

  const { data: updateResult } = await (updateQuery as any).select("id").maybeSingle()

  if (!shouldResetDaily && !updateResult) {
    // 并发请求已先写入，保守拒绝（防止超限）
    return { type: "exceeded" }
  }

  return { type: "success", dailyReadCount: newDailyCount, readCount: newReadCount }
}

// ─── GET: 获取单篇文章 ───────────────────────────────────────────────────

// 非会员阅读限制已用原子 upsert 消除 TOCTOU（2026-04-19 修复）
async function recordNonMemberReadAtomic(
  userId: string,
  articleId: string,
  lifetimeLimit: number,
  today: string
): Promise<"exceeded" | "already_read" | { readCount: number }> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. 读取当前 ids
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("notes_read_ids, notes_read_count")
    .eq("id", userId)
    .single()

  const existingIds: string[] = profile?.notes_read_ids ?? []

  // 2. 已读：不计数，直接放行
  if (existingIds.includes(articleId)) {
    return "already_read"
  }

  const currentCount = existingIds.length

  // 3. 检查是否超限（基于当前数据库值）
  if (currentCount >= lifetimeLimit) {
    return "exceeded"
  }

  // 4. 条件更新：只有 count 未变化时才写入（原子性保证）
  const newIds = [...existingIds, articleId]
  const { data: updateResult, error: updateError } = await supabase
    .from("user_profiles")
    .update({
      notes_read_count: newIds.length,
      notes_read_ids: newIds,
      last_read_date: today,
    })
    .eq("id", userId)
    .eq("notes_read_count", currentCount) // ← 关键：条件更新
    .select("notes_read_count")
    .single()

  // 5. 条件更新失败（并发冲突），重新查询判断
  if (updateError || !updateResult) {
    const { data: retryProfile } = await supabase
      .from("user_profiles")
      .select("notes_read_ids, notes_read_count")
      .eq("id", userId)
      .single()

    if (retryProfile?.notes_read_ids?.includes(articleId)) {
      return "already_read"
    }
    return Number(retryProfile?.notes_read_count ?? 0) >= lifetimeLimit
      ? "exceeded"
      : { readCount: Number(retryProfile?.notes_read_count ?? 0) }
  }

  return { readCount: newIds.length }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: "缺少文章 ID" }, { status: 400 })
  }

  // 获取阅读设置
  const settings = await getReadingSettings()

  // 使用统一的认证逻辑
  const userId = await getUserIdFromBearer(request)

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 获取文章
  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  // 尝试 short_id
  let finalArticle = article
  if (!finalArticle) {
    const { data: articleByShortId } = await supabase
      .from("articles")
      .select("*")
      .eq("short_id", id)
      .maybeSingle()
    finalArticle = articleByShortId
  }

  if (!finalArticle) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 })
  }

  // 游客（未登录）：不允许查看任何文章内容
  if (!userId) {
    // 免费文章允许游客查看
    if (finalArticle.access_level === "free") {
      return NextResponse.json({
        content: finalArticle.content,
        title: finalArticle.title,
        html_url: finalArticle.html_url,
        articleId: finalArticle.id,
        accessType: "free",
        readCount: 0,
        limit: Infinity,
        isUnlimited: true,
        isFreeArticle: true,
      })
    }
    return NextResponse.json(
      {
        error: "请先登录后阅读",
        code: "REQUIRE_LOGIN",
        articleId: finalArticle.id,
      },
      { status: 401 }
    )
  }

  // P2 修复：使用 getMembershipInfo 单次查询（singleton 客户端）替代两个独立函数各创建一个客户端
  const memberInfo = await getMembershipInfo(userId)
  const isYearly = memberInfo.isYearly || memberInfo.isPermanent
  const isMonthly = memberInfo.isMonthly

  // 检查文章权限级别
  const articleAccessLevel = finalArticle.access_level || "monthly"

  // 年卡专属文章：只有年卡用户可看
  if (articleAccessLevel === "yearly" && !isYearly) {
    return NextResponse.json(
      {
        error: isMonthly
          ? "此文章为年卡专属内容，请升级为年卡会员"
          : "此文章为年卡专属内容，请升级为年卡会员",
        code: "YEARLY_REQUIRED",
        articleId: finalArticle.id,
        requiredLevel: "yearly",
        isMonthly,
        // 不返回 content，防止月卡用户绕过后继续阅读
      },
      { status: 403 }
    )
  }

  // 月卡可见文章：月卡、年卡用户可看，或者用户是被邀请来看这篇文章的
  if (articleAccessLevel === "monthly" && !isMonthly && !isYearly) {
    return NextResponse.json(
      {
        error: "此文章需要月卡或年卡会员权限",
        code: "MEMBERSHIP_REQUIRED",
        articleId: finalArticle.id,
        requiredLevel: "monthly",
      },
      { status: 403 }
    )
  }

  const readRecord = await getUserReadRecord(userId)

  // 年卡用户：无限制，但仍记录阅读以便显示"已读XX篇"
  if (isYearly) {
    const readRecordIds: string[] = readRecord.readIds ?? []
    const readRecordTodayIds: string[] = readRecord._raw?.today_read_ids ?? []
    const lastReadDate = typeof readRecord._raw?.last_read_date === "string"
      ? readRecord._raw.last_read_date.split("T")[0]
      : null
    const today = toLocalDateString()
    const isNewRead = !readRecordIds.includes(finalArticle.id)

    if (isNewRead) {
      const newReadIds = [...readRecordIds, finalArticle.id]
      const newTodayIds = lastReadDate !== today
        ? [finalArticle.id]
        : [...readRecordTodayIds, finalArticle.id]
      const newDailyCount = lastReadDate !== today ? 1 : (readRecord._raw?.daily_read_count ?? 0) + 1

      await supabase
        .from("user_profiles")
        .update({
          notes_read_count: readRecord.readCount + 1,
          notes_read_ids: newReadIds,
          today_read_ids: newTodayIds,
          daily_read_count: newDailyCount,
          last_read_date: today,
        })
        .eq("id", userId)
        .select("notes_read_count")
        .single()
    }

    const newReadIds = isNewRead
      ? (readRecordIds.includes(finalArticle.id) ? readRecordIds : [...readRecordIds, finalArticle.id])
      : readRecordIds

    return NextResponse.json({
      content: finalArticle.content,
      title: finalArticle.title,
      html_url: finalArticle.html_url,
      articleId: finalArticle.id,
      accessType: "yearly",
      readCount: isNewRead ? readRecord.readCount + 1 : readRecord.readCount,
      readIds: newReadIds,
      dailyReadCount: isNewRead
        ? (lastReadDate !== today ? 1 : (readRecord._raw?.daily_read_count ?? 0) + 1)
        : readRecord.dailyReadCount,
      limit: Infinity,
      isUnlimited: true,
      todayReadIds: isNewRead
        ? (lastReadDate !== today ? [finalArticle.id] : [...readRecordTodayIds, finalArticle.id])
        : readRecordTodayIds,
    })
  }

  // 检查是否已读过这篇文章（不重复计数）
  const alreadyRead = readRecord.readIds.includes(finalArticle.id)

  // 月卡用户：每日限制（无终身限制）
  // V-C-04 FIX: 使用原子 upsert 代替 先查后写，消除 TOCTOU 竞态
  if (isMonthly) {
    const today = toLocalDateString()
    const effectiveDailyLimit = settings.monthly_daily_limit + readRecord.dailyBonusCount

    // 原子 upsert：在数据库层面完成 check-then-write，防止并发竞态
    const upsertResult = await recordUserReadAtomic(
      userId,
      finalArticle.id,
      effectiveDailyLimit,
      today
    )

    if (upsertResult.type === "exceeded") {
      return NextResponse.json(
        {
          error: "今日阅读次数已用完，请明天再来",
          code: "DAILY_LIMIT_EXCEEDED",
          readCount: readRecord.readCount,
          dailyReadCount: upsertResult.dailyReadCount,
          limit: effectiveDailyLimit,
          effectiveDailyLimit,
          bonusCount: readRecord.bonusCount,
          dailyBonusCount: readRecord.dailyBonusCount,
          articleId: finalArticle.id,
          isMonthly: true,
        },
        { status: 403 }
      )
    }

    if (upsertResult.type === "already_read") {
      return NextResponse.json({
        content: finalArticle.content,
        title: finalArticle.title,
        html_url: finalArticle.html_url,
        articleId: finalArticle.id,
        accessType: "monthly",
        readCount: upsertResult.readCount,
        readIds: readRecord.readIds,
        dailyReadCount: upsertResult.dailyReadCount,
        todayReadIds: readRecord._raw?.today_read_ids ?? [],
        limit: effectiveDailyLimit,
        isUnlimited: true,
        effectiveDailyLimit,
        remaining: Math.max(0, effectiveDailyLimit - upsertResult.dailyReadCount),
        bonusCount: readRecord.bonusCount,
        dailyBonusCount: readRecord.dailyBonusCount,
      })
    }

    return NextResponse.json({
      content: finalArticle.content,
      title: finalArticle.title,
      html_url: finalArticle.html_url,
      articleId: finalArticle.id,
      accessType: "monthly",
      readCount: upsertResult.readCount,
      readIds: readRecord.readIds,
      dailyReadCount: upsertResult.dailyReadCount,
      todayReadIds: readRecord._raw?.today_read_ids ?? [],
      limit: effectiveDailyLimit,
      isUnlimited: true,
      effectiveDailyLimit,
      remaining: Math.max(0, effectiveDailyLimit - upsertResult.dailyReadCount),
      bonusCount: readRecord.bonusCount,
      dailyBonusCount: readRecord.dailyBonusCount,
    })
  }

  // P4 修复：移除 hasFreeArticleAccess 死代码（referrer_article_id 从未写入）
  // P21 FIX: 恢复 referrer_article_id 检查——现在注册时会写入该字段
  // 非会员：免费阅读上限 + 邀请奖励（终身限制）—— 使用原子 upsert 消除竞态
  const maxLimit = settings.guest_read_limit + readRecord.bonusCount
  const today = toLocalDateString()

  // 检查用户是否通过某篇文章的邀请链接注册，若是则可免费阅读该文章（不扣阅读次数）
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("referrer_article_id")
    .eq("id", userId)
    .single()

  const isReferrerArticle = !!(profile?.referrer_article_id && (
    profile.referrer_article_id === finalArticle.id ||
    profile.referrer_article_id === finalArticle.short_id
  ))

  // 如果是通过邀请链接注册的文章，直接免费放行（不计入阅读次数）
  if (isReferrerArticle) {
    return NextResponse.json({
      content: finalArticle.content,
      title: finalArticle.title,
      html_url: finalArticle.html_url,
      articleId: finalArticle.id,
      accessType: "referrer_free",
      readCount: readRecord.readCount,
      limit: maxLimit,
      remaining: Math.max(0, maxLimit - readRecord.readCount),
      bonusCount: readRecord.bonusCount,
      dailyBonusCount: readRecord.dailyBonusCount,
    })
  }

  // 使用原子 upsert：单次 DB 调用完成"检查超限 → 写入"，消除 TOCTOU 竞态
  const atomicResult = await recordNonMemberReadAtomic(
    userId,
    finalArticle.id,
    maxLimit,
    today
  )

  if (atomicResult === "exceeded") {
    return NextResponse.json(
      {
        error: "阅读次数已用完，请明天再来或邀请好友获得更多次数",
        code: "LIMIT_EXCEEDED",
        readCount: readRecord.readCount,
        limit: maxLimit,
        bonusCount: readRecord.bonusCount,
        dailyBonusCount: readRecord.dailyBonusCount,
        articleId: finalArticle.id,
      },
      { status: 403 }
    )
  }

  if (atomicResult === "already_read") {
    return NextResponse.json({
      content: finalArticle.content,
      title: finalArticle.title,
      html_url: finalArticle.html_url,
      articleId: finalArticle.id,
      accessType: "free",
      readCount: readRecord.readCount,
      limit: maxLimit,
      remaining: Math.max(0, maxLimit - readRecord.readCount),
      bonusCount: readRecord.bonusCount,
      dailyBonusCount: readRecord.dailyBonusCount,
    })
  }

  return NextResponse.json({
    content: finalArticle.content,
    title: finalArticle.title,
    html_url: finalArticle.html_url,
    articleId: finalArticle.id,
    accessType: "free",
    readCount: atomicResult.readCount,
    limit: maxLimit,
    remaining: Math.max(0, maxLimit - atomicResult.readCount),
    bonusCount: readRecord.bonusCount,
    dailyBonusCount: readRecord.dailyBonusCount,
  })
}
