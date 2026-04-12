"use client"

import * as React from "react"
import { Loader2, AlertCircle, Mail, Lock, Eye, EyeOff, User, Check } from "lucide-react"
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
import { sendEmailVerificationCode, verifyEmailCode } from "@/app/actions/auth"

interface LoginFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AuthStatus = 'idle' | 'loading' | 'error'

function persistLoginSession(
  userId: string,
  email: string | null | undefined,
  userData: Record<string, unknown> | null,
  session?: { access_token: string; refresh_token: string; expires_at: number }
) {
  const loginInfo = {
    user: { id: userId, email, ...userData },
    session: session ?? {
      access_token: `pwd_${Date.now()}`,
      refresh_token: `pwd_refresh_${Date.now()}`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    loginTime: Date.now(),
    source: session ? "supabase" : "password",
  }
  localStorage.setItem('custom_auth', JSON.stringify(loginInfo))
}

export function LoginForm({ open, onOpenChange }: LoginFormProps) {
  const [activeTab, setActiveTab] = React.useState<'register' | 'login'>('register')
  const [authStatus, setAuthStatus] = React.useState<AuthStatus>('idle')
  const [error, setError] = React.useState('')

  // ── 注册 ──
  const [regName, setRegName] = React.useState('')
  const [regEmail, setRegEmail] = React.useState('')
  const [regPassword, setRegPassword] = React.useState('')
  const [regConfirmPassword, setRegConfirmPassword] = React.useState('')

  // ── 验证码 ──
  const [pendingEmail, setPendingEmail] = React.useState('')
  const [pendingName, setPendingName] = React.useState('')
  const [pendingPassword, setPendingPassword] = React.useState('')
  const [verifyCode, setVerifyCode] = React.useState('')
  const [codeSent, setCodeSent] = React.useState(false)
  const [codeCountdown, setCodeCountdown] = React.useState(0)

  // ── 登录 ──
  const [loginEmail, setLoginEmail] = React.useState('')
  const [loginPassword, setLoginPassword] = React.useState('')
  const [showLoginPwd, setShowLoginPwd] = React.useState(false)

  // ── 忘记密码 ──
  const [showForgotPassword, setShowForgotPassword] = React.useState(false)

  // 弹窗打开时重置
  React.useEffect(() => {
    if (open) {
      setActiveTab('register')
      setError('')
    }
  }, [open])

  // 验证码倒计时
  React.useEffect(() => {
    if (codeCountdown > 0) {
      const timer = setTimeout(() => setCodeCountdown(codeCountdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [codeCountdown])

  // 步骤 1：发送验证码
  const handleSendCode = async () => {
    const name = regName.trim()
    const email = regEmail.trim().toLowerCase()

    if (name.length < 2) { setError('名称至少 2 个字符'); return }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('请输入有效的邮箱地址'); return }
    if (regPassword.length < 6) { setError('密码至少 6 位'); return }
    if (regPassword !== regConfirmPassword) { setError('两次输入的密码不一致'); return }

    setError('')
    setAuthStatus('loading')

    const result = await sendEmailVerificationCode(email, name, regPassword)

    if (!result.success) {
      setAuthStatus('error')
      setError(result.message)
      return
    }

    setPendingEmail(email)
    setPendingName(name)
    setPendingPassword(regPassword)
    setCodeSent(true)
    setCodeCountdown(60)
    setAuthStatus('idle')
  }

  // 步骤 2：验证验证码并完成注册
  const handleVerifyCode = async () => {
    if (verifyCode.trim().length !== 6) { setError('请输入 6 位验证码'); return }

    setError('')
    setAuthStatus('loading')

    const result = await verifyEmailCode(pendingEmail, verifyCode.trim())

    if (!result.success) {
      setAuthStatus('error')
      setError(result.message)
      return
    }

    // 注册成功，获取真实 session
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: pendingEmail,
      password: pendingPassword,
    })

    if (signInError || !signInData.session) {
      setAuthStatus('error')
      setError('注册成功，但获取登录状态失败，请手动登录')
      return
    }

    const { data: userData } = await supabase
      .from('users').select('*').eq('id', result.user.id).maybeSingle()

    persistLoginSession(result.user.id, result.user.email, userData, {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_at: signInData.session.expires_at ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    })

    setAuthStatus('idle')
    setTimeout(() => {
      onOpenChange(false)
      window.location.reload()
    }, 800)
  }

  // 密码登录
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
        setError('该邮箱尚未完成验证。')
      } else {
        setError(msg)
      }
      return
    }

    const { data: userData } = await supabase
      .from('users').select('*').eq('id', data.user.id).maybeSingle()

    persistLoginSession(data.user.id, data.user.email, userData, {
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
      expires_at: data.session!.expires_at ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    })

    setAuthStatus('idle')
    setTimeout(() => {
      onOpenChange(false)
      window.location.reload()
    }, 800)
  }

  const resetForm = () => {
    setAuthStatus('idle')
    setError('')
    setRegName('')
    setRegEmail('')
    setRegPassword('')
    setRegConfirmPassword('')
    setPendingEmail('')
    setPendingName('')
    setPendingPassword('')
    setVerifyCode('')
    setCodeSent(false)
    setCodeCountdown(0)
    setLoginEmail('')
    setLoginPassword('')
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
                {activeTab === 'register' && (codeSent ? '验证邮箱' : '注册新账号')}
                {activeTab === 'login' && '登录'}
              </DialogTitle>
              <DialogDescription className="text-left leading-relaxed">
                {activeTab === 'register' && !codeSent && (
                  <>填写<strong>名称</strong>、<strong>邮箱</strong>与<strong>密码</strong>，提交后查收验证码完成注册。</>
                )}
                {activeTab === 'register' && codeSent && (
                  <>验证码已发送至 <strong>{pendingEmail}</strong>，请查收并输入 6 位验证码完成注册。</>
                )}
                {activeTab === 'login' && <>使用已注册邮箱与密码登录。</>}
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
                setActiveTab(v as 'register' | 'login')
                setError('')
              }}
              className="mt-2"
            >
              <TabsList className="grid w-full grid-cols-2 h-auto p-1 gap-1">
                <TabsTrigger value="register" className="text-xs sm:text-sm py-2">
                  注册
                </TabsTrigger>
                <TabsTrigger value="login" className="text-xs sm:text-sm py-2">
                  登录
                </TabsTrigger>
              </TabsList>

              {/* ── 注册（两步：填信息 → 填验证码）── */}
              <TabsContent value="register" className="mt-4 space-y-3">
                {!codeSent ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">名称</Label>
                      <div className="relative">
                        <Input
                          id="reg-name"
                          placeholder="站内显示名称，2～32 字"
                          value={regName}
                          onChange={(e) => { setRegName(e.target.value); setError('') }}
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
                          onChange={(e) => { setRegEmail(e.target.value); setError('') }}
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
                          onChange={(e) => { setRegPassword(e.target.value); setError('') }}
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
                        onChange={(e) => { setRegConfirmPassword(e.target.value); setError('') }}
                        disabled={authStatus === 'loading'}
                        onKeyDown={(e) => e.key === 'Enter' && void handleSendCode()}
                      />
                    </div>

                    <Button
                      className="w-full"
                      onClick={handleSendCode}
                      disabled={authStatus === 'loading' || !regName.trim() || !regEmail.trim() || !regPassword}
                    >
                      {authStatus === 'loading' ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />发送验证码…</>
                      ) : (
                        <>发送验证码</>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                      <strong>名称：</strong>{pendingName}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="verify-code">验证码</Label>
                      <Input
                        id="verify-code"
                        placeholder="请输入 6 位验证码"
                        value={verifyCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                          setVerifyCode(val)
                          setError('')
                        }}
                        disabled={authStatus === 'loading'}
                        className="text-center text-lg tracking-widest font-mono"
                        maxLength={6}
                        onKeyDown={(e) => e.key === 'Enter' && void handleVerifyCode()}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setCodeSent(false)
                          setVerifyCode('')
                          setError('')
                        }}
                        disabled={authStatus === 'loading'}
                      >
                        重新填写
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleVerifyCode}
                        disabled={authStatus === 'loading' || verifyCode.length !== 6}
                      >
                        {authStatus === 'loading' ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />验证中…</>
                        ) : (
                          <>完成注册</>
                        )}
                      </Button>
                    </div>

                    {codeCountdown > 0 ? (
                      <p className="text-xs text-center text-muted-foreground">
                        {codeCountdown} 秒后可重新获取验证码
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="w-full text-xs text-primary hover:underline"
                        onClick={handleSendCode}
                      >
                        收不到验证码？重新获取
                      </button>
                    )}
                  </>
                )}
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
                    onChange={(e) => { setLoginEmail(e.target.value); setError('') }}
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
                      onChange={(e) => { setLoginPassword(e.target.value); setError('') }}
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
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />登录中…</>
                  ) : (
                    '登录'
                  )}
                </Button>

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    忘记密码
                  </button>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="sm:justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { resetForm(); onOpenChange(false) }}
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
