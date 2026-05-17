/**
 * localStorage 辅助工具
 * 安全地管理 localStorage 存储，避免信息泄漏
 */

import { LOCAL_STORAGE_KEYS } from './constants'

/**
 * 获取 PDF 原始文件名的存储键
 * 使用 articleId 而非完整 URL，避免泄漏敏感信息
 */
export function getPdfOriginalNameKey(articleId: string): string {
  return `${LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME}${articleId}`
}

/**
 * 获取 HTML 原始文件名的存储键
 */
export function getHtmlOriginalNameKey(articleId: string): string {
  return `${LOCAL_STORAGE_KEYS.HTML_ORIGINAL_NAME}${articleId}`
}

/**
 * 安全地获取 localStorage 中的 PDF 原始文件名
 * 优先使用 articleId 作为 key，回退到 URL hash
 */
export function getStoredPdfOriginalName(
  articleId: string,
  url: string
): string | null {
  // 优先使用 articleId
  const keyById = getPdfOriginalNameKey(articleId)
  const stored = localStorage.getItem(keyById)
  if (stored) return stored

  // 回退：使用 URL hash
  if (url) {
    const urlKey = `${LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME}${url}`
    const urlStored = localStorage.getItem(urlKey)
    if (urlStored) {
      // 迁移到 articleId key
      localStorage.setItem(keyById, urlStored)
      localStorage.removeItem(urlKey)
      return urlStored
    }
  }

  return null
}

/**
 * 安全地存储 PDF 原始文件名
 */
export function setStoredPdfOriginalName(
  articleId: string,
  originalName: string
): void {
  const keyById = getPdfOriginalNameKey(articleId)
  localStorage.setItem(keyById, originalName)
}

/**
 * 安全地获取 localStorage 中的 HTML 原始文件名
 */
export function getStoredHtmlOriginalName(
  articleId: string,
  url: string
): string | null {
  const keyById = getHtmlOriginalNameKey(articleId)
  const stored = localStorage.getItem(keyById)
  if (stored) return stored

  if (url) {
    const urlKey = `${LOCAL_STORAGE_KEYS.HTML_ORIGINAL_NAME}${url}`
    const urlStored = localStorage.getItem(urlKey)
    if (urlStored) {
      localStorage.setItem(keyById, urlStored)
      localStorage.removeItem(urlKey)
      return urlStored
    }
  }

  return null
}

/**
 * 安全地存储 HTML 原始文件名
 */
export function setStoredHtmlOriginalName(
  articleId: string,
  originalName: string
): void {
  const keyById = getHtmlOriginalNameKey(articleId)
  localStorage.setItem(keyById, originalName)
}

/**
 * 清理过期的 localStorage 条目
 * 建议在应用启动时调用一次
 */
export function cleanupExpiredStorage(maxAgeMs = 30 * 24 * 60 * 60 * 1000): void {
  // 注意：这个实现需要存储时间戳，暂不实现
  // 简化版本：定期清理旧格式的 key
  const keysToRemove: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue

    // 清理旧格式（包含 URL 的 key）
    if (
      key.startsWith(LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME) ||
      key.startsWith(LOCAL_STORAGE_KEYS.HTML_ORIGINAL_NAME)
    ) {
      // 检查是否是旧格式（包含 http 或完整 URL）
      const suffix = key.substring(
        (LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME).length
      )
      if (suffix.includes('http') || suffix.includes('storage')) {
        keysToRemove.push(key)
      }
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key))
}
