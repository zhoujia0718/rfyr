"use client"

import * as React from "react"
import { Loader2, AlertCircle, Mail, Lock, Eye, EyeOff, User } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase"
import { registerUser } from "@/app/actions/auth"

interface LoginFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AuthStatus = 'idle' | 'loading' | 'success' | 'error'

/** 仅向已注册邮箱发免密登录链接（新用户须走「注册」） */
async function sendMagicLink(email: string): Promise<{ success: true } | { success: false; message: string }> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { success: false, message: "请输入有效的邮箱地址" }
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', trimmed)
    .maybeSingle()

  if (!existing) {
    return {
      success: false,
      message: '该邮箱尚未注册。请先到「注册」填写名称、邮箱和密码完成注册。',
    }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      type: 'magiclink',
    },
  })

  if (error) {
    return { success: false, message: error.message }
  }

  return { success: true }
}

function persistLoginSession(
  userId: string,
  email: string | null | undefined,
  userData: Record<string, unknown> | null
) {
  const loginInfo = {
    user: { id: userId, email, ...userData },
    session: {
      access_token: `pwd_${Date.now()}`,
      refresh_token: `pwd_refresh_${Date.now()}`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    loginTime: Date.now(),
    source: "password",
  }
  localStorage.setItem('custom_auth', JSON.stringify(loginInfo))
}

export function LoginForm({ open, onOpenChange }: LoginFormProps) {
  const [activeTab, setActiveTab] = React.useState('register')
  const [authStatus, setAuthStatus] = React.useState<AuthStatus>('idle')
  const [error, setError] = React.useState('')

  // ── 注册 ──
  const [regName, setRegName] = React.useState('')
  const [regEmail, setRegEmail] = React.useState('')
  const [regPassword, setRegPassword] = React.useState('')
  const [regConfirmPassword, setRegConfirmPassword] = React.useState('')

  // ── 登录 ──
  const [loginEmail, setLoginEmail] = React.useState('')
  const [loginPassword, setLoginPassword] = React.useState('')
  const [showLoginPwd, setShowLoginPwd] = React.useState(false)

  // ── 免密邮件 ──
  const [magicEmail, setMagicEmail] = React.useState('')
  const [magicSent, setMagicSent] = React.useState(false)

  const [showForgotPassword, setShowForgotPassword] = React.useState(false)

  const handleRegister = async () => {
    const name = regName.trim()
    const email = regEmail.trim().toLowerCase()

    if (name.length < 2) {
      setError('名称至少 2 个字符')
      return
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址')
      return
    }
    if (regPassword.length < 6) {
      setError('密码至少 6 位')
      return
    }
    if (regPassword !== regConfirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setError('')
    setAuthStatus('loading')

    // 1. Server Action：创建 Auth 用户 + users 表记录（邮箱未验证）
    const regResult = await registerUser({
      email,
      password: regPassword,
      username: name,
    })

    if (!regResult.success) {
      setAuthStatus('error')
      setError(regResult.message)
      return
    }

    // 2. 注册成功，向同一邮箱发送 Magic Link，用于验证邮箱真实性
    setAuthStatus('loading')
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        type: 'magiclink',
      },
    })

    if (otpError) {
      setAuthStatus('error')
      setError('注册成功！但发送验证邮件失败，请稍后到「邮件链接」重新发送。')
      return
    }

    // 3. 切换到「邮件链接」页展示已发送状态（用户点链接后自动登录）
    setAuthStatus('idle')
    setRegName('')
    setRegEmail('')
    setRegPassword('')
    setRegConfirmPassword('')
    setMagicEmail(email)
    setMagicSent(true)
    setActiveTab('magic')
  }

  const handlePasswordLogin = async () => {
    const email = loginEmail.trim().toLowerCase()
    if (!email || !loginPassword) return

    setError('')
    setAuthStatus('loading')

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: loginPassword,
    })

    if (authError || !data.user) {
      setAuthStatus('error')
      const msg = authError?.message || '登录失败，请检查邮箱和密码'
      if (/email not confirmed|not confirmed|未确认/i.test(msg)) {
        setError('该邮箱尚未完成验证。请到收件箱点击注册邮件中的链接，或使用「邮件链接」重新发送登录邮件。')
      } else {
        setError(msg)
      }
      return
    }

    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle()

    persistLoginSession(data.user.id, data.user.email, userData)

    setAuthStatus('success')
    setTimeout(() => {
      onOpenChange(false)
      window.location.reload()
    }, 800)
  }

  const handleSendMagicLink = async () => {
    setError('')
    setAuthStatus('loading')
    const result = await sendMagicLink(magicEmail)
    if (!result.success) {
      setAuthStatus('error')
      setError(result.message)
    } else {
      setMagicSent(true)
      setAuthStatus('idle')
    }
  }

  const resetForm = () => {
    setAuthStatus('idle')
    setError('')
    setRegName('')
    setRegEmail('')
    setRegPassword('')
    setRegConfirmPassword('')
    setLoginEmail('')
    setLoginPassword('')
    setMagicEmail('')
    setMagicSent(false)
    setShowForgotPassword(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        {showForgotPassword ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Lock className="h-5 w-5 text-primary" />
                忘记密码
              </DialogTitle>
              <DialogDescription className="text-left leading-relaxed">
                由于系统升级，请联系客服人工重置密码
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex justify-center">
                <img
                  src="/qrcode/微信图片_20260328173325_3_11.png"
                  alt="客服二维码"
                  className="w-48 h-48 object-contain"
                />
              </div>
              <p className="text-sm text-center text-muted-foreground">扫码添加客服微信</p>
            </div>

            <DialogFooter className="sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForgotPassword(false)}>
                返回登录
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">
                {activeTab === 'register' && '注册新账号'}
                {activeTab === 'login' && '登录'}
                {activeTab === 'magic' && '免密登录（邮件链接）'}
              </DialogTitle>
              <DialogDescription className="text-left leading-relaxed">
                {activeTab === 'register' && (
                  <>
                    填写<strong>名称</strong>、<strong>真实邮箱</strong>与<strong>登录密码</strong>。提交后向邮箱发送验证链接，点击链接完成验证后方可使用密码登录。
                  </>
                )}
                {activeTab === 'login' && (
                  <>使用已注册邮箱与密码登录。</>
                )}
                {activeTab === 'magic' && (
                  <>
                    仅适用于<strong>已注册</strong>邮箱：向邮箱发送链接，点击即可登录，无需输入密码。
                    新用户请先到「注册」设置名称与密码。
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v)
            setError('')
          }}
          className="mt-2"
        >
          <TabsList className="grid w-full grid-cols-3 h-auto p-1 gap-1">
            <TabsTrigger value="register" className="text-xs sm:text-sm py-2">
              注册
            </TabsTrigger>
            <TabsTrigger value="login" className="text-xs sm:text-sm py-2">
              登录
            </TabsTrigger>
            <TabsTrigger value="magic" className="text-xs sm:text-sm py-2">
              邮件链接
            </TabsTrigger>
          </TabsList>

          {/* ── 注册 ── */}
          <TabsContent value="register" className="mt-4 space-y-3">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">密码说明：</strong>
              此处设置的密码即您的登录密码，之后可在「登录」里用邮箱+密码进入，也可在「邮件链接」里免密登录。
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-name">名称</Label>
              <div className="relative">
                <Input
                  id="reg-name"
                  placeholder="站内显示名称，2～32 字，不可与他人重复"
                  value={regName}
                  onChange={(e) => {
                    setRegName(e.target.value)
                    setError('')
                  }}
                  disabled={authStatus === 'loading'}
                  maxLength={32}
                  className="pr-10"
                />
                <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-email">邮箱</Label>
              <div className="relative">
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="your@email.com"
                  value={regEmail}
                  onChange={(e) => {
                    setRegEmail(e.target.value)
                    setError('')
                  }}
                  disabled={authStatus === 'loading'}
                  className="pr-10"
                />
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-pwd">密码</Label>
              <div className="relative">
                <Input
                  id="reg-pwd"
                  type="password"
                  placeholder="至少 6 位"
                  value={regPassword}
                  onChange={(e) => {
                    setRegPassword(e.target.value)
                    setError('')
                  }}
                  disabled={authStatus === 'loading'}
                  className="pr-10"
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-pwd2">确认密码</Label>
              <Input
                id="reg-pwd2"
                type="password"
                placeholder="再次输入密码"
                value={regConfirmPassword}
                onChange={(e) => {
                  setRegConfirmPassword(e.target.value)
                  setError('')
                }}
                disabled={authStatus === 'loading'}
                onKeyDown={(e) => e.key === 'Enter' && void handleRegister()}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleRegister}
              disabled={
                authStatus === 'loading' ||
                !regName.trim() ||
                !regEmail.trim() ||
                !regPassword
              }
            >
              {authStatus === 'loading' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  注册中…
                </>
              ) : authStatus === 'success' ? (
                '已登录'
              ) : (
                '提交注册'
              )}
            </Button>
          </TabsContent>

          {/* ── 登录 ── */}
          <TabsContent value="login" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">邮箱</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="your@email.com"
                value={loginEmail}
                onChange={(e) => {
                  setLoginEmail(e.target.value)
                  setError('')
                }}
                disabled={authStatus === 'loading'}
                onKeyDown={(e) => e.key === 'Enter' && void handlePasswordLogin()}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">密码</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showLoginPwd ? 'text' : 'password'}
                  placeholder="请输入密码"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value)
                    setError('')
                  }}
                  disabled={authStatus === 'loading'}
                  className="pr-10"
                  onKeyDown={(e) => e.key === 'Enter' && void handlePasswordLogin()}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPwd(!showLoginPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showLoginPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handlePasswordLogin}
              disabled={authStatus === 'loading' || !loginEmail.trim() || !loginPassword}
            >
              {authStatus === 'loading' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  登录中…
                </>
              ) : (
                '登录'
              )}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setShowForgotPassword(true)}
              >
                忘记密码
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-primary"
                onClick={() => setActiveTab('magic')}
              >
                免密邮件登录
              </button>
            </div>
          </TabsContent>

          {/* ── 邮件链接 ── */}
          <TabsContent value="magic" className="mt-4 space-y-4">
            {magicSent ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-6 space-y-3 text-center">
                <Mail className="h-10 w-10 text-blue-600 mx-auto" />
                <p className="text-sm text-blue-800 font-medium">邮件已发送</p>
                <p className="text-sm text-blue-700">
                  请打开 <strong>{magicEmail}</strong> 收件箱，点击邮件中的链接完成登录。
                </p>
                <p className="text-xs text-blue-600">若未收到，请查看垃圾邮件或稍后重试。</p>
                <Button variant="outline" className="w-full" onClick={() => setMagicSent(false)}>
                  更换邮箱
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="magic-email">已注册邮箱</Label>
                  <div className="relative">
                    <Input
                      id="magic-email"
                      type="email"
                      placeholder="your@email.com"
                      value={magicEmail}
                      onChange={(e) => {
                        setMagicEmail(e.target.value)
                        setError('')
                      }}
                      disabled={authStatus === 'loading'}
                      className="pr-10"
                      onKeyDown={(e) => e.key === 'Enter' && void handleSendMagicLink()}
                    />
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleSendMagicLink}
                  disabled={authStatus === 'loading' || !magicEmail.trim()}
                >
                  {authStatus === 'loading' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      发送中…
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      发送登录链接
                    </>
                  )}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="sm:justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              resetForm()
              onOpenChange(false)
            }}
            disabled={authStatus === 'loading'}
          >
            取消
          </Button>
        </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
