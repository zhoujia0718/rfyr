// 短ID生成工具（与 articles 保持一致）

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

export function generateShortId(length = 8): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length))
  }
  return result
}

export function isShortId(value: string): boolean {
  // 短ID: 8位字母数字混合，不包含连字符
  return /^[A-Za-z0-9]{6,12}$/.test(value) && !value.includes('-')
}

/** 标准 UUID（文章主键），用于区分走 id 查询还是 short_id 查询 */
export function isArticleUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}
