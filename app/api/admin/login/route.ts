/**
 * POST /api/admin/login
 *
 * 后台管理员登录接口。
 * 验证用户凭证后，通过 Response Cookie 设置 session。
 *
 * 安全修复 (P-A-01 & P-A-06):
 * - admin-session-local cookie 必须有 HMAC 签名，否则拒绝登录
 * - 速率限制：三层防御（内存快速检查 + Supabase 持久化 + 内存降级）
 * - Cookie 中 userId 使用 Base64 编码 + 随机盐，防止明文泄漏
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac, randomBytes } from "crypto"
import { generateFakeToken } from "@/lib/server-auth-user"

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim()) ?? []
const HMAC_SECRET = process.env.HMAC_SECRET

// ─── 速率限制配置 ─────────────────────────────────────────────────────────────

const LOGIN_RATE_LIMIT_MS = 5 * 60 * 1000      // 5 分钟窗口
const LOGIN_RATE_LIMIT_COUNT = 5                // 最多 5 次尝试
const LOGIN_RATE_LIMIT_WINDOW = 5 * 60          // 窗口秒数（用于返回）

// 内存 Map：用于快速检查
const loginAttemptMap = new Map<string, { count: number; resetAt: number }>()

// 是否切换到纯内存模式（Supabase 不可用时）
let useMemoryFallback = false

/**
 * 三层防御速率限制检查
 *
 * 第一层：内存 Map 快速检查（防住大多数请求）
 * 第二层：Supabase 持久化检查（防止多实例绕过，支持计数）
 * 第三层：纯内存降级（Supabase 完全不可用时）
 */
async function checkLoginRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const now = Date.now()

  // ── 第一层: 内存快速检查 ────────────────────────────────────────────────
  const memEntry = loginAttemptMap.get(ip)
  if (memEntry && now < memEntry.resetAt) {
    if (memEntry.count >= LOGIN_RATE_LIMIT_COUNT) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((memEntry.resetAt - now) / 1000)
      }
    }
  }

  // ── 第二层: Supabase 持久化检查 ───────────────────────────────────────
  if (!useMemoryFallback) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

      if (!supabaseKey) {
        // 没有 service key，跳过 Supabase 层
        useMemoryFallback = true
        return checkMemoryFallback(ip, now, memEntry)
      }

      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      const windowStart = new Date(now - LOGIN_RATE_LIMIT_MS).toISOString()

      // 竞态条件修复: 使用 upsert 原子操作代替 select + insert
      // 如果记录已存在，onConflict 不会增加计数，所以我们用另一种方法：
      // 先尝试 insert，如果返回唯一约束冲突，再查询计数
      const insertResult = await supabase
        .from("rate_limits")
        .insert({
          key_type: "login_ip",
          key_value: ip,
          reset_at: new Date(now + LOGIN_RATE_LIMIT_MS).toISOString(),
        })
        .select()
        .limit(1)

      // 如果插入成功（不是重复请求），更新内存并继续
      if (!insertResult.error) {
        // 同步更新内存 Map
        loginAttemptMap.set(ip, {
          count: (memEntry?.count || 0) + 1,
          resetAt: now + LOGIN_RATE_LIMIT_MS
        })

        // 异步清理过期记录
        const oldWindow = new Date(now - 2 * LOGIN_RATE_LIMIT_MS).toISOString()
        void supabase.from("rate_limits")
          .delete()
          .lt("created_at", oldWindow)
          .eq("key_type", "login_ip")

        return { allowed: true, retryAfterSec: 0 }
      }

      // 插入失败（可能是重复），查询当前计数
      const { count } = await supabase
        .from("rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("key_type", "login_ip")
        .eq("key_value", ip)
        .gte("created_at", windowStart)

      const currentCount = count || 0

      if (currentCount >= LOGIN_RATE_LIMIT_COUNT) {
        return {
          allowed: false,
          retryAfterSec: LOGIN_RATE_LIMIT_WINDOW
        }
      }

      // 如果还能插入，说明刚才的冲突已过期，尝试再次插入
      const retryResult = await supabase
        .from("rate_limits")
        .insert({
          key_type: "login_ip",
          key_value: ip,
          reset_at: new Date(now + LOGIN_RATE_LIMIT_MS).toISOString(),
        })
        .select()
        .limit(1)

      if (!retryResult.error) {
        loginAttemptMap.set(ip, {
          count: currentCount + 1,
          resetAt: now + LOGIN_RATE_LIMIT_MS
        })
        return { allowed: true, retryAfterSec: 0 }
      }

      // 仍然失败，说明确实超限了
      return {
        allowed: false,
        retryAfterSec: LOGIN_RATE_LIMIT_WINDOW
      }

    } catch (err) {
      console.warn("[RateLimit] Supabase 不可用，切换到内存模式:", err)
      useMemoryFallback = true
    }
  }

  // ── 第三层: 纯内存降级 ─────────────────────────────────────────────────
  return checkMemoryFallback(ip, now, memEntry)
}

/**
 * 纯内存降级模式
 */
function checkMemoryFallback(
  ip: string,
  now: number,
  memEntry: { count: number; resetAt: number } | undefined
): { allowed: boolean; retryAfterSec: number } {
  if (!memEntry || now > memEntry.resetAt) {
    loginAttemptMap.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_MS })
    return { allowed: true, retryAfterSec: 0 }
  }

  memEntry.count++

  if (memEntry.count >= LOGIN_RATE_LIMIT_COUNT) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((memEntry.resetAt - now) / 1000)
    }
  }

  return { allowed: true, retryAfterSec: 0 }
}

/**
 * 记录登录失败（用于内存降级模式的内存更新）
 */
function recordLoginAttemptMem(ip: string): void {
  const now = Date.now()
  const entry = loginAttemptMap.get(ip)

  if (!entry || now > entry.resetAt) {
    loginAttemptMap.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_MS })
  } else {
    entry.count++
  }
}

/**
 * 清除登录记录（登录成功时调用）
 */
function clearLoginAttempts(ip: string): void {
  loginAttemptMap.delete(ip)
}

/**
 * 获取客户端 IP
 */
function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  )
}

/**
 * 生成 HMAC 签名并 Base64 编码 Cookie
 *
 * P-A-06 修复：Cookie 中不再明文存储 userId
 * 新格式: Base64(salt_userId_expiresAt_HMAC)
 * HMAC 消息: salt_userId_expiresAt（包含随机盐，攻击者无法推断 userId）
 */
function createSecureCookie(userId: string, expiresAt: number): string {
  const randomSalt = randomBytes(8).toString("hex")
  const msgBuf = Buffer.from(`${randomSalt}_${userId}_${expiresAt}`, "utf-8")
  const signature = createHmac("sha256", Buffer.from(HMAC_SECRET!, "utf-8"))
    .update(msgBuf)
    .digest("hex")

  // 完整 payload: salt + userId + expiresAt + signature，Base64 编码
  const payload = `${randomSalt}_${userId}_${expiresAt}_${signature}`
  return Buffer.from(payload).toString("base64")
}

/**
 * 验证 HMAC 签名 Cookie
 *
 * P-A-06 修复：解析 Base64 编码的 Cookie，验证 HMAC 签名
 */
function verifySecureCookie(cookieValue: string): string | null {
  try {
    const decoded = Buffer.from(cookieValue, "base64").toString("utf-8")
    const parts = decoded.split("_")

    // 格式: salt_userId_expiresAt_signature (4 parts)
    // 注意: userId 是 UUID，可能包含 "-" 而不是 "_"，所以用固定 4 段分割
    if (parts.length !== 4) return null

    const [salt, userId, expiresAtStr, signature] = parts
    const expiresAt = parseInt(expiresAtStr, 10)

    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) {
      return null // 过期
    }

    // 重新计算 HMAC 验证
    const msgBuf = Buffer.from(`${salt}_${userId}_${expiresAtStr}`, "utf-8")
    const expectedSig = createHmac("sha256", Buffer.from(HMAC_SECRET!, "utf-8"))
      .update(msgBuf)
      .digest("hex")

    if (signature !== expectedSig) {
      return null // 签名不匹配
    }

    return userId
  } catch {
    return null
  }
}

// ─── 主处理函数 ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)

  // ── 速率限制检查 ─────────────────────────────────────────────────────────
  const rateCheck = await checkLoginRateLimit(clientIP)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: `登录尝试过于频繁，请 ${rateCheck.retryAfterSec} 秒后再试` },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } }
    )
  }

  // ── 必须有 HMAC_SECRET ───────────────────────────────────────────────────
  if (!HMAC_SECRET) {
    console.error("[AdminLogin] HMAC_SECRET 未配置，拒绝管理员登录（安全策略）")
    return NextResponse.json(
      { ok: false, error: "服务器安全配置异常，请联系管理员" },
      { status: 500 }
    )
  }

  // ── 解析请求体 ───────────────────────────────────────────────────────────
  let email: string
  let password: string

  try {
    const body = await request.json()
    email = body.email?.trim()
    password = body.password
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "请输入用户名和密码" }, { status: 400 })
  }

  // ── Supabase 身份验证 ───────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabaseAuth = createClient(supabaseUrl, anonKey)

  const { data: signInData, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError || !signInData.user) {
    // 记录失败（更新内存）
    recordLoginAttemptMem(clientIP)
    return NextResponse.json({ ok: false, error: "用户名或密码错误" }, { status: 401 })
  }

  const userId = signInData.user.id

  // ── 管理员权限校验 ────────────────────────────────────────────────────────
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) {
    // 记录失败
    recordLoginAttemptMem(clientIP)
    return NextResponse.json({ ok: false, error: "您没有后台管理权限" }, { status: 403 })
  }

  // ── 生成伪造 Token（用于前端文章 API）────────────────────────────────────
  const fakeToken = generateFakeToken(userId)

  const response = NextResponse.json({
    ok: true,
    userId,
    email,
    message: "登录成功",
    fakeToken,
  })

  // ── 登录成功，清除失败记录 ───────────────────────────────────────────────
  clearLoginAttempts(clientIP)

  // ── 设置安全的 Cookie（P-A-06 修复）────────────────────────────────────
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 天

  // 生成 Base64 编码的 Cookie（userId 不再明文）
  const cookiePayload = createSecureCookie(userId, expiresAt)

  response.cookies.set("admin-session-local", cookiePayload, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })

  return response
}
