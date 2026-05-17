import { createClient } from '@supabase/supabase-js'

// Supabase配置
// V-C-05 FIX: 移除硬编码的 fallback URL 和 ANON_KEY
// 生产环境必须通过环境变量注入；若未配置则抛出错误，确保不意外泄漏服务密钥
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!supabaseUrl) {
  throw new Error(
    "[Supabase] NEXT_PUBLIC_SUPABASE_URL is not set. " +
    "Ensure the environment variable is configured in production."
  )
}

const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!supabaseKey) {
  throw new Error(
    "[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. " +
    "Ensure the environment variable is configured in production."
  )
}

// 警告而非错误：本地 /dev 环境通常不配置 service key，只有部署到 Vercel 等平台时才需要
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseServiceKey) {
  console.warn(
    "[Supabase] SUPABASE_SERVICE_ROLE_KEY is not set. " +
    "Server-side admin operations will be unavailable. " +
    "Ensure this is set in production deployment environment variables."
  )
}

export const supabase = (() => {
  return createClient(supabaseUrl, supabaseKey)
})()

// 服务端专用 admin 客户端（具有管理员权限，可调用 auth.admin.* 接口）
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null
