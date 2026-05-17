import { createClient } from "@supabase/supabase-js"
import { NextRequest } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── P10 修复：fakeToken 吊销缓存 ────────────────────────────────────────────
// sib = session_invalidated_before（Unix 秒，来自 auth user app_metadata）
// TTL 5 分钟：注销后最多 5 分钟内旧 token 仍有效（可接受折中）
const REVOCATION_CACHE_TTL = 5 * 60 * 1000
const revocationCache = new Map<string, { sib: number; cachedAt: number }>()

async function getSessionInvalidatedBefore(userId: string): Promise<number> {
  const cached = revocationCache.get(userId)
  if (cached && Date.now() - cached.cachedAt < REVOCATION_CACHE_TTL) {
    return cached.sib
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data } = await supabase.auth.admin.getUserById(userId)
    const sib = Number((data?.user?.app_metadata as any)?.sib ?? 0)
    revocationCache.set(userId, { sib, cachedAt: Date.now() })
    return sib
  } catch {
    return 0
  }
}

// ─── 密钥配置（用于验证前端生成的 token 签名）────────────────────────────
// 必须配置 HMAC_SECRET，前端登录时用此密钥签名伪造的 token
const HMAC_SECRET = process.env.HMAC_SECRET

// ─── 启动检查 ───────────────────────────────────────────────────────────

if (!HMAC_SECRET) {
  console.error("[Auth] 严重错误: 未配置 HMAC_SECRET 环境变量，伪造 token 验证已禁用")
  console.error("[Auth] 请在环境变量中设置 HMAC_SECRET，建议使用 32 位以上的随机字符串")
}

// ─── HMAC 签名验证 ─────────────────────────────────────────────────────

/**
 * 验证伪造 token 的签名
 * token 格式: fake_{userId}|{expiresAt}|{signature}
 * 使用 "|" pipe 分隔符，保证不会与 userId（UUID）中任何字符冲突
 */
function verifyFakeTokenSignature(token: string, userId: string): boolean {
  if (!HMAC_SECRET) {
    console.error("[Auth] 拒绝伪造 token: HMAC_SECRET 未配置")
    return false
  }

  // 格式检查
  if (!token.startsWith("fake_")) {
    console.warn("[Auth] 拒绝伪造 token: 前缀不是 fake")
    return false
  }

  // 从后向前精确切出 64 字符的 signature
  const signature = token.slice(-64)

  // signature 必须是 64 字符 hex
  if (!/^[0-9a-f]{64}$/i.test(signature)) {
    console.warn("[Auth] 拒绝伪造 token: signature 格式不正确")
    return false
  }

  // 去掉 "fake_" 前缀和 64 字符 signature 后缀
  const remainder = token.slice(4, -64)

  // 用 "|" pipe 分隔（保证不与 userId 中任何字符冲突）
  // 使用 indexOf + lastIndexOf 而非 split，避免 uid 中出现 pipe 时产生空字符串
  const firstPipeIdx = remainder.indexOf("|")
  const lastPipeIdx = remainder.lastIndexOf("|")
  if (firstPipeIdx === -1 || lastPipeIdx === -1 || firstPipeIdx === lastPipeIdx) {
    console.warn("[Auth] 拒绝伪造 token: 格式不正确")
    return false
  }

  const uid = remainder.slice(0, firstPipeIdx)
  const expiresAtStr = remainder.slice(firstPipeIdx + 1, lastPipeIdx)

  // 验证 userId 匹配
  if (uid !== userId) {
    console.warn("[Auth] 拒绝伪造 token: userId 不匹配")
    return false
  }

  // 检查过期（expiresAt 为 Unix 秒，Date.now() 为毫秒，需统一单位）
  const expiresAt = parseInt(expiresAtStr, 10)
  if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) {
    console.warn("[Auth] 拒绝伪造 token: token 已过期")
    return false
  }

  // 验证签名
  const expectedSignature = createHmacSignature(`${uid}|${expiresAtStr}`, HMAC_SECRET)
  if (signature !== expectedSignature) {
    console.warn("[Auth] 拒绝伪造 token: 签名验证失败")
    return false
  }

  return true
}

/**
 * base64url 解码（无 padding）
 */
function base64urlDecode(str: string): number | null {
  try {
    // 补回 padding
    const padded = str + "=".repeat((4 - (str.length % 4)) % 4)
    const decoded = Buffer.from(padded, "base64").toString("utf-8")
    const num = parseInt(decoded, 10)
    return isNaN(num) ? null : num
  } catch {
    return null
  }
}

/**
 * 创建 HMAC 签名（V-L-03 FIX: 返回完整 64 字符，不截断）
 */
function createHmacSignature(data: string, secret: string): string {
  const { createHmac } = require("crypto")
  const key = Buffer.from(secret, "utf-8")
  const msg = Buffer.from(data, "utf-8")
  return createHmac("sha256", key).update(msg).digest("hex")
}

/**
 * 生成伪造 token（供前端使用）
 * V-L-03 FIX: 使用完整 HMAC-SHA256（64 字符），不截断
 * 使用 "|" pipe 分隔 userId、expiresAt 和 signature，保证解析无歧义
 * ⚠️ 仅在配置了 HMAC_SECRET 时可用
 */
export function generateFakeToken(userId: string, expiresInSeconds: number = 7 * 24 * 60 * 60): string | null {
  if (!HMAC_SECRET) {
    console.error("[Auth] 无法生成伪造 token: HMAC_SECRET 未配置")
    return null
  }

  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
  const signature = createHmacSignature(`${userId}|${expiresAt}`, HMAC_SECRET)
  const token = `fake_${userId}|${expiresAt}|${signature}`
  return token
}

// ─── 用户 ID 解析 ──────────────────────────────────────────────────────

/**
 * 从请求中解析用户 ID。
 * 用于 Route Handler（服务端无法读 localStorage / custom_auth）。
 *
 * 认证优先级：
 * 1. 真实 Supabase access_token → 通过 supabase.auth.getUser(token) 验证 ✅ 安全
 * 2. 伪造 token（fake_ 前缀 + HMAC 签名）→ 验证签名后信任 X-User-Id header
 * 3. 仅 X-User-Id header（无 token）→ 已禁用，返回 null
 *
 * V-H-06 FIX: 移除仅依赖 X-User-Id 的降级方案
 *   攻击者若获取某用户 UUID，可直接冒充该用户身份（读操作）
 *   正确做法：任何认证必须包含密码学验证（HMAC 签名）
 *
 * ⚠️ 安全说明：
 * - 伪造 token 机制需要 HMAC_SECRET 配置才能使用
 * - X-User-Id header 不再单独作为认证依据
 * - 敏感操作必须使用 Supabase Service Role Key 直接验证
 */
export async function getUserIdFromBearer(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization")
  const userIdHeader = request.headers.get("x-user-id")?.trim()

  // ── 1. 真实 Supabase token ───────────────────────────────────────────
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim()

    if (!token.startsWith("fake_")) {
      // 真实 Supabase token
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data: { user }, error } = await supabase.auth.getUser(token)

      if (!error && user?.id) {
        return user.id
      }
      // Token 无效/过期 → 无降级，立即返回 null
    } else {
      // 伪造 token（fake_ 前缀 + HMAC 签名）
      if (userIdHeader) {
        const sigResult = verifyFakeTokenSignature(token, userIdHeader)
        if (sigResult) {
          // P10 修复：检查 token 是否在注销后颁发
          // token 格式：fake_{userId}|{expiresAt}|{sig}
          // issuedAt ≈ expiresAt - 7 * 24 * 3600（默认 7 天有效期）
          try {
            const remainder = token.slice(4, -64)
            const firstPipe = remainder.indexOf("|")
            const lastPipe = remainder.lastIndexOf("|")
            if (firstPipe !== -1 && lastPipe !== -1 && firstPipe !== lastPipe) {
              const expiresAt = parseInt(remainder.slice(firstPipe + 1, lastPipe), 10)
              const issuedAt = expiresAt - 7 * 24 * 3600
              const sib = await getSessionInvalidatedBefore(userIdHeader)
              if (sib > 0 && issuedAt < sib) {
                return null
              }
            }
          } catch { /* 解析失败不影响正常流程 */ }
          return userIdHeader
        }
      } else {
        console.warn('[getUserIdFromBearer] 伪造 token 但 userIdHeader 为空，跳过验证')
      }
    }

    // 任何认证失败都直接返回，不降级
    return null
  }

  // ── 2. 无 Authorization header：不再降级到 X-User-Id ───────────────
  // V-H-06 FIX: 禁止无 token 情况下的任何降级
  return null
}
