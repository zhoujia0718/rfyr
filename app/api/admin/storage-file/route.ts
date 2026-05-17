import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-admin-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const ALLOWED_BUCKETS = new Set(['article-pdfs', 'article-images', 'book-pdfs'])

function isSafeObjectPath(path: string): boolean {
  if (!path || path.length > 1024 || path.includes('..') || path.startsWith('/')) return false
  return /^[a-zA-Z0-9._\-/]+$/.test(path)
}

/** 服务端拉取 Storage 对象（供管理后台在浏览器无法直连 Supabase 时使用） */
export async function GET(req: NextRequest) {
  // ── 管理员认证 ───────────────────────────────────────────────────────
  const authError = requireAdmin(req)
  if (authError) return authError

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceKey) {
    return NextResponse.json({ error: '服务器未配置 Supabase' }, { status: 500 })
  }

  const bucket = req.nextUrl.searchParams.get('bucket') ?? ''
  const path = req.nextUrl.searchParams.get('path') ?? ''
  if (!ALLOWED_BUCKETS.has(bucket) || !isSafeObjectPath(path)) {
    return NextResponse.json({ error: '参数无效' }, { status: 400 })
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.storage.from(bucket).download(path)
  if (error || !data) {
    console.error('[storage-file GET]', bucket, path, error)
    return NextResponse.json({ error: error?.message || '下载失败' }, { status: 404 })
  }

  const ab = await data.arrayBuffer()
  const lower = path.toLowerCase()
  const ct =
    lower.endsWith('.html') || lower.endsWith('.htm')
      ? 'text/html; charset=utf-8'
      : 'application/octet-stream'
  return new NextResponse(ab, { status: 200, headers: { 'Content-Type': ct } })
}