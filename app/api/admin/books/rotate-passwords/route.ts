/**
 * POST /api/admin/books/rotate-passwords
 *
 * 一键更换所有书籍的下载密码
 * 返回更新后的密码列表（含书名 + 新密码）供后台展示
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { generateBookPassword } from '@/lib/books'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  const supabaseAdmin = createSupabaseAdminClient()

  // 1. 查出全部书籍 id
  const { data: books, error: listError } = await supabaseAdmin
    .from('books')
    .select('id, title')

  if (listError) {
    console.error('[rotate-passwords] list error:', listError)
    return NextResponse.json({ error: '获取书籍列表失败' }, { status: 500 })
  }

  if (!books || books.length === 0) {
    return NextResponse.json({ updated: [] })
  }

  // 2. 为每本书生成新密码并批量更新
  const updates = books.map((b) => ({
    id: b.id as string,
    newPassword: generateBookPassword(),
  }))

  const errors: string[] = []
  for (const { id, newPassword } of updates) {
    const { error } = await supabaseAdmin
      .from('books')
      .update({ download_password: newPassword })
      .eq('id', id)
    if (error) {
      errors.push(id)
      console.error('[rotate-passwords] update error for', id, error)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: `${errors.length} 本书更新失败，请重试`, errors },
      { status: 500 }
    )
  }

  // 3. 返回新密码列表（title + newPassword）
  const result = updates.map(({ id, newPassword }) => {
    const book = books.find((b) => b.id === id)
    return { id, title: book?.title ?? '', password: newPassword }
  })

  return NextResponse.json({ updated: result })
}
