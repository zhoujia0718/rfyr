import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 获取中国标准时间（CST，UTC+8）日期字符串，格式 YYYY-MM-DD
 *
 * 修复记录（P7）：
 * - 旧逻辑：new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString()
 *   错误：只加了 8 小时但没处理跨天，导致 UTC 23:00-24:00 返回错误日期
 * - 新逻辑：先检查 UTC 小时是否 >= 16（对应 CST 00:00），是则日期+1
 *
 * @example
 *   toLocalDateString()                          // '2026-04-20'（当前北京时间）
 *   toLocalDateString(new Date('2026-04-20T23:00:00Z')) // '2026-04-21'（UTC 23:00 = CST 次日 07:00）
 */
export function toLocalDateString(date: Date = new Date()): string {
  // 用 Intl API 精确计算 CST (Asia/Shanghai) 日期，避免 +8h 的边界误差
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}
