import { randomBytes } from "crypto"

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

export function generateShortId(length = 8): string {
  const bytes = randomBytes(length)
  let result = ""
  for (let i = 0; i < length; i++) {
    result += CHARS[bytes[i] % CHARS.length]
  }
  return result
}

export function isShortId(value: string): boolean {
  return /^[A-Za-z0-9]{6,12}$/.test(value) && !value.includes("-")
}

export function isArticleUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}
