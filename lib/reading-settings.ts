/**
 * 阅读设置工具函数
 * 提供服务端和客户端获取阅读限制配置的方法
 *
 * 缓存策略（v2 - 修复多实例不同步问题）：
 *   - 移除模块级内存变量（多实例不共享，会导致数据不一致）
 *   - API 层使用 Next.js revalidatePath() 清除 Data Cache
 *   - 所有实例访问同一个 Supabase，数据天然一致
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

let _supabaseInstance: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!_supabaseInstance) {
    _supabaseInstance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _supabaseInstance
}

export interface ReadingSettings {
  guest_read_limit: number
  monthly_daily_limit: number
  referral_bonus_count: number
  /** 管理员开关：年卡用户是否显示已读进度（false = 年卡不显示，true = 年卡也显示）。月卡/普通用户始终显示，不受此开关控制 */
  show_read_progress: boolean
  /** 客户端缓存时间戳 */
  _cachedAt?: number
}

// 默认配置值（数据库无配置时使用）
export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  guest_read_limit: 3,
  monthly_daily_limit: 8,
  referral_bonus_count: 2,
  show_read_progress: false,
}

// 服务端进程内缓存（每个 Node.js 进程共享）：1 分钟 TTL
// 大幅减少 reading_settings 表的 DB 查询数（每篇文章读取都会触发此函数）
let _serverCache: ReadingSettings | null = null
let _serverCachedAt = 0
const SERVER_CACHE_TTL = 60 * 1000 // 1 分钟

/** 主动清除服务端内存缓存（PUT 更新配置后调用） */
export function clearServerSettingsCache(): void {
  _serverCache = null
  _serverCachedAt = 0
}

/**
 * 获取阅读设置（服务端使用）
 * 进程内 1 分钟缓存，大幅减少重复 DB 查询（文章读取路径热点）。
 * 配置更新后调用 clearServerSettingsCache() 主动失效。
 */
export async function getReadingSettings(): Promise<ReadingSettings> {
  if (_serverCache && Date.now() - _serverCachedAt < SERVER_CACHE_TTL) {
    return _serverCache
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("reading_settings")
    .select("*")
    .eq("id", "global")
    .single()

  if (error || !data) {
    return DEFAULT_READING_SETTINGS
  }

  _serverCache = {
    guest_read_limit: data.guest_read_limit,
    monthly_daily_limit: data.monthly_daily_limit,
    referral_bonus_count: data.referral_bonus_count,
    show_read_progress: data.show_read_progress ?? false,
  }
  _serverCachedAt = Date.now()
  return _serverCache
}

