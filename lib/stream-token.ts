import crypto from 'crypto'

function getSecret(): string {
  return process.env.QINIU_SECRET_KEY ?? process.env.NEXTAUTH_SECRET ?? 'rfyr-stream-fallback'
}

/** 生成流式预览 token，payload = base64url({fp, exp})，签名取前 32 位 hex */
export function createStreamToken(filePath: string, expireSeconds = 1800): string {
  const exp = Math.floor(Date.now() / 1000) + expireSeconds
  const payload = Buffer.from(JSON.stringify({ fp: filePath, exp })).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 32)
  return `${payload}.${sig}`
}

export function verifyStreamToken(token: string): { fp: string } | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const payload = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 32)
    if (sig !== expected) return null
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString())
    const { fp, exp } = parsed
    if (typeof fp !== 'string' || typeof exp !== 'number') return null
    if (Math.floor(Date.now() / 1000) > exp) return null
    return { fp }
  } catch {
    return null
  }
}
