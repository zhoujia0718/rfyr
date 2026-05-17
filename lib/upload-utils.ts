/**
 * 文件上传工具模块
 * 提供统一的上传接口、重试机制和错误处理
 */

import { UPLOAD_CONFIG, CONTENT_LIMITS, STORAGE_PATH } from './constants'

// ========================
// 类型定义
// ========================

export interface UploadOptions {
  /** 内容类型 */
  contentType?: string
  /** 缓存控制 */
  cacheControl?: string
  /** 是否使用幂等上传 */
  idempotent?: boolean
}

export interface UploadResult {
  success: boolean
  publicUrl?: string
  error?: string
}

export interface RetryableUploadOptions extends UploadOptions {
  /** 最大重试次数 */
  maxRetries?: number
  /** 基础延迟（毫秒） */
  baseDelayMs?: number
}

// ========================
// 工具函数
// ========================

/**
 * 验证存储路径是否安全
 */
export function isSafeStoragePath(path: string): boolean {
  if (!path || path.length > CONTENT_LIMITS.MAX_PATH_LENGTH) {
    return false
  }

  // 检查禁止的模式
  for (const pattern of STORAGE_PATH.FORBIDDEN_PATTERNS) {
    if (path.includes(pattern)) {
      return false
    }
  }

  // 验证字符白名单
  if (!STORAGE_PATH.ALLOWED_CHARS.test(path)) {
    return false
  }

  // 不能以 / 开头
  if (path.startsWith('/')) {
    return false
  }

  return true
}

/**
 * 生成安全的文件名
 * - 移除路径遍历字符
 * - 截断超长文件名
 */
export function sanitizeFileName(name: string, maxLength: number = CONTENT_LIMITS.MAX_FILENAME_LENGTH): string {
  // 获取最后一部分（移除路径）
  const base = name.split(/[/\\]/).pop()?.trim() || 'file'

  // 移除双点和其他危险字符
  let safeName = base.replace(/\.\./g, '_')

  // 截断
  if (safeName.length > maxLength) {
    const ext = safeName.split('.').pop()
    const nameWithoutExt = safeName.substring(0, safeName.length - (ext?.length || 0) - 1)
    const availableLength = maxLength - (ext?.length || 0) - 1
    safeName = nameWithoutExt.substring(0, Math.max(availableLength, 1)) + '.' + ext
  }

  return safeName
}

/**
 * 从文件名推断 MIME 类型
 */
export function guessContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()

  const mimeTypes: Record<string, string> = {
    // 图片
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    // 文档
    pdf: 'application/pdf',
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    // 其他
    json: 'application/json',
    js: 'application/javascript',
    css: 'text/css',
    txt: 'text/plain',
  }

  return mimeTypes[ext || ''] || 'application/octet-stream'
}

// ========================
// 上传 API 封装
// ========================

const ADMIN_STORAGE_UPLOAD_API = '/api/admin/storage-upload'

/**
 * 通过管理端 API 上传文件
 */
async function uploadToApi(
  bucket: string,
  path: string,
  file: File | Blob,
  options: UploadOptions = {}
): Promise<UploadResult> {
  // 验证路径
  if (!isSafeStoragePath(path)) {
    return { success: false, error: '无效的存储路径' }
  }

  const ct = options.contentType || (file instanceof File && file.type ? file.type : '') || 'application/octet-stream'

  const fd = new FormData()
  fd.set('bucket', bucket)
  fd.set('path', path)
  fd.set('cacheControl', options.cacheControl ?? '3600')
  fd.set('contentType', ct)
  fd.set('file', file instanceof File ? file : new File([file], 'upload.bin', { type: ct }))

  try {
    const res = await fetch(ADMIN_STORAGE_UPLOAD_API, {
      method: 'POST',
      body: fd,
    })

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      return {
        success: false,
        error: json.error || `上传失败 (${res.status})`,
      }
    }

    const json = (await res.json()) as { publicUrl?: string; error?: string }

    if (!json.publicUrl) {
      return { success: false, error: '上传成功但未返回公网地址' }
    }

    return { success: true, publicUrl: json.publicUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败'
    return { success: false, error: message }
  }
}

// ========================
// 带重试的上传
// ========================

/**
 * 带重试机制的上传
 * 使用指数退避算法
 */
export async function uploadWithRetry(
  bucket: string,
  path: string,
  file: File | Blob,
  options: RetryableUploadOptions = {}
): Promise<UploadResult> {
  const maxRetries = options.maxRetries ?? UPLOAD_CONFIG.MAX_RETRIES
  const baseDelay = options.baseDelayMs ?? UPLOAD_CONFIG.RETRY_DELAY_BASE

  let lastError: string | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await uploadToApi(bucket, path, file, options)

    if (result.success) {
      return result
    }

    lastError = result.error

    // 如果不是网络错误或服务器错误，不重试
    if (
      !result.error?.includes('fetch') &&
      !result.error?.includes('network') &&
      !result.error?.includes('timeout') &&
      !result.error?.includes('500') &&
      !result.error?.includes('502') &&
      !result.error?.includes('503')
    ) {
      // 客户端错误（如验证失败），不重试
      break
    }

    // 最后一次尝试失败，不等待
    if (attempt < maxRetries) {
      // 指数退避 + 抖动
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  return { success: false, error: lastError || '上传失败' }
}

/**
 * 简化版上传（默认重试）
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
  options: UploadOptions = {}
): Promise<UploadResult> {
  return uploadWithRetry(bucket, path, file, {
    ...options,
    maxRetries: UPLOAD_CONFIG.MAX_RETRIES,
    baseDelayMs: UPLOAD_CONFIG.RETRY_DELAY_BASE,
  })
}

// ========================
// 特定文件类型的上传
// ========================

/**
 * 上传图片到 article-images 桶
 */
export async function uploadImage(
  file: File,
  fileName?: string
): Promise<UploadResult> {
  const timestamp = Date.now()
  const safeName = fileName || sanitizeFileName(file.name, 100)

  // 推断文件扩展名
  let ext = safeName.split('.').pop()
  if (!ext || ext.length > 5) {
    ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  }

  const finalName = `image_${timestamp}.${ext}`
  const mime = file.type.startsWith('image/') ? file.type : `image/${ext === 'jpg' ? 'jpeg' : ext}`

  return uploadFile('article-images', finalName, file, {
    contentType: mime,
    cacheControl: '3600',
  })
}

/**
 * 上传 PDF 到 article-pdfs 桶
 */
export async function uploadPdf(
  file: File,
  fileName?: string
): Promise<UploadResult> {
  const timestamp = Date.now()
  const safeName = sanitizeFileName(file.name || 'document.pdf', 100)
  const ext = safeName.split('.').pop() || 'pdf'
  const finalName = `file_${timestamp}.${ext}`

  return uploadFile('article-pdfs', finalName, file, {
    contentType: 'application/pdf',
    cacheControl: '3600',
  })
}

/**
 * 上传 HTML 文件到 article-pdfs 桶（子目录）
 */
export async function uploadHtml(
  file: File,
  folderName?: string
): Promise<UploadResult> {
  const folder = folderName || `h_${Date.now()}`
  const path = `${folder}/index.html`

  return uploadFile('article-pdfs', path, file, {
    contentType: 'text/html; charset=utf-8',
    cacheControl: '3600',
  })
}

// ========================
// 错误处理
// ========================

/**
 * 描述上传失败的原因
 */
export function describeUploadFailure(error: unknown): string {
  const e = error as { message?: string; name?: string }
  const raw = (e?.message || String(error || '')).trim()
  const lower = raw.toLowerCase()

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  ) {
    return (
      '无法连接服务器（Failed to fetch）。请先：\n' +
      '① 用无痕窗口重试\n' +
      '② 暂时关闭浏览器扩展\n' +
      '③ 确认网络能访问本服务'
    )
  }

  if (lower.includes('timeout')) {
    return '上传超时，请检查网络连接后重试'
  }

  if (lower.includes('file too large') || lower.includes('size limit')) {
    return `文件大小超过限制，请选择更小的文件（最大 ${CONTENT_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB）`
  }

  return raw || '上传失败，请稍后重试'
}
