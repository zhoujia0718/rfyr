import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-admin-auth'
import { addWatermark } from '@/lib/pdf-watermark'
import { uploadToQiniu } from '@/lib/qiniu'

export const runtime = 'nodejs'
export const maxDuration = 180

const ALLOWED_BUCKETS = new Set(['article-pdfs', 'article-images', 'book-pdfs'])
const MAX_FILE_SIZE_DEFAULT = 50 * 1024 * 1024    // 50MB（文章）
const MAX_FILE_SIZE_BOOKS   = 2 * 1024 * 1024 * 1024   // 2GB（书籍 PDF）

function isSafeObjectPath(objectPath: string): boolean {
  if (!objectPath || objectPath.length > 1024 || objectPath.includes('..') || objectPath.startsWith('/')) return false
  return /^[a-zA-Z0-9._\-/]+$/.test(objectPath)
}

/**
 * 管理后台文件上传：
 *   - 书籍 PDF（book-pdfs）→ 加水印后上传至七牛云私有桶
 *   - 其他文件 → 上传至 Supabase Storage
 */
export async function POST(req: NextRequest) {
  // ── 管理员认证 ───────────────────────────────────────────────────────
  const authError = requireAdmin(req)
  if (authError) return authError

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: '无法解析上传表单' }, { status: 400 })
  }

  const bucket      = String(form.get('bucket') ?? '')
  const objectPath  = String(form.get('path') ?? '')
  const contentType = String(form.get('contentType') ?? 'application/octet-stream')
  const cacheControl = String(form.get('cacheControl') ?? '3600')
  const file = form.get('file')

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: '不允许的存储桶' }, { status: 400 })
  }
  if (!isSafeObjectPath(objectPath)) {
    return NextResponse.json({ error: '无效的 object 路径' }, { status: 400 })
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: '缺少文件字段 file' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const maxSize = bucket === 'book-pdfs' ? MAX_FILE_SIZE_BOOKS : MAX_FILE_SIZE_DEFAULT
  if (buf.length > maxSize) {
    return NextResponse.json({ error: `文件大小不能超过 ${maxSize / 1024 / 1024}MB` }, { status: 413 })
  }

  // 文件类型安全校验：禁止可执行文件
  const dangerousTypes = [
    'application/x-msdownload', 'application/x-executable',
    'application/x-sh', 'application/x-shellscript',
    'text/x-shellscript', 'application/javascript', 'text/javascript',
  ]
  if (dangerousTypes.includes(contentType.toLowerCase())) {
    return NextResponse.json({ error: '不支持的文件类型' }, { status: 400 })
  }

  // ── 书籍 PDF → 加水印 + 上传至七牛云 ─────────────────────────────────
  if (bucket === 'book-pdfs') {
    let watermarked: Uint8Array
    try {
      watermarked = await addWatermark(buf)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[storage-upload] 水印处理失败:', err)
      return NextResponse.json({ error: `PDF 水印处理失败: ${msg}` }, { status: 422 })
    }

    try {
      await uploadToQiniu(objectPath, Buffer.from(watermarked))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[storage-upload] 七牛上传失败:', err)
      return NextResponse.json({ error: `上传至存储失败: ${msg}` }, { status: 502 })
    }

    return NextResponse.json({ path: objectPath, publicUrl: '' })
  }

  // ── 其他文件 → 上传至 Supabase Storage ───────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: '服务器未配置 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.storage.from(bucket).upload(objectPath, buf, {
    upsert: true,
    cacheControl,
    contentType: contentType || 'application/octet-stream',
  })

  if (error) {
    console.error('[storage-upload]', bucket, objectPath, error)
    return NextResponse.json({ error: error.message || 'Storage 上传失败' }, { status: 502 })
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(objectPath)
  return NextResponse.json({
    path: data?.path ?? objectPath,
    publicUrl: pub.publicUrl,
  })
}
