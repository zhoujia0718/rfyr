/**
 * 安全工具函数
 *
 * 包含：
 * - 验证码哈希（存储时哈希，验证时比较哈希）
 * - HMAC 签名生成和验证
 */

import { randomInt, createHmac, randomBytes, pbkdf2Sync } from 'crypto'

/**
 * 安全生成 6 位数字验证码
 * 使用 crypto.randomInt（CSPRNG）替代 Math.random()，防止验证码被预测
 */
export function generateSecureVerificationCode(): string {
  return String(randomInt(100000, 999999))
}

/**
 * 使用 SHA-256 哈希验证码（同步版本，用于服务端）
 * 返回 16 字符的十六进制哈希
 * 使用 HMAC_SECRET 环境变量作为 salt，防止代码泄露后彩虹表攻击
 */
export function hashVerificationCodeSync(code: string): string {
  if (!process.env.VERIFY_HASH_SECRET && !process.env.HMAC_SECRET) {
    throw new Error(
      "[Security] VERIFY_HASH_SECRET 或 HMAC_SECRET 环境变量未配置，无法哈希验证码。"
      + " 请设置安全的环境变量后重启服务。"
    )
  }
  const secret = process.env.VERIFY_HASH_SECRET || process.env.HMAC_SECRET!
  return createHmac("sha256", secret).update(code).digest("hex").slice(0, 16)
}

/**
 * V-H-05 FIX: 哈希用户密码后再存入 pending_registrations
 * 使用 PBKDF2-HMAC-SHA256（100k 迭代），与 Supabase 内部一致
 * 注意：pending_registrations 是临时表，密码仅在此短暂停留后通过 createUser 写入 Supabase Auth
 */
export function hashPassword(password: string): string {
  const iterations = 100_000
  const keylen = 32
  const digest = "sha256"
  const salt = randomBytes(16).toString("hex")
  const hash = pbkdf2Sync(password, salt, iterations, keylen, digest).toString("hex")
  return `${salt}:${hash}:${iterations}`
}

/**
 * 验证密码哈希（用于验证 pending_registrations 中哈希后的密码）
 */
export function verifyPasswordHash(password: string, storedHash: string): boolean {
  try {
    const [salt, hash, iterationsStr] = storedHash.split(":")
    if (!salt || !hash || !iterationsStr) return false
    const iterations = parseInt(iterationsStr, 10)
    if (isNaN(iterations)) return false
    const computed = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex")
    return computed === hash
  } catch {
    return false
  }
}

/**
 * 使用 SHA-256 哈希验证码（异步版本，用于浏览器环境）
 * 浏览器使用 Web Crypto API，服务端 fallback 到 HMAC
 */
export async function hashVerificationCode(code: string): Promise<string> {
  if (!process.env.NEXT_PUBLIC_VERIFY_HASH_SECRET) {
    throw new Error(
      "[Security] NEXT_PUBLIC_VERIFY_HASH_SECRET 环境变量未配置，无法哈希验证码。"
    )
  }
  const secret = process.env.NEXT_PUBLIC_VERIFY_HASH_SECRET
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(code)
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )
    const signature = await crypto.subtle.sign("HMAC", key, messageData)
    const hashArray = Array.from(new Uint8Array(signature))
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16)
  } else {
    return hashVerificationCodeSync(code)
  }
}

/**
 * HMAC-SHA256 签名（服务端同步版本）
 * V-L-03 FIX: 返回完整 64 字符（SHA256 hex），不截断
 */
export function createHmacSignatureSync(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex")
}

/**
 * HMAC-SHA256 签名（异步版本，用于浏览器环境）
 * V-L-03 FIX: 返回完整 64 字符，不截断
 */
export async function createHmacSignature(data: string, secret: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(data)

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )

    const signature = await crypto.subtle.sign("HMAC", key, messageData)
    const hashArray = Array.from(new Uint8Array(signature))
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
  } else {
    return createHmacSignatureSync(data, secret)
  }
}
