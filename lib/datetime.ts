/**
 * ============================================================
 * 时区工具 — 全系统统一时间处理
 * ============================================================
 *
 * 背景（P7 问题）：代码中存在多处时区处理不一致：
 *   - 某些地方用 toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
 *   - 某些地方用 new Date().getHours() + 8 简单估算
 *   - 数据库存 UTC，前端比较 CST，容易出现边界 Bug
 *
 * 解决方案：
 *   - 数据存储：统一使用 ISO 8601 UTC 字符串（数据库层）
 *   - 前端比较：统一使用 toLocalDateString() 获取 CST 日期字符串
 *   - 禁止使用 getHours() + offset 的方式做日期比较
 *
 * 规则：
 *   - 数据库 (PostgreSQL): TIMESTAMPTZ → UTC 存储
 *   - 业务逻辑比较: 使用 CST 日期字符串 (YYYY-MM-DD)
 *   - UI 展示: 使用 toLocaleDateString('zh-CN') 或 Intl.DateTimeFormat
 */

const CST_TIMEZONE = 'Asia/Shanghai'
const CST_OFFSET_HOURS = 8 // UTC+8

/**
 * 获取中国标准时间（CST）的当前日期字符串。
 * 返回格式：YYYY-MM-DD（北京时间）
 *
 * 用于：
 *   - 每日配额重置判断
 *   - 阅读记录日期比较
 *   - 任何需要"今天/明天"判断的业务逻辑
 *
 * @example
 *   toLocalDateString() // '2026-04-20'
 */
export function toLocalDateString(date: Date = new Date()): string {
  // 方法1：使用 Intl API（推荐，无依赖）
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

/**
 * 获取中国标准时间（CST）的当前日期时间 ISO 字符串。
 * 用于存储到数据库（TIMESTAMPTZ）。
 *
 * @example
 *   toLocalNow() // '2026-04-20T09:30:00.000+08:00'
 */
export function toLocalNow(): string {
  const date = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'

  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour')
  const minute = get('minute')
  const second = get('second')
  const frac = get('fractionalSecond')

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${frac}+08:00`
}

/**
 * 简化版：返回 "YYYY-MM-DD" 格式的 CST 日期。
 * 使用 toISOString() + 加 8 小时（等价于 CST 0点 = UTC 前一天 16点 的边界处理）。
 *
 * ⚠️ 注意：此方法在 UTC 23:00-24:00 (CST 07:00-08:00) 时会有1天误差。
 * 请使用 toLocalDateString() 代替。
 *
 * @deprecated 请使用 toLocalDateString()
 */
export function toCSTDateString(date: Date = new Date()): string {
  const utc = date.getTime() + date.getTimezoneOffset() * 60 * 1000
  const cst = utc + CST_OFFSET_HOURS * 60 * 60 * 1000
  const cstDate = new Date(cst)
  const year = cstDate.getUTCFullYear()
  const month = String(cstDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(cstDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 检查一个 UTC ISO 字符串对应的日期（北京时间）是否等于今天。
 * 用于：每日配额重置判断。
 *
 * @param isoString - ISO 日期字符串（可以是 UTC 或 CST）
 * @returns 是否为今天（北京时间）
 */
export function isToday(isoString: string | null | undefined): boolean {
  if (!isoString) return false
  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return false
    return toLocalDateString(date) === toLocalDateString(new Date())
  } catch {
    return false
  }
}

/**
 * 检查一个日期是否已过期（北京时间）。
 *
 * @param endDateStr - 到期日期字符串（ISO 8601）
 * @returns 是否已过期
 */
export function isExpired(endDateStr: string | null | undefined): boolean {
  if (!endDateStr) return true
  try {
    const endDate = new Date(endDateStr)
    if (isNaN(endDate.getTime())) return true
    return endDate.getTime() < Date.now()
  } catch {
    return true
  }
}

/**
 * 获取 CST 时区的"今天 00:00:00"对应的 UTC Date 对象。
 * 用于：数据库日期范围查询。
 */
export function getCSTDayStart(dateStr: string = toLocalDateString()): Date {
  // "2026-04-20" → "2026-04-20T00:00:00+08:00" → Date
  return new Date(`${dateStr}T00:00:00+08:00`)
}

/**
 * 获取 CST 时区的"今天 23:59:59"对应的 UTC Date 对象。
 */
export function getCSTDayEnd(dateStr: string = toLocalDateString()): Date {
  return new Date(`${dateStr}T23:59:59.999+08:00`)
}

/**
 * 计算两个日期之间相差的天数（按 CST 计算）。
 * 用于：计算会员剩余天数。
 */
export function daysBetween(startStr: string, endStr: string): number {
  try {
    const start = new Date(startStr)
    const end = new Date(endStr)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
    const diffMs = end.getTime() - start.getTime()
    const result = Math.round(diffMs / (24 * 60 * 60 * 1000))
    return result === 0 ? 0 : result // normalize -0 to 0
  } catch {
    return 0
  }
}

/**
 * 获取会员剩余天数（按 CST）。
 */
export function getDaysRemaining(endDateStr: string): number {
  return daysBetween(new Date().toISOString(), endDateStr)
}
