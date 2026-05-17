/**
 * GET /api/books/stream?t={token}
 *
 * 服务端代理流式传输书籍 PDF，解决七牛 CDN X-Frame-Options 导致 iframe 无法嵌入的问题。
 * token 由 /api/books/preview 签发，有效期 30 分钟。
 */

import { NextRequest } from 'next/server'
import { verifyStreamToken } from '@/lib/stream-token'
import { getQiniuPrivateUrl } from '@/lib/qiniu'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')
  if (!token) return new Response('Missing token', { status: 400 })

  const verified = verifyStreamToken(token)
  if (!verified) return new Response('Invalid or expired token', { status: 401 })

  let signedUrl: string
  try {
    // 60 秒够服务端取到文件即可，不暴露给客户端
    signedUrl = getQiniuPrivateUrl(verified.fp, 60)
  } catch {
    return new Response('File unavailable', { status: 503 })
  }

  let upstream: globalThis.Response
  try {
    upstream = await fetch(signedUrl)
  } catch {
    return new Response('Failed to fetch from storage', { status: 502 })
  }

  if (!upstream.ok) {
    return new Response('File not found in storage', { status: upstream.status === 404 ? 404 : 502 })
  }

  // 超过 50MB 的文件不适合经由服务器代理预览（Vercel 函数有执行时间上限）
  // 返回 413 让前端提示用户改用下载
  const cl = upstream.headers.get('content-length')
  const MAX_PREVIEW_BYTES = 50 * 1024 * 1024
  if (cl && parseInt(cl, 10) > MAX_PREVIEW_BYTES) {
    return new Response('FILE_TOO_LARGE_FOR_PREVIEW', { status: 413 })
  }

  const headers = new Headers()
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Disposition', 'inline')
  headers.set('Cache-Control', 'private, no-store')
  if (cl) headers.set('Content-Length', cl)

  return new Response(upstream.body, { status: 200, headers })
}
