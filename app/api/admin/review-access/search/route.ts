import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

// GET /api/admin/review-access/search?q=关键词
export async function GET(req: NextRequest) {
  const authError = requireAdmin(req)
  if (authError) return authError

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json([])

  const supabaseAdmin = createSupabaseAdminClient()
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, username, email')
    .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10)

  return NextResponse.json(data ?? [])
}
