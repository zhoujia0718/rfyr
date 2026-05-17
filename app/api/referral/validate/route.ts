/**
 * POST /api/referral/validate
 * 校验邀请码是否存在
 *
 * 安全修复：
 * - IP 级别速率限制：60 秒内同一 IP 最多 20 次
 * - 用户级别限流：60 秒内同一用户最多 50 次
 * - 添加邀请码格式正则验证
 * - 支持双格式：8位小写hex（新格式） + RF-XXXXXXXX（老格式，数据库trigger遗留）
 *
 * 限流存储：优先使用 Supabase rate_limits 表
 * 降级方案：表不存在时使用内存存储（单实例部署可用）
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

// ─── 常量定义 ───────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000       // 60 秒窗口
const MAX_REQUESTS_IP = 20     // IP 级别：窗口内最多请求次数
const MAX_REQUESTS_USER = 50   // 用户级别：窗口内最多请求次数

// 邀请码格式：支持两种
// 1. 新格式：8位小写十六进制（0-9a-f），与 /api/referral/code 生成格式一致
// 2. 老格式：RF- + 8位大写字母数字（数据库 trigger 历史遗留）
const REFERRAL_CODE_REGEX = /^(?:[0-9a-f]{8}|RF-[A-Z0-9]{8})$/i

// ─── 内存限流（降级方案）────────────────────────────────────────────────────

const memoryRateLimitMap = new Map<string, { count: number; resetAt: number }>()
let useMemoryFallback = false

async function checkRateLimitWithFallback(ip: string, userId?: string): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now()

  // 尝试使用 Supabase
  if (!useMemoryFallback) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      const windowStart = new Date(now - WINDOW_MS).toISOString()

      // 检查 IP 限流
      const { count: ipCount } = await supabase
        .from("rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("key_type", "ip")
        .eq("key_value", ip)
        .gte("created_at", windowStart)

      if ((ipCount || 0) >= MAX_REQUESTS_IP) {
        return { allowed: false, reason: "IP请求过于频繁" }
      }

      // 记录 IP 请求
      await supabase.from("rate_limits").insert({
        key_type: "ip",
        key_value: ip,
        reset_at: new Date(now + WINDOW_MS).toISOString(),
      })

      // V-L-06 FIX: 写入后异步清理过期记录，防止数据库无限增长
      void supabase.from("rate_limits").delete()
        .lt("created_at", new Date(now - 2 * WINDOW_MS).toISOString())

      // 检查用户限流（如果有 userId）
      if (userId) {
        const { count: userCount } = await supabase
          .from("rate_limits")
          .select("*", { count: "exact", head: true })
          .eq("key_type", "user")
          .eq("key_value", userId)
          .gte("created_at", windowStart)

        if ((userCount || 0) >= MAX_REQUESTS_USER) {
          return { allowed: false, reason: "用户验证次数过多" }
        }

        await supabase.from("rate_limits").insert({
          key_type: "user",
          key_value: userId,
          reset_at: new Date(now + WINDOW_MS).toISOString(),
        })

        // V-L-06 FIX: 用户限流记录同样清理
        void supabase.from("rate_limits").delete()
          .lt("created_at", new Date(now - 2 * WINDOW_MS).toISOString())
      }

      return { allowed: true }
    } catch (err) {
      console.warn("[RateLimit] Supabase 限流失败，切换到内存限流:", err)
      useMemoryFallback = true
    }
  }

  // 使用内存限流（降级方案）
  // IP 限流
  const ipEntry = memoryRateLimitMap.get(`ip:${ip}`)
  if (ipEntry) {
    if (now > ipEntry.resetAt) {
      memoryRateLimitMap.set(`ip:${ip}`, { count: 1, resetAt: now + WINDOW_MS })
    } else if (ipEntry.count >= MAX_REQUESTS_IP) {
      return { allowed: false, reason: "IP请求过于频繁" }
    } else {
      ipEntry.count++
    }
  } else {
    memoryRateLimitMap.set(`ip:${ip}`, { count: 1, resetAt: now + WINDOW_MS })
  }

  // 用户限流
  if (userId) {
    const userKey = `user:${userId}`
    const userEntry = memoryRateLimitMap.get(userKey)
    if (userEntry) {
      if (now > userEntry.resetAt) {
        memoryRateLimitMap.set(userKey, { count: 1, resetAt: now + WINDOW_MS })
      } else if (userEntry.count >= MAX_REQUESTS_USER) {
        return { allowed: false, reason: "用户验证次数过多" }
      } else {
        userEntry.count++
      }
    } else {
      memoryRateLimitMap.set(userKey, { count: 1, resetAt: now + WINDOW_MS })
    }
  }

  // 清理过期记录
  for (const [key, entry] of memoryRateLimitMap) {
    if (now > entry.resetAt) {
      memoryRateLimitMap.delete(key)
    }
  }

  return { allowed: true }
}

// ─── 验证邀请码格式 ─────────────────────────────────────────────────────────

function validateReferralCodeFormat(code: string): { valid: boolean; message?: string } {
  if (code.length !== 12 && code.length !== 8) {
    return { valid: false, message: "邀请码长度不正确（应为 8 位小写十六进制或 RF-XXXXXXXX 格式）" }
  }
  if (!REFERRAL_CODE_REGEX.test(code)) {
    return { valid: false, message: "邀请码格式不正确（应为 8 位小写十六进制或 RF-XXXXXXXX 格式）" }
  }
  return { valid: true }
}

// ─── 获取客户端 IP ──────────────────────────────────────────────────────────

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  )
}

// ─── 主逻辑 ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)

  let body: { code?: string; userId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ valid: false, message: "参数错误" }, { status: 400 })
  }

  const code = (body.code || "").trim().toLowerCase()
  const userId = body.userId

  // 检查限流
  const rateCheck = await checkRateLimitWithFallback(ip, userId)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        valid: false,
        message: `${rateCheck.reason}，请稍后再试`,
        retryAfter: Math.ceil(WINDOW_MS / 1000),
      },
      { status: 429 }
    )
  }

  if (!code) {
    return NextResponse.json({ valid: true, exists: false })
  }

  // 验证邀请码格式
  const formatCheck = validateReferralCodeFormat(code)
  if (!formatCheck.valid) {
    return NextResponse.json({ valid: false, message: formatCheck.message }, { status: 400 })
  }

  // 查询数据库
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from("referrer_codes")
    .select("user_id")
    .eq("code", code.toLowerCase())
    .maybeSingle()

  if (error) {
    console.error("[Referral Validate] 查询失败:", error)
    return NextResponse.json({ valid: false, message: "校验失败，请稍后重试" }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ valid: false, message: "邀请码不存在，请核对后再填" })
  }

  return NextResponse.json({ valid: true, exists: true })
}
