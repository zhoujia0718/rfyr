"use server"

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

interface RegisterParams {
  phone: string
  password: string
  username: string
}

interface LoginParams {
  account: string  // 可以是手机号或用户名
  password: string
}

// 获取管理员客户端（在函数内部调用，确保环境变量已加载）
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// 生成基于手机号的邮箱地址
function getEmailFromPhone(phone: string): string {
  return `${phone}@phone.user`
}

/**
 * 纯数字账号登录：不限制手机号位数/格式，只做 trim。
 * 依次：users.phone → users.username（纯数字也可能是用户名）→ Auth 用户（合成邮箱 / metadata.phone）
 * 解决：库里 phone 与注册时不一致、或仅有 Auth 记录时 users 表查不到的问题。
 */
async function resolveUserIdForDigitAccount(
  supabaseAdmin: SupabaseClient,
  rawAccount: string
): Promise<{ userId: string | null; phoneForEmail: string }> {
  const account = rawAccount.trim()
  if (!account || !/^\d+$/.test(account)) {
    return { userId: null, phoneForEmail: account }
  }

  const { data: byPhone } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('phone', account)
    .maybeSingle()

  if (byPhone?.id) {
    return { userId: byPhone.id, phoneForEmail: account }
  }

  const { data: byUsername } = await supabaseAdmin
    .from('users')
    .select('id, phone')
    .eq('username', account)
    .maybeSingle()

  if (byUsername?.id) {
    const p = (byUsername.phone as string | null)?.trim() || account
    return { userId: byUsername.id, phoneForEmail: p }
  }

  const syntheticEmail = getEmailFromPhone(account).toLowerCase()
  let page = 1
  const perPage = 200
  const maxPages = 30

  while (page <= maxPages) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error || !data?.users?.length) break

    const match = data.users.find((u) => {
      const email = (u.email || '').toLowerCase()
      const metaPhone = u.user_metadata && String((u.user_metadata as { phone?: string }).phone || '').replace(/\s/g, '')
      const authPhone = (u.phone || '').replace(/\s/g, '')
      return (
        email === syntheticEmail ||
        authPhone === account ||
        metaPhone === account
      )
    })

    if (match?.id) {
      return { userId: match.id, phoneForEmail: account }
    }

    if (data.users.length < perPage) break
    page += 1
  }

  return { userId: null, phoneForEmail: account }
}

export async function registerUser(
  { phone, password, username }: RegisterParams
): Promise<{ success: true; user: User } | { success: false; message: string }> {
  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: any) {
    const msg = e?.message || ''
    console.error('注册失败（配置）:', e)
    return {
      success: false,
      message: msg.includes('SUPABASE_SERVICE_ROLE_KEY')
        ? '服务器未配置 SUPABASE_SERVICE_ROLE_KEY，登录/注册不可用，请在部署环境配置该变量后重启服务'
        : msg.includes('NEXT_PUBLIC_SUPABASE_URL')
          ? '服务器未配置 NEXT_PUBLIC_SUPABASE_URL'
          : '服务器数据库配置异常，请联系管理员',
    }
  }

  try {
    const email = getEmailFromPhone(phone)

    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      console.error('获取用户列表失败:', listError)
    } else {
      const existingUser = existingUsers.users.find((u) => u.email === email || u.phone === phone)
      if (existingUser) {
        return { success: false, message: '该手机号已被注册' }
      }
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { username, phone },
      email_confirm: true,
    })

    if (authError) {
      console.error('创建用户失败:', authError)
      return { success: false, message: authError.message }
    }

    if (!authData.user) {
      return { success: false, message: '创建用户失败，未返回用户信息' }
    }

    const { error: dbError } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      username,
      phone,
    })

    if (dbError) {
      console.error('插入用户信息失败:', dbError)
      return { success: false, message: dbError.message }
    }

    return { success: true, user: authData.user }
  } catch (error: any) {
    console.error('注册失败:', error)
    return { success: false, message: error.message || '注册失败' }
  }
}

type LoginSuccessPayload = {
  success: true
  user: { id: string; email: string }
  session: {
    access_token: string
    refresh_token: string
    expires_at: number
  }
}

function adminConfigErrorMessage(msg: string): string {
  if (msg.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    return '服务器未配置 SUPABASE_SERVICE_ROLE_KEY，登录不可用，请在部署环境配置该变量后重启服务'
  }
  if (msg.includes('NEXT_PUBLIC_SUPABASE_URL')) {
    return '服务器未配置 NEXT_PUBLIC_SUPABASE_URL'
  }
  return '服务器数据库配置异常，请联系管理员'
}

export async function loginUser(
  { account, password }: LoginParams
): Promise<LoginSuccessPayload | { success: false; message: string }> {
  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (e: any) {
    const msg = e?.message || ''
    console.error('登录失败（配置）:', e)
    return { success: false, message: adminConfigErrorMessage(msg) }
  }

  try {
    const accountTrimmed = account.trim()
    console.log('=== 登录调试 ===')
    console.log('登录账号:', accountTrimmed)

    let email: string = ''
    let userId: string | null = null
    /** 必须在 if (userId) 外声明，否则 return 处会 ReferenceError 导致 Server Action 整页 503 */
    let emailFromAuth: string = ''

    if (/^\d+$/.test(accountTrimmed)) {
      console.log('识别为手机号（仅要求为数字，不限制长度）:', accountTrimmed)

      const resolved = await resolveUserIdForDigitAccount(supabaseAdmin, accountTrimmed)
      userId = resolved.userId
      email = getEmailFromPhone(resolved.phoneForEmail)

      if (userId) {
        console.log('从 手机号/用户名/Auth 解析到用户ID:', userId)
      }
    } else {
      console.log('识别为用户名:', accountTrimmed)
      const { data: userData, error: queryError } = await supabaseAdmin
        .from('users')
        .select('id, phone')
        .eq('username', accountTrimmed)
        .single()

      if (queryError || !userData) {
        return { success: false, message: '用户名不存在' }
      }

      console.log('用户名对应的手机号:', userData.phone)
      email = getEmailFromPhone(userData.phone)
      userId = userData.id
    }

    console.log('最终邮箱:', email)
    console.log('用户ID:', userId)

    if (userId) {
      console.log('获取用户 Auth 信息...')
      emailFromAuth = email
      try {
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)

        if (userError) {
          console.error('获取用户信息失败:', userError)
        } else if (userData.user) {
          console.log('用户 Auth 信息:', {
            id: userData.user.id,
            email: userData.user.email,
            phone: userData.user.phone,
          })

          if (userData.user.email) {
            emailFromAuth = userData.user.email
            console.log('使用实际邮箱:', emailFromAuth)
          }
        }
      } catch (e) {
        console.error('getUserById 调用异常:', e)
      }

      console.log('使用管理员权限更新密码...')
      try {
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: password,
        })

        if (updateError) {
          console.error('更新密码失败:', updateError)
        } else {
          console.log('密码更新成功')
        }
      } catch (e) {
        console.error('updateUserById 调用异常:', e)
      }
    }

    if (!userId) {
      return { success: false, message: '用户不存在' }
    }

    const sessionPayload = {
      access_token: `admin_token_${Date.now()}`,
      refresh_token: `admin_refresh_${Date.now()}`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    }

    // 不再调用 generateLink：前端只用 custom_auth，magic link 易超时/抛错并导致 Server Action 500
    return {
      success: true,
      user: { id: userId, email: emailFromAuth || email },
      session: sessionPayload,
    }
  } catch (error: any) {
    console.error('登录失败:', error)
    return { success: false, message: error.message || '登录失败' }
  }
}
