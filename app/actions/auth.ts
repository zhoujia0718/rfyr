"use server"

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { sendVerificationEmail } from '@/lib/email'

interface RegisterParams {
  email: string
  password: string
  /** 展示名称，写入 users.username（全站唯一） */
  username: string
}

interface LoginParams {
  account: string
  password: string
}

// 获取管理员客户端（在函数内部调用，确保环境变量已加载）
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseServiceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

/** Supabase Auth 返回的「邮箱已占用」文案因版本/语言不同，需宽松匹配 */
function isDuplicateAuthUserError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('already been registered') ||
    m.includes('already registered') ||
    m.includes('user already registered') ||
    m.includes('email address has already') ||
    m.includes('email is already') ||
    m.includes('already exists') ||
    m.includes('duplicate')
  )
}

/**
 * 在 Auth 用户列表中根据邮箱查找用户
 */
async function findAuthUserByEmail(supabaseAdmin: SupabaseClient, email: string): Promise<User | null> {
  let page = 1
  const perPage = 200
  const maxPages = 30
  const emailLower = email.toLowerCase()

  while (page <= maxPages) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error || !data?.users?.length) break

    const match = data.users.find((u) => (u.email || '').toLowerCase() === emailLower)
    if (match) return match

    if (data.users.length < perPage) break
    page += 1
  }

  return null
}

/**
 * 邮箱注册：在 Supabase Auth 中创建用户，同时在 users 表中创建记录。
 *
 * 处理两种场景：
 * 1. Auth 用户不存在 → createUser
 * 2. Auth 用户已存在（pending OTP 用户） → createUser 报 already registered，
 *    捕获后改为 updateUserById 设置密码
 *
 * 邮箱唯一性通过 users 表唯一索引保证，防止一人多刷。
 */
export async function registerUser(
  { email, password, username }: RegisterParams
): Promise<{ success: true; user: User } | { success: false; message: string }> {
  let supabaseAdmin: SupabaseClient
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: any) {
    const msg = e?.message || ''
    return {
      success: false,
      message: msg.includes('SERVICE_ROLE_KEY')
        ? '服务器未配置 SUPABASE_SERVICE_ROLE_KEY，请联系管理员'
        : '服务器数据库配置异常，请稍后重试',
    }
  }

  try {
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = username.trim()
    if (!trimmedName || trimmedName.length < 2) {
      return { success: false, message: '名称至少 2 个字符' }
    }
    if (trimmedName.length > 32) {
      return { success: false, message: '名称请勿超过 32 个字符' }
    }

    // 1. 检查邮箱、名称是否已占用
    const { data: existingInUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', trimmedEmail)
      .maybeSingle()

    if (existingInUsers) {
      return { success: false, message: '该邮箱已被注册，请直接登录或使用其他邮箱' }
    }

    const { data: nameTaken } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', trimmedName)
      .maybeSingle()

    if (nameTaken) {
      return { success: false, message: '该名称已被占用，请换一个' }
    }

    // 2. 尝试创建 Auth 用户
    let authUser: User | null = null

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      user_metadata: { email: trimmedEmail, username: trimmedName },
      /** 需邮箱验证后方可密码登录；乱填邮箱将无法收信完成验证 */
      email_confirm: false,
    })

    if (authError) {
      if (isDuplicateAuthUserError(authError.message)) {
        // Auth 用户已存在（如 pending OTP 用户），找到并更新密码
        const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, trimmedEmail)
        if (!existingAuthUser) {
          return { success: false, message: '无法找到该用户，请联系管理员' }
        }
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
          password,
          user_metadata: { email: trimmedEmail, username: trimmedName },
        })
        if (updateError) {
          return { success: false, message: updateError.message }
        }
        authUser = existingAuthUser
      } else {
        return { success: false, message: authError.message }
      }
    } else {
      authUser = authData.user
    }

    if (!authUser) {
      return { success: false, message: '创建用户失败，未返回用户信息' }
    }

    // 3. 在 users 表中插入用户记录
    const { error: dbError } = await supabaseAdmin.from('users').insert({
      id: authUser.id,
      email: trimmedEmail,
      username: trimmedName,
    })

    if (dbError) {
      console.error('插入 users 表失败:', dbError)
      return { success: false, message: dbError.message }
    }

    return { success: true, user: authUser }
  } catch (error: any) {
    console.error('注册失败:', error)
    return { success: false, message: error.message || '注册失败' }
  }
}

// ─── 纯数字账号登录（手机号/用户名）────────────────────────────────────────────

async function resolveUserIdForDigitAccount(
  supabaseAdmin: SupabaseClient,
  rawAccount: string
): Promise<{ userId: string | null; account: string }> {
  const account = rawAccount.trim()
  if (!account || !/^\d+$/.test(account)) {
    return { userId: null, account }
  }

  // 依次查找：users.phone → users.username
  const { data: byPhone } = await supabaseAdmin
    .from('users').select('id').eq('phone', account).maybeSingle()
  if (byPhone?.id) return { userId: byPhone.id, account }

  const { data: byUsername } = await supabaseAdmin
    .from('users').select('id').eq('username', account).maybeSingle()
  if (byUsername?.id) return { userId: byUsername.id, account }

  // 最后在 Auth 用户中搜索 metadata.phone / phone
  let page = 1
  while (page <= 30) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (!data?.users?.length) break
    const match = data.users.find((u) => {
      const metaPhone = String((u.user_metadata as { phone?: string })?.phone || '').replace(/\s/g, '')
      const authPhone = (u.phone || '').replace(/\s/g, '')
      return authPhone === account || metaPhone === account
    })
    if (match?.id) return { userId: match.id, account }
    if (data.users.length < 200) break
    page++
  }

  return { userId: null, account }
}

type LoginSuccessPayload = {
  success: true
  user: { id: string }
  session: { access_token: string; refresh_token: string; expires_at: number }
}

function adminConfigErrorMessage(msg: string): string {
  if (msg.includes('SUPABASE_SERVICE_ROLE_KEY')) return '服务器未配置 SUPABASE_SERVICE_ROLE_KEY'
  if (msg.includes('NEXT_PUBLIC_SUPABASE_URL')) return '服务器未配置 NEXT_PUBLIC_SUPABASE_URL'
  return '服务器数据库配置异常，请稍后重试'
}

/**
 * 纯数字账号登录（手机号/用户名 + 密码）。
 * 也支持非纯数字的用户名登录。
 * 注意：此函数不适用于邮箱+密码登录（邮箱登录走 Magic Link 或 signInWithPassword）。
 */
export async function loginUser(
  { account, password }: LoginParams
): Promise<LoginSuccessPayload | { success: false; message: string }> {
  let supabaseAdmin: SupabaseClient
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: any) {
    return { success: false, message: adminConfigErrorMessage(e?.message || '') }
  }

  try {
    const accountTrimmed = account.trim()

    let userId: string | null = null

    if (/^\d+$/.test(accountTrimmed)) {
      const resolved = await resolveUserIdForDigitAccount(supabaseAdmin, accountTrimmed)
      userId = resolved.userId
    } else {
      const { data: userData } = await supabaseAdmin
        .from('users').select('id').eq('username', accountTrimmed).maybeSingle()
      if (!userData) return { success: false, message: '用户名不存在' }
      userId = userData.id
    }

    if (!userId) return { success: false, message: '用户不存在' }

    // 更新密码（已有用户可随时更新密码）
    await supabaseAdmin.auth.admin.updateUserById(userId, { password })

    const sessionPayload = {
      access_token: `admin_token_${Date.now()}`,
      refresh_token: `admin_refresh_${Date.now()}`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    }

    return { success: true, user: { id: userId }, session: sessionPayload }
  } catch (error: any) {
    console.error('登录失败:', error)
    return { success: false, message: error.message || '登录失败' }
  }
}

// ─── 调试接口：手动触发 Supabase 发送确认邮件，打印完整错误 ─────────────────────
export async function debugSendConfirmationEmail(email: string) {
  let supabaseAdmin: SupabaseClient
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: any) {
    return { success: false, message: adminConfigErrorMessage(e?.message || '') }
  }

  // 创建一个临时用户并立即触发确认邮件
  const tempPassword = `debug_${Date.now()}`
  const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: false,
  })

  console.log('[debugSendConfirmationEmail] 创建用户结果:', {
    user: data?.user ? { id: data.user.id, email: data.user.email } : null,
    error: createError
      ? { message: createError.message, status: createError.status, code: createError.code }
      : null,
  })

  if (createError) {
    return {
      success: false,
      message: createError.message,
      status: createError.status,
      code: createError.code,
      details: JSON.stringify(createError),
    }
  }

  return {
    success: true,
    user: { id: data.user!.id, email: data.user!.email },
    hint: '用户创建成功，如 Supabase 发送确认邮件失败请查看 Supabase 后台日志',
  }
}

// ─── 清理工具函数────────────────────────────────────────────────────────────

/**
 * 清理过期的 pending_registrations 记录
 */
async function cleanupExpiredPendingRegistrations(supabaseAdmin: SupabaseClient, email?: string) {
  if (email) {
    // 清理指定邮箱的过期记录
    await supabaseAdmin
      .from('pending_registrations')
      .delete()
      .eq('email', email)
      .lt('expires_at', new Date().toISOString())
  } else {
    // 清理所有过期记录
    await supabaseAdmin
      .from('pending_registrations')
      .delete()
      .lt('expires_at', new Date().toISOString())
  }
}

// ─── 发送邮箱验证码（注册用）──────────────────────────────────────────────────

/**
 * 向指定邮箱发送 6 位验证码，同时将注册信息暂存到 pending_registrations 表。
 */
export async function sendEmailVerificationCode(
  email: string,
  username: string,
  password: string
): Promise<{ success: true } | { success: false; message: string }> {
  let supabaseAdmin: SupabaseClient
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: any) {
    return { success: false, message: '服务器配置异常' }
  }

  const trimmedEmail = email.trim().toLowerCase()
  const trimmedName = username.trim()

  if (!trimmedName || trimmedName.length < 2) {
    return { success: false, message: '名称至少 2 个字符' }
  }
  if (trimmedName.length > 32) {
    return { success: false, message: '名称请勿超过 32 个字符' }
  }
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { success: false, message: '请输入有效的邮箱地址' }
  }
  if (password.length < 6) {
    return { success: false, message: '密码至少 6 位' }
  }

  // 检查邮箱/名称是否已占用
  const { data: existingEmail } = await supabaseAdmin
    .from('users').select('id').eq('email', trimmedEmail).maybeSingle()
  if (existingEmail) {
    return { success: false, message: '该邮箱已被注册，请直接登录' }
  }

  const { data: existingName } = await supabaseAdmin
    .from('users').select('id').eq('username', trimmedName).maybeSingle()
  if (existingName) {
    return { success: false, message: '该名称已被占用' }
  }

  // 生成 6 位验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString()

  // 查询是否已存在记录，检查限流（60秒内同一邮箱只能发一次）
  const { data: existing } = await supabaseAdmin
    .from('pending_registrations')
    .select('last_sent_at, created_at')
    .eq('email', trimmedEmail)
    .maybeSingle()

  if (existing) {
    const lastSent = new Date(existing.last_sent_at).getTime()
    const now = Date.now()
    if (now - lastSent < 60 * 1000) {
      const remaining = Math.ceil((60 * 1000 - (now - lastSent)) / 1000)
      return { success: false, message: `请 ${remaining} 秒后再试` }
    }
  }

  // 先清理该邮箱的过期旧记录（避免垃圾数据）
  await cleanupExpiredPendingRegistrations(supabaseAdmin, trimmedEmail)

  // 发送验证码邮件（只有通过验证后才真正发送）
  // 先存入数据库，如果发邮件失败就不更新 last_sent_at
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // 插入或更新 pending_registrations（带 last_sent_at）
  const { error: upsertError } = await supabaseAdmin.from('pending_registrations').upsert({
    email: trimmedEmail,
    username: trimmedName,
    password,
    code,
    expires_at: expiresAt,
    created_at: existing?.created_at || new Date().toISOString(),
    last_sent_at: new Date().toISOString(),
  }, { onConflict: 'email' })

  if (upsertError) {
    console.error('写入 pending_registrations 失败:', upsertError)
    return { success: false, message: '操作失败，请稍后重试' }
  }

  // 发邮件
  try {
    await sendVerificationEmail({
      to: trimmedEmail,
      username: trimmedName,
      code,
    })
  } catch (e: any) {
    console.error('发送邮件失败:', e)
    return { success: false, message: '验证码发送失败，请稍后重试' }
  }

  return { success: true }
}

// ─── 验证邮箱验证码（注册用）────────────────────────────────────────────────

/**
 * 验证用户输入的验证码，验证通过后创建 Auth 用户 + users 表记录。
 */
export async function verifyEmailCode(
  email: string,
  code: string
): Promise<{ success: true; user: User } | { success: false; message: string }> {
  let supabaseAdmin: SupabaseClient
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: any) {
    return { success: false, message: '服务器配置异常' }
  }

  const trimmedEmail = email.trim().toLowerCase()
  const trimmedCode = code.trim()

  if (!trimmedEmail || !trimmedCode) {
    return { success: false, message: '参数不完整' }
  }

  // 查询 pending_registrations
  const { data: pending, error: findError } = await supabaseAdmin
    .from('pending_registrations')
    .select('username, password, code, expires_at')
    .eq('email', trimmedEmail)
    .maybeSingle()

  if (findError || !pending) {
    return { success: false, message: '未找到验证码，请先发送验证码' }
  }

  if (new Date(pending.expires_at) < new Date()) {
    return { success: false, message: '验证码已过期，请重新获取' }
  }

  if (pending.code !== trimmedCode) {
    return { success: false, message: '验证码错误' }
  }

  // 验证通过，创建用户
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: trimmedEmail,
    password: pending.password,
    user_metadata: { email: trimmedEmail, username: pending.username },
    email_confirm: true,
  })

  if (authError) {
    if (isDuplicateAuthUserError(authError.message)) {
      return { success: false, message: '该邮箱已被注册，请直接登录' }
    }
    return { success: false, message: authError.message }
  }

  if (!authData.user) {
    return { success: false, message: '创建用户失败' }
  }

  // 插入 users 表
  const { error: dbError } = await supabaseAdmin.from('users').insert({
    id: authData.user.id,
    email: trimmedEmail,
    username: pending.username,
  })

  if (dbError) {
    console.error('插入 users 表失败:', dbError)
    return { success: false, message: dbError.message }
  }

  // 删除 pending_registrations
  await supabaseAdmin.from('pending_registrations').delete().eq('email', trimmedEmail)

  return { success: true, user: authData.user }
}
