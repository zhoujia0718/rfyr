/**
 * POST /api/books/preview
 *
 * 在线预览书籍 PDF，权限逻辑与 /api/books/download 完全一致。
 * 唯一区别：不附加 attname 参数，七牛返回 inline 而非 attachment，
 * 浏览器直接渲染 PDF 而不强制下载。有效期 30 分钟（供阅读使用）。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { getUserIdFromBearer } from '@/lib/server-auth-user'
import { getMembershipInfo } from '@/lib/membership-utils'
import { canDownloadFree, verifyBookPassword, type BookAccessLevel } from '@/lib/books'
import { MEMBER_TIERS, type MemberTier } from '@/lib/member-tiers'
import { getQiniuPrivateUrl } from '@/lib/qiniu'
import { createStreamToken } from '@/lib/stream-token'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let bookId: string
  let password: string | undefined
  try {
    const body = await req.json()
    bookId = String(body?.bookId ?? '').trim()
    password = body?.password != null ? String(body.password).trim() : undefined
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  if (!bookId) return NextResponse.json({ error: '缺少 bookId' }, { status: 400 })

  const userId = await getUserIdFromBearer(req)
  let userTier: MemberTier = MEMBER_TIERS.NONE
  if (userId) {
    try {
      const memberInfo = await getMembershipInfo(userId)
      userTier = memberInfo.tier
    } catch { /* 降级 */ }
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data: book, error: bookError } = await supabaseAdmin
    .from('books')
    .select('id, title, file_path, download_password, access_level, published')
    .eq('id', bookId)
    .single()

  if (bookError || !book || !book.published) {
    return NextResponse.json({ error: '书籍不存在' }, { status: 404 })
  }

  const accessLevel = (book.access_level ?? 'monthly') as BookAccessLevel
  const freeAccess = canDownloadFree(userTier, accessLevel)

  if (!freeAccess) {
    if (!password) {
      return NextResponse.json({ error: '请输入密码', code: 'PASSWORD_REQUIRED' }, { status: 401 })
    }
    if (!verifyBookPassword(password, book.download_password)) {
      return NextResponse.json({ error: '密码错误', code: 'WRONG_PASSWORD' }, { status: 401 })
    }
  }

  // 校验七牛配置，同时 HEAD 探测文件大小
  // 超过 50MB 不走 stream 代理（Vercel 函数有执行时间上限），提示用户改用下载
  const MAX_PREVIEW_BYTES = 50 * 1024 * 1024
  let checkUrl: string
  try {
    checkUrl = getQiniuPrivateUrl(book.file_path, 30)
  } catch (err) {
    console.error('[books/preview] 七牛配置校验失败:', err)
    return NextResponse.json({ error: '文件暂时不可用，请稍后重试' }, { status: 503 })
  }

  try {
    const head = await fetch(checkUrl, { method: 'HEAD', signal: AbortSignal.timeout(8_000) })
    const cl = head.headers.get('content-length')
    if (cl && parseInt(cl, 10) > MAX_PREVIEW_BYTES) {
      const sizeMB = Math.round(parseInt(cl, 10) / 1024 / 1024)
      return NextResponse.json(
        { error: `文件较大（${sizeMB} MB），请使用「下载」功能保存到本地后阅读`, code: 'FILE_TOO_LARGE' },
        { status: 413 }
      )
    }
  } catch {
    // HEAD 失败不阻断，继续走 stream（stream 内部还有二次检查）
  }

  const streamToken = createStreamToken(book.file_path, 1800)
  const streamUrl = `/api/books/stream?t=${encodeURIComponent(streamToken)}`

  return NextResponse.json({ url: streamUrl, title: book.title })
}
