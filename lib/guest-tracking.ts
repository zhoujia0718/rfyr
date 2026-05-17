/**
 * ============================================================
 * 游客追踪工具
 * ============================================================
 *
 * P6 修复：改进游客追踪稳定性。
 *
 * 旧方案问题：
 * - 纯 IP+UA 哈希 → 切换网络/浏览器就变了，限制完全失效
 * - 无 fallback → 换 IP 即绕过了配额限制
 *
 * 新方案：
 * - 第一标识：First-Party Cookie / localStorage (最稳定)
 * - 第二标识：浏览器指纹 (UA + 语言 + 时区 + 屏幕分辨率)
 * - Fallback：IP+UA 哈希
 *
 * 注意：这些标识符都不具备完全唯一性，仅用于防君子不防小人。
 * 若需要严格防爬，应强制登录。
 */

const GUEST_ID_KEY = "rfyr_guest_id"
const GUEST_FP_KEY = "rfyr_guest_fp"

/**
 * 生成或获取游客唯一 ID（localStorage 第一方标识）。
 * 最稳定，只要不清缓存就一直有效。
 */
export function getGuestId(): string {
  if (typeof window === "undefined") return generateFallbackId()

  try {
    let guestId = localStorage.getItem(GUEST_ID_KEY)
    if (!guestId) {
      guestId = generateGuestId()
      localStorage.setItem(GUEST_ID_KEY, guestId)
    }
    return guestId
  } catch {
    return generateFallbackId()
  }
}

/**
 * 生成浏览器指纹（不依赖 localStorage）。
 * 用于：无法使用 localStorage 时的跨会话追踪。
 *
 * 组合因素：UA + 语言 + 时区 + 屏幕分辨率 + 颜色深度 + 平台
 */
export function getBrowserFingerprint(): string {
  if (typeof window === "undefined") return "server"

  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen.width,
      screen.height,
      screen.colorDepth,
      navigator.platform,
      navigator.hardwareConcurrency || "",
    ]
    return hashString(parts.join("|"))
  } catch {
    return "unknown"
  }
}

/**
 * 获取游客追踪 ID（优先 localStorage，降级到指纹）。
 * 用于发送给服务端记录。
 */
export function getTrackingId(): string {
  const guestId = getGuestId()
  const fp = getBrowserFingerprint()
  // 使用 localStorage ID 为主，指纹为辅
  return `${guestId}__${fp}`
}

/**
 * 清除游客追踪数据（退出登录时调用）。
 */
export function clearGuestTracking(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(GUEST_ID_KEY)
    localStorage.removeItem(GUEST_FP_KEY)
  } catch { /* ignore */ }
}

// ── helpers ────────────────────────────────────────────────────────

function generateGuestId(): string {
  return `guest_${Date.now()}_${randomHex(8)}`
}

function generateFallbackId(): string {
  return `fallback_${Date.now()}_${randomHex(8)}`
}

import { randomBytes } from 'crypto'

function randomHex(length: number): string {
  return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
}

/**
 * 简单哈希函数（用于指纹和 IP 哈希）。
 * 不需要加密强度，仅用于生成固定长度的标识符。
 */
export function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  // Convert to positive hex
  const positiveHash = (hash >>> 0).toString(16)
  return positiveHash.padStart(8, "0")
}

/**
 * 哈希处理 IP 地址（不可逆）。
 */
export function hashIP(ip: string): string {
  return hashString(ip)
}
