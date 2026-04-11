/**
 * 服务端专用的 Supabase Admin 客户端
 * 使用 SUPABASE_SERVICE_ROLE_KEY，具有管理员权限，可调用 auth.admin.* 接口
 */
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseServiceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * 获取 Supabase Admin 客户端实例
 * 每次调用返回新实例，确保环境变量已正确加载
 */
export function createSupabaseAdminClient() {
  return getSupabaseAdmin()
}
