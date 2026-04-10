"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Check, AlertCircle, Mail } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

/**
 * 邮箱 Magic Link 回调页面
 *
 * 用户通过两种场景到达此页：
 * A. 注册后点验证链接  → Auth 建立 session → 自动登录（邮箱已验证）
 * B. 已有账号点登录链接 → Auth 建立 session → 自动登录
 * C. 链接失效 / 过期   → 提示重新获取
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [phase, setPhase] = React.useState<'loading' | 'sent' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState<string | null>(null)
  const [resending, setResending] = React.useState(false)

  React.useEffect(() => {
    void handleCallback()
  }, [])

  const handleCallback = async () => {
    const params = new URLSearchParams(window.location.search)
    const emailParam = params.get('email')
    const tokenParam = params.get('token') || params.get('token_hash')

    if (emailParam) setEmail(emailParam)

    // 1. 检查 Auth 是否已有 session（点了链接后 Supabase 自动建立的）
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[AuthCallback] session error:', sessionError)
      setErrorMsg(sessionError.message)
      setPhase('error')
      return
    }

    if (session) {
      // 有 session，说明邮箱已通过 Magic Link 验证，直接登录
      await completeLogin(session.user.id)
      return
    }

    // 2. 无 session：尝试用 token 参数验证
    if (tokenParam && emailParam) {
      const { data: confirmed, error: verifyError } = await supabase.auth.verifyOtp({
        type: 'email',
        email: emailParam,
        token: tokenParam,
      })
      if (!verifyError && confirmed?.session) {
        await completeLogin(confirmed.user!.id)
        return
      }
    }

    // 3. 无 session 且无法验证：链接失效
    setErrorMsg(
      sessionError
        ? sessionError.message
        : '登录链接已失效，请返回重新获取。'
    )
    setPhase('error')
  }

  const completeLogin = async (userId: string) => {
    // 确保 users 表��记录（注册后点链接的场景）
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (!existing) {
      const { data: authUser } = await supabase.auth.getUser()
      await supabase.from('users').insert({
        id: userId,
        email: authUser.user?.email || email,
      })
    }

    // 获取完整用户信息
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    const { data: authUser } = await supabase.auth.getUser()

    // 建立本地登录状态
    const loginInfo = {
      user: { id: userId, email: authUser.user?.email, ...userData },
      session: {
        access_token: `magic_${Date.now()}`,
        refresh_token: `magic_refresh_${Date.now()}`,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      },
      loginTime: Date.now(),
      source: "magic_link",
    }
    localStorage.setItem('custom_auth', JSON.stringify(loginInfo))

    const redirectTo = sessionStorage.getItem('login_redirect') || '/'
    sessionStorage.removeItem('login_redirect')
    router.push(redirectTo)
  }

  const handleResend = async () => {
    if (!email) return
    setResending(true)

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setResending(false)
    if (otpError) {
      setErrorMsg(otpError.message)
    } else {
      setPhase('sent')
    }
  }

  // ── 加载中 ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-slate-600">正在验证邮箱，请稍候…</p>
        </div>
      </div>
    )
  }

  // ── 链接已重发 ───────────────────────────────────────────────────────────
  if (phase === 'sent') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="text-center space-y-4 max-w-sm">
          <Check className="h-12 w-12 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold text-slate-800">验证邮件已发送</h1>
          <p className="text-slate-600">
            我们已重新向 <strong>{email}</strong> 发送验证链接，请查收邮件并点击。
          </p>
          <button
            onClick={() => router.push('/')}
            className="block w-full text-center text-sm text-primary hover:underline"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  // ── 链接失效 ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="text-center space-y-5 max-w-sm">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-800">链接已失效</h1>
          <p className="text-slate-600 text-sm">{errorMsg}</p>
        </div>

        {email && (
          <div className="space-y-3">
            <Button onClick={handleResend} disabled={resending} className="w-full">
              {resending ? '发送中…' : '重新获取验证链接'}
            </Button>
            <div className="flex items-center gap-2 text-sm text-slate-500 justify-center">
              <Mail className="h-4 w-4" />
              <span>{email}</span>
            </div>
          </div>
        )}

        <button
          onClick={() => router.push('/')}
          className="block w-full text-center text-sm text-muted-foreground hover:text-primary"
        >
          返回首页
        </button>
      </div>
    </div>
  )
}
