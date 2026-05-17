/**
 * GET /api/books
 *
 * 公开书籍列表（不含 download_password / file_path）
 * 已发布书籍按 sort_order ASC, created_at DESC 排序
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, description, cover_url, access_level, sort_order, created_at, updated_at')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[api/books GET]', error)
    return NextResponse.json({ error: '获取书籍列表失败' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
