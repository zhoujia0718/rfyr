/**
 * 书籍功能共享工具
 * 类型定义、密码生成、下载权限判断
 */

import { MemberTier, MEMBER_TIERS, isUnlimitedTier } from './member-tiers'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type BookAccessLevel = 'free' | 'monthly' | 'yearly'

/** 公开 API 返回的书籍字段（不含 download_password / file_path） */
export interface BookPublic {
  id: string
  title: string
  author: string | null
  description: string | null
  cover_url: string | null
  access_level: BookAccessLevel
  sort_order: number
  published: boolean
  created_at: string
  updated_at: string
}

/** 管理后台使用的完整书籍字段（含密码，仅 service_role 可取） */
export interface BookAdmin extends BookPublic {
  file_path: string
  download_password: string
}

// ─── 密码生成 ─────────────────────────────────────────────────────────────────

const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // 去掉易混淆字符 0/O/1/I/L
const PASSWORD_CODE_LENGTH = 4

/**
 * 生成格式为 RFYR-XXXX 的下载码
 * 使用不含易混淆字符（0/O/1/I/L）的字符集
 */
export function generateBookPassword(): string {
  const code = Array.from({ length: PASSWORD_CODE_LENGTH }, () => {
    const idx = Math.floor(Math.random() * PASSWORD_CHARS.length)
    return PASSWORD_CHARS[idx]
  }).join('')
  return `RFYR-${code}`
}

// ─── 下载权限判断 ─────────────────────────────────────────────────────────────

/**
 * 判断用户是否可免密下载某本书
 *
 * 规则：
 *   yearly / permanent → 免密下载所有书
 *   monthly            → 免密下载 monthly（含 free）级别的书
 *   none               → 始终需要密码
 */
export function canDownloadFree(
  userTier: MemberTier,
  bookAccessLevel: BookAccessLevel
): boolean {
  // yearly / permanent 免密下载一切
  if (isUnlimitedTier(userTier)) return true

  // monthly 免密下载 monthly 及以下
  if (userTier === MEMBER_TIERS.MONTHLY) {
    return bookAccessLevel === 'monthly' || bookAccessLevel === 'free'
  }

  return false
}

/**
 * 判断用户的密码是否正确（纯字符串比较，在服务端调用）
 * 密码比较时忽略大小写，并去掉首尾空格
 */
export function verifyBookPassword(
  inputPassword: string,
  storedPassword: string
): boolean {
  return (
    inputPassword.trim().toUpperCase() === storedPassword.trim().toUpperCase()
  )
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

export const BOOK_ACCESS_LEVEL_LABELS: Record<BookAccessLevel, string> = {
  free: '免费',
  monthly: '月卡',
  yearly: '年卡',
}

export const WATERMARK_TEXT = '日富一日：rfyr.club'
