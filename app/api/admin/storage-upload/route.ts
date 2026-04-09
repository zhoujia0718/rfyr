import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

const ALLOWED_BUCKETS = new Set(['article-pdfs', 'article-images'])

function isSafeObjectPath(path: string): boolean {
  if (!path || path.length > 1024 || path.includes('..') || path.startsWith('/')) return false
  return /^[a-zA-Z0-9._\-/]+$/.test(path)
}

/**
 * 管理后台经本站上传 Storage，避免浏览器直连 Supabase 时出现 CORS / Failed to fetch。
 * 使用 Service Role，需在服务端配置 SUPABASE_SERVICE_ROLE_KEY。
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: '服务器未配置 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: '无法解析上传表单' }, { status: 400 })
  }

  const bucket = String(form.get('bucket') ?? '')
  const path = String(form.get('path') ?? '')
  const contentType = String(form.get('contentType') ?? 'application/octet-stream')
  const cacheControl = String(form.get('cacheControl') ?? '3600')
  const file = form.get('file')

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: '不允许的存储桶' }, { status: 400 })
  }
  if (!isSafeObjectPath(path)) {
    return NextResponse.json({ error: '无效的 object 路径' }, { status: 400 })
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: '缺少文件字段 file' }, { status: 400 })
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const buf = Buffer.from(await file.arrayBuffer())

  const { data, error } = await admin.storage.from(bucket).upload(path, buf, {
    upsert: true,
    cacheControl,
    contentType: contentType || 'application/octet-stream',
  })

  if (error) {
    console.error('[storage-upload]', bucket, path, error)
    return NextResponse.json({ error: error.message || 'Storage 上传失败' }, { status: 502 })
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({
    path: data?.path ?? path,
    publicUrl: pub.publicUrl,
  })
}
