import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromBearer } from '@/lib/server-auth-user'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

// GET: 检查当前用户是否有每日复盘/严选逻辑权限
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromBearer(req)
  if (!userId) {
    return NextResponse.json({ hasAccess: false })
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data } = await supabaseAdmin
    .from('review_access')
    .select('permission_type, expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ hasAccess: false })
  }

  return NextResponse.json({
    hasAccess: true,
    permissionType: data.permission_type,
    expiresAt: data.expires_at,
  })
}
