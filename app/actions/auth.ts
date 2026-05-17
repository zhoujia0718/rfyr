"use server"

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { randomInt, createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { sendVerificationEmail } from '@/lib/email'
import { createReferral } from '@/lib/referral'
import { generateFakeToken } from '@/lib/server-auth-user'

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

// ─── 密码加密（AES-256-GCM）用于 pending_registrations 安全存储 ───────────────

function derivePasswordKey(): Buffer {
  const secret = process.env.HMAC_SECRET
  if (!secret) throw new Error('HMAC_SECRET 未配置，无法加密密码')
  return createHash('sha256').update(secret, 'utf-8').digest()
}

function encryptPassword(password: string): string {
  const key = derivePasswordKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(password, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`
}

function decryptPassword(stored: string): string {
  if (!stored.startsWith('enc:')) {
    // 兼容旧的明文记录（过渡期，新注册均加密存储）
    return stored
  }
  const key = derivePasswordKey()
  const parts = stored.split(':')
  if (parts.length !== 4) throw new Error('密码加密格式无效')
  const [, ivHex, ciphertextHex, tagHex] = parts
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf-8')
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
 * P19 修复：优先使用直接查找（如 SDK 支持），否则减少分页最大页数（30→5）
 */
async function findAuthUserByEmail(supabaseAdmin: SupabaseClient, email: string): Promise<User | null> {
  const emailLower = email.toLowerCase()

  // 尝试直接按邮箱查找（部分 Supabase SDK 版本支持）
  try {
    const adminApi = supabaseAdmin.auth.admin as any
    if (typeof adminApi.getUserByEmail === 'function') {
      const { data, error } = await adminApi.getUserByEmail(emailLower)
      if (!error && data?.user) return data.user
    }
  } catch { /* SDK 版本不支持，降级到分页 */ }

  // 分页查找，最多 5 页（1000 用户）避免过度扫描
  let page = 1
  const perPage = 200
  const maxPages = 5

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

    // 初始化 user_profiles（阅读配额归零）
    const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
      id: authUser.id,
      notes_read_count: 0,
      notes_read_ids: [],
      daily_read_count: 0,
    })
    if (profileError) {
      console.error('插入 user_profiles 失败（非致命）:', profileError)
    }

    // P14 修复：在 registerUser 路径也创建邀请码（verifyEmailCode 路径已有）
    const newUserCode = authUser.id.replace(/-/g, '').slice(0, 8).toLowerCase()
    try {
      await supabaseAdmin.from('referrer_codes').insert({
        user_id: authUser.id,
        code: newUserCode,
      })
    } catch (e) {
      console.warn('[Auth] 创建邀请码失败（可能表未创建）:', e)
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

    // 查询用户邮箱（用于 signInWithPassword 验证密码，不修改任何数据）
    const { data: userRecord } = await supabaseAdmin
      .from('users').select('email').eq('id', userId).maybeSingle()

    const userEmail = userRecord?.email
    if (!userEmail) {
      return { success: false, message: '该账号未绑定邮箱，无法登录' }
    }

    // 通过 signInWithPassword 验证密码是否正确（不修改任何数据）
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: userEmail,
      password,
    })

    if (signInError) {
      return { success: false, message: '密码错误' }
    }

    // 生成可验证的 fakeToken（HMAC 签名）
    const fakeToken = generateFakeToken(userId)
    if (!fakeToken) {
      return { success: false, message: '服务器配置异常（HMAC_SECRET 未配置）' }
    }

    return {
      success: true,
      user: { id: userId },
      session: {
        access_token: fakeToken,
        refresh_token: '',
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      },
    }
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

  if (createError) {
    return {
      success: false,
      message: createError.message,
      status: createError.status,
      code: createError.code,
    }
  }

  // 清理临时用户，避免在 Auth 用户列表中留下垃圾数据
  try {
    await supabaseAdmin.auth.admin.deleteUser(data.user!.id)
  } catch (deleteErr) {
    console.warn('[debugSendConfirmationEmail] 清理临时用户失败（可忽略）:', deleteErr)
  }

  return {
    success: true,
    hint: '用户创建成功并已清理，如需发送确认邮件请在 Supabase 后台操作',
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
  password: string,
  referrerCode?: string,
  referrerArticle?: string
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
    return { success: false, message: '请核对你的邮箱是否正确' }
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
  const code = randomInt(100000, 999999).toString()

  // 查询是否已存在记录，检查限流（60秒内同一邮箱只能发一次）
  const { data: existing } = await supabaseAdmin
    .from('pending_registrations')
    .select('last_sent_at, created_at, code_version')
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

  // 加密密码后再存储（AES-256-GCM）
  let encryptedPassword: string
  try {
    encryptedPassword = encryptPassword(password)
  } catch (e: any) {
    console.error('[Auth] 密码加密失败:', e)
    return { success: false, message: '服务器配置异常，无法安全存储注册信息' }
  }

  // 插入或更新 pending_registrations（带 last_sent_at 和可选的 code_version）
  // 新记录 version=1，每次重新发送时递增（解决旧验证码被新验证码覆盖后仍被提交的竞态问题）
  // P20 FIX: 如果 code_version 列不存在（迁移未执行），则忽略该字段，避免 upsert 失败
  const codeVersion = (existing?.code_version ?? 0) + 1
  const upsertData: Record<string, unknown> = {
    email: trimmedEmail,
    username: trimmedName,
    password: encryptedPassword,
    code,
    expires_at: expiresAt,
    created_at: existing?.created_at || new Date().toISOString(),
    last_sent_at: new Date().toISOString(),
    referrer_code: referrerCode?.trim() || null,
    referrer_article_id: referrerArticle?.trim() || null,
  }
  // 仅当 code_version 列存在时才写入（向后兼容迁移前的表结构）
  if (existing?.code_version !== undefined) {
    upsertData.code_version = codeVersion
  }
  const { error: upsertError } = await supabaseAdmin
    .from('pending_registrations')
    .upsert(upsertData, { onConflict: 'email' })

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
    // 回滚已写入的 pending_registrations，避免残留含密码的临时数据
    await supabaseAdmin
      .from('pending_registrations')
      .delete()
      .eq('email', trimmedEmail)
    console.error('[Auth] 发送验证码邮件失败，完整错误:', e)
    return { success: false, message: `验证码发送失败（${e?.message || '未知错误'}），请稍后重试` }
  }

  return { success: true, codeVersion }
}

// ─── 验证邮箱验证码（注册用）────────────────────────────────────────────────

/**
 * 验证用户输入的验证码，验证通过后创建 Auth 用户 + users 表记录。
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  codeVersion?: number
): Promise<{ success: true; user: User; fakeToken?: string } | { success: false; message: string }> {
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

  // 查询 pending_registrations（包含 code_version 用于竞态检测）
  const { data: pending, error: findError } = await supabaseAdmin
    .from('pending_registrations')
    .select('username, password, code, expires_at, referrer_code, referrer_article_id, code_version')
    .eq('email', trimmedEmail)
    .maybeSingle()

  if (findError || !pending) {
    return { success: false, message: '未找到验证码，请先发送验证码' }
  }

  if (new Date(pending.expires_at) < new Date()) {
    return { success: false, message: '验证码已过期，请重新获取' }
  }

  // code_version 检测：仅当数据库和前端都有 code_version 时才检测（向后兼容迁移前的表结构）
  // 当 DB 列不存在时：pending.code_version = null，前端 version 有意义（>= 1）时不触发
  // 当 DB 列存在时：前后端 version 同步，检测旧验证码被新验证码覆盖后仍被提交的情况
  // 注意：使用 != null 而非 !== undefined，因为 Supabase 不返回 undefined，缺失列为 null
  if (codeVersion >= 1 && pending.code_version != null && pending.code_version !== codeVersion) {
    return { success: false, message: '验证码已更新，请输入最新收到的验证码' }
  }

  if (pending.code !== trimmedCode) {
    return { success: false, message: '验证码错误' }
  }

  // 解密密码（兼容旧的明文记录）
  let plainPassword: string
  try {
    plainPassword = decryptPassword(pending.password)
  } catch (e: any) {
    console.error('[Auth] 密码解密失败:', e)
    return { success: false, message: '服务器配置异常，请联系管理员' }
  }

  // 验证通过，创建用户
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: trimmedEmail,
    password: plainPassword,
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

  // 初始化 user_profiles（阅读配额归零）
  const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
    id: authData.user.id,
    notes_read_count: 0,
    notes_read_ids: [],
    daily_read_count: 0,
    referrer_article_id: pending.referrer_article_id || null,
  })
  if (profileError) {
    console.error('[Auth] 插入 user_profiles 失败（非致命）:', profileError)
  }

  // 删除 pending_registrations
  await supabaseAdmin.from('pending_registrations').delete().eq('email', trimmedEmail)

  // P15 修复：概率性全局清理过期记录（约 2% 的注册请求触发）
  if (Math.random() < 0.02) {
    cleanupExpiredPendingRegistrations(supabaseAdmin).catch(() => {})
  }

  // 为新用户创建邀请码
  const newUserCode = authData.user.id.replace(/-/g, '').slice(0, 8).toLowerCase()
  try {
    await supabaseAdmin.from('referrer_codes').insert({
      user_id: authData.user.id,
      code: newUserCode,
    })
  } catch (e) {
    console.warn('[Auth] 创建邀请码失败（可能表未创建）:', e)
  }

  // 建立邀请关系（如有邀请码）
  if (pending.referrer_code) {
    try {
      await createReferral(authData.user.id, pending.referrer_code)
    } catch (err) {
      // 重新抛出错误，让调用方知道邀请关系建立失败
      // 不要静默吞掉，这可能表示系统配置问题（RLS 策略错误等）
      console.error("[Auth] 建立邀请关系失败:", err)
      throw err
    }
  }

  const fakeToken = generateFakeToken(authData.user.id) ?? undefined
  return { success: true, user: authData.user, fakeToken }
}

/**
 * 密码登录后，凭 Supabase access_token 换取 fakeToken（7 天有效期）。
 * 服务端验证 JWT 真实性，防止伪造。
 */
export async function requestFakeToken(supabaseJwt: string): Promise<{ fakeToken?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return {}

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error } = await client.auth.getUser(supabaseJwt)
  if (error || !user?.id) return {}

  const fakeToken = generateFakeToken(user.id) ?? undefined
  return { fakeToken }
}
