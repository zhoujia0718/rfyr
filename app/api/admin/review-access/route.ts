import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

const DURATIONS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
}

// GET: 列出所有有效权限记录（含用户信息）
export async function GET(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  const supabaseAdmin = createSupabaseAdminClient()

  const { data, error } = await supabaseAdmin
    .from('review_access')
    .select('id, user_id, permission_type, expires_at, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 批量取用户信息
  const userIds = (data ?? []).map((r) => r.user_id)
  const { data: users } = userIds.length
    ? await supabaseAdmin.from('users').select('id, username, email').in('id', userIds)
    : { data: [] }

  const userMap: Record<string, { username?: string; email?: string }> = {}
  for (const u of users ?? []) userMap[u.id] = u

  const rows = (data ?? []).map((r) => ({
    ...r,
    username: userMap[r.user_id]?.username ?? '—',
    email: userMap[r.user_id]?.email ?? '—',
    expired: new Date(r.expires_at) < new Date(),
  }))

  return NextResponse.json(rows)
}

// POST: 开通或续期权限 { userId, permissionType }
export async function POST(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  const { userId, permissionType } = await req.json().catch(() => ({}))
  if (!userId || !DURATIONS[permissionType]) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 })
  }

  const days = DURATIONS[permissionType]
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString()

  const supabaseAdmin = createSupabaseAdminClient()

  // upsert：已有记录则更新，否则新增
  const { error } = await supabaseAdmin
    .from('review_access')
    .upsert(
      { user_id: userId, permission_type: permissionType, expires_at: expiresAt },
      { onConflict: 'user_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, expiresAt })
}

// DELETE: 撤销权限 ?userId=...
export async function DELETE(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 })

  const supabaseAdmin = createSupabaseAdminClient()
  const { error } = await supabaseAdmin
    .from('review_access')
    .delete()
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// GET /api/admin/review-access/search?q=xxx  搜索用户
export { searchUsers as GET_search }

async function searchUsers(q: string) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, username, email')
    .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10)
  return data ?? []
}
