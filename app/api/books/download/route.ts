/**
 * POST /api/books/download
 *
 * 下载书籍 PDF（文件已在上传时预加水印，此处仅做权限校验后流式传输）
 *
 * 权限逻辑：
 *   yearly / permanent → 免密下载所有书
 *   monthly            → 免密下载 monthly / free 级别书
 *   其他               → 需提供正确的下载密码
 *
 * 安全要点：
 *   - download_password 仅通过 supabaseAdmin（service_role）读取，永不传给前端
 *   - file_path 同上，防止前端绕过 API 直接拉取存储
 *   - 水印在上传时预加，本接口只负责鉴权和流式代理
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { getUserIdFromBearer } from '@/lib/server-auth-user'
import { getMembershipInfo } from '@/lib/membership-utils'
import { canDownloadFree, verifyBookPassword, type BookAccessLevel } from '@/lib/books'
import { MEMBER_TIERS, type MemberTier } from '@/lib/member-tiers'
import { getQiniuPrivateUrl } from '@/lib/qiniu'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // ── 1. 解析请求体 ─────────────────────────────────────────────────────────
  let bookId: string
  let password: string | undefined
  try {
    const body = await req.json()
    bookId = String(body?.bookId ?? '').trim()
    password = body?.password != null ? String(body.password).trim() : undefined
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  if (!bookId) {
    return NextResponse.json({ error: '缺少 bookId' }, { status: 400 })
  }

  // ── 2. 查询用户会员等级（可为 null，即未登录）────────────────────────────
  const userId = await getUserIdFromBearer(req)
  let userTier: MemberTier = MEMBER_TIERS.NONE
  if (userId) {
    try {
      const memberInfo = await getMembershipInfo(userId)
      userTier = memberInfo.tier
    } catch {
      // 查询失败降级为 none，不阻断下载流程（密码仍可用）
    }
  }

  // ── 3. 查询书籍（service_role 才能读 download_password / file_path）────────
  const supabaseAdmin = createSupabaseAdminClient()
  const { data: book, error: bookError } = await supabaseAdmin
    .from('books')
    .select('id, title, file_path, download_password, access_level, published')
    .eq('id', bookId)
    .single()

  if (bookError || !book) {
    return NextResponse.json({ error: '书籍不存在' }, { status: 404 })
  }
  if (!book.published) {
    return NextResponse.json({ error: '书籍不存在' }, { status: 404 })
  }

  const accessLevel = (book.access_level ?? 'monthly') as BookAccessLevel

  // ── 4. 权限判断 ───────────────────────────────────────────────────────────
  const freeAccess = canDownloadFree(userTier, accessLevel)
  if (!freeAccess) {
    if (!password) {
      return NextResponse.json({ error: '请输入下载密码', code: 'PASSWORD_REQUIRED' }, { status: 401 })
    }
    if (!verifyBookPassword(password, book.download_password)) {
      return NextResponse.json({ error: '密码错误', code: 'WRONG_PASSWORD' }, { status: 401 })
    }
  }

  // ── 5. 生成带签名的七牛直链，返回给浏览器直接下载（避免服务端中转大文件）──
  let signedUrl: string
  try {
    // 5 分钟有效期：够用户点击后立即开始下载
    signedUrl = getQiniuPrivateUrl(book.file_path, 300)
    // attname 让七牛在响应头写入 Content-Disposition: attachment; filename=...
    const safeTitle = book.title.replace(/[^\w一-龥\-_]/g, '_')
    signedUrl += `&attname=${encodeURIComponent(safeTitle + '.pdf')}`
  } catch (err) {
    console.error('[books/download] 生成下载链接失败:', err)
    return NextResponse.json({ error: '文件暂时不可用，请稍后重试' }, { status: 503 })
  }

  const safeFilename = book.title.replace(/[^\w一-龥\-_]/g, '_') + '.pdf'
  return NextResponse.json({ url: signedUrl, filename: safeFilename })
}
