import { createClient } from "@supabase/supabase-js"
import { NextRequest } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * 从请求头 Authorization: Bearer <access_token> 解析 Supabase 用户 ID。
 * 用于 Route Handler（服务端无法读 localStorage / custom_auth）。
 */
export async function getUserIdFromBearer(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null

  const token = authHeader.slice(7).trim()
  if (!token) return null

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user?.id) return null
  return user.id
}
