/**
 * 管理后台书籍 CRUD API
 *
 * GET    /api/admin/books         → 全部书籍列表（含密码，供后台展示）
 * POST   /api/admin/books         → 新增书籍
 * PATCH  /api/admin/books?id=xxx  → 更新书籍
 * DELETE /api/admin/books?id=xxx  → 删除书籍
 *
 * 所有接口均需 admin-session-local cookie（requireAdmin）
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { generateBookPassword, type BookAccessLevel } from '@/lib/books'
import { deleteFromQiniu } from '@/lib/qiniu'

export const dynamic = 'force-dynamic'

// ─── GET：书籍列表（含密码，管理员专用）────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('books')
    .select('id, title, author, description, cover_url, file_path, download_password, access_level, sort_order, published, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin/books GET]', error)
    return NextResponse.json({ error: '获取书籍失败' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

// ─── POST：新增书籍 ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const title = String(body.title ?? '').trim()
  const filePath = String(body.file_path ?? '').trim()

  if (!title) return NextResponse.json({ error: '书名不能为空' }, { status: 400 })
  if (!filePath) return NextResponse.json({ error: 'file_path 不能为空' }, { status: 400 })

  const validLevels: BookAccessLevel[] = ['free', 'monthly', 'yearly']
  const accessLevel: BookAccessLevel = validLevels.includes(body.access_level as BookAccessLevel)
    ? (body.access_level as BookAccessLevel)
    : 'monthly'

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('books')
    .insert({
      title,
      author: body.author ? String(body.author).trim() : null,
      description: body.description ? String(body.description).trim() : null,
      cover_url: body.cover_url ? String(body.cover_url).trim() : null,
      file_path: filePath,
      download_password: generateBookPassword(),
      access_level: accessLevel,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
      published: body.published !== false,
    })
    .select('id, title, author, description, cover_url, file_path, download_password, access_level, sort_order, published, created_at, updated_at')
    .single()

  if (error) {
    console.error('[admin/books POST]', error)
    return NextResponse.json({ error: '新增书籍失败' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// ─── PATCH：更新书籍 ───────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  const id = req.nextUrl.searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: '缺少书籍 id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  // 构造只允许更新的字段（不允许直接改 download_password，走单独接口）
  const allowedFields = ['title', 'author', 'description', 'cover_url', 'file_path', 'access_level', 'sort_order', 'published'] as const
  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '无可更新字段' }, { status: 400 })
  }

  // 校验 access_level
  if (updates.access_level !== undefined) {
    const validLevels: BookAccessLevel[] = ['free', 'monthly', 'yearly']
    if (!validLevels.includes(updates.access_level as BookAccessLevel)) {
      return NextResponse.json({ error: 'access_level 无效' }, { status: 400 })
    }
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('books')
    .update(updates)
    .eq('id', id)
    .select('id, title, author, description, cover_url, file_path, download_password, access_level, sort_order, published, created_at, updated_at')
    .single()

  if (error) {
    console.error('[admin/books PATCH]', error)
    return NextResponse.json({ error: '更新书籍失败' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: '书籍不存在' }, { status: 404 })

  return NextResponse.json(data)
}

// ─── DELETE：删除书籍 ──────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  const id = req.nextUrl.searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: '缺少书籍 id' }, { status: 400 })

  const supabaseAdmin = createSupabaseAdminClient()

  // 先查 file_path，删除书籍记录后再清理七牛存储
  const { data: bookToDelete } = await supabaseAdmin
    .from('books')
    .select('file_path')
    .eq('id', id)
    .single()

  const { error } = await supabaseAdmin
    .from('books')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[admin/books DELETE]', error)
    return NextResponse.json({ error: '删除书籍失败' }, { status: 500 })
  }

  // 异步清理七牛存储，失败不影响接口响应
  if (bookToDelete?.file_path) {
    deleteFromQiniu(bookToDelete.file_path).catch((err) =>
      console.warn('[admin/books DELETE] 七牛文件清理失败:', err)
    )
  }

  return NextResponse.json({ success: true })
}
