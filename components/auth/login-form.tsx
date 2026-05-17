"use client"

import * as React from "react"
import { Loader2, AlertCircle, Mail, Lock, Eye, EyeOff, User, Check, CheckCircle, XCircle } from "lucide-react"
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
import { sendEmailVerificationCode, verifyEmailCode, requestFakeToken } from "@/app/actions/auth"
import { getStoredReferrerCode, getStoredReferrerArticle, clearStoredReferrerCode } from "@/lib/referral-client"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"

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
  // 统一使用秒（与 Supabase expires_at 格式一致）
  const loginTime = Math.floor(Date.now() / 1000)
  const loginInfo = {
    user: { id: userId, email, ...userData },
    session: session ?? {
      access_token: '',
      refresh_token: '',
      expires_at: loginTime + 60 * 60 * 24 * 7,
    },
    loginTime, // 秒（统一格式）
    source: session ? "supabase" : "password",
  }
  localStorage.setItem('custom_auth', JSON.stringify(loginInfo))
}

function clearUrlRef() {
  if (typeof window === "undefined") return
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has("ref")) {
      url.searchParams.delete("ref")
      window.history.replaceState({}, "", url.toString())
    }
  } catch { /* ignore */ }
}

export function LoginForm({ open, onOpenChange }: LoginFormProps) {
  const { refreshAuth } = useAuth()
  const [activeTab, setActiveTab] = React.useState<'register' | 'login'>('register')
  const [authStatus, setAuthStatus] = React.useState<AuthStatus>('idle')
  const [error, setError] = React.useState('')

  // ── 注册 ──
  const [regName, setRegName] = React.useState('')
  const [regEmail, setRegEmail] = React.useState('')
  const [regPassword, setRegPassword] = React.useState('')
  const [regConfirmPassword, setRegConfirmPassword] = React.useState('')
  const [regReferrerCode, setRegReferrerCode] = React.useState('')
  const [referrerTouched, setReferrerTouched] = React.useState(false)
  const [referrerValidating, setReferrerValidating] = React.useState(false)
  const [referrerValid, setReferrerValid] = React.useState(false) // true=存在 false=不存在 null=未填/未校验

  // ── 验证码 ──
  const [pendingEmail, setPendingEmail] = React.useState('')
  const [pendingName, setPendingName] = React.useState('')
  const [pendingPassword, setPendingPassword] = React.useState('')
  const [verifyCode, setVerifyCode] = React.useState('')
  const [codeSent, setCodeSent] = React.useState(false)
  const [codeCountdown, setCodeCountdown] = React.useState(0)
  const [codeVersion, setCodeVersion] = React.useState(0) // 验证码版本号，用于检测竞态

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
      // 优先读 localStorage（ReferralCapture 已写入），没有再读 URL
      const stored = getStoredReferrerCode()
      const urlRef = new URLSearchParams(window.location.search).get('ref')
      if (stored) {
        setRegReferrerCode(stored.trim())
      } else if (urlRef) {
        setRegReferrerCode(urlRef.trim())
      }
    }
  }, [open])

  // 验证码倒计时
  React.useEffect(() => {
    if (codeCountdown > 0) {
      const timer = setTimeout(() => setCodeCountdown(codeCountdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [codeCountdown])

  // 邀请码：失焦时校验（提取为独立函数，供多处复用）
  const validateReferrerCode = async () => {
    const code = regReferrerCode.trim()
    setReferrerTouched(true)
    if (!code) {
      setReferrerValid(false)
      return
    }
    setReferrerValidating(true)
    try {
      const res = await fetch("/api/referral/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      setReferrerValid(data.valid)
      if (!data.valid) setError(data.message || "邀请码无效")
    } catch {
      setReferrerValid(false)
    } finally {
      setReferrerValidating(false)
    }
  }

  const handleReferrerBlur = async () => {
    await validateReferrerCode()
  }

  // 邀请码：弹窗打开时若有邀请码（来自 URL 或 localStorage），自动触发校验
  React.useEffect(() => {
    if (!open) return
    const code = regReferrerCode.trim()
    if (code) {
      validateReferrerCode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 步骤 1：发送验证码
  const handleSendCode = async () => {
    const name = regName.trim()
    const email = regEmail.trim().toLowerCase()

    if (name.length < 2) { setError('名称至少 2 个字符'); return }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('请核对你的邮箱是否正确'); return }
    if (regPassword.length < 6) { setError('密码至少 6 位'); return }
    if (regPassword !== regConfirmPassword) { setError('两次输入的密码不一致'); return }

    // 有邀请码时，必须校验通过
    const code = regReferrerCode.trim()
    if (code) {
      setReferrerTouched(true)
      if (!referrerValid) {
        // 未校验或校验失败，先校验一次
        setReferrerValidating(true)
        try {
          const res = await fetch("/api/referral/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          })
          const data = await res.json()
          setReferrerValid(data.valid)
          if (!data.valid) {
            setError(data.message || "邀请码无效")
            setReferrerValidating(false)
            return
          }
        } catch {
          setError("邀请码校验失败，请稍后重试")
          setReferrerValidating(false)
          return
        } finally {
          setReferrerValidating(false)
        }
      }
    }

    setError('')
    setAuthStatus('loading')

    const referrerArticle = getStoredReferrerArticle()
    const result = await sendEmailVerificationCode(email, name, regPassword, regReferrerCode.trim() || undefined, referrerArticle || undefined)

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
    setCodeVersion(result.codeVersion ?? 1)
    setAuthStatus('idle')
  }

  // 步骤 2：验证验证码并完成注册
  const handleVerifyCode = async () => {
    if (verifyCode.trim().length !== 6) { setError('请输入 6 位验证码'); return }

    setError('')
    setAuthStatus('loading')

    const result = await verifyEmailCode(pendingEmail, verifyCode.trim(), codeVersion)

    if (!result.success) {
      setAuthStatus('error')
      setError(result.message)
      return
    }

    // 注册成功，直接用 custom_auth 状态登录
    const { data: userData } = await supabase
      .from('users').select('*').eq('id', result.user.id).maybeSingle()

    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    const fakeToken = result.fakeToken ?? ''
    const fakeSession = {
      access_token: fakeToken,
      refresh_token: '',
      expires_at: expiresAt,
    }

    persistLoginSession(result.user.id, result.user.email ?? pendingEmail, userData, fakeSession)

    // 同时将 fakeToken 存入单独字段，兼容旧的读取路径
    if (fakeToken) {
      try {
        const current = JSON.parse(localStorage.getItem('custom_auth') || '{}')
        current.fakeToken = fakeToken
        localStorage.setItem('custom_auth', JSON.stringify(current))
      } catch { /* ignore */ }
    }

    // 3. 清除 URL 中的 ref 参数
    clearUrlRef()
    // 4. 清除 localStorage 中的邀请码
    clearStoredReferrerCode()

    // 5. 关闭弹窗
    onOpenChange(false)

    // 6. 写登录成功标记，reload 后跳过 init-cache singleton，强制发新请求
    try {
      localStorage.setItem('rfyr_just_logged_in', '1')
    } catch {}

    // 7. 触发 auth-refresh 事件让所有组件同步
    window.dispatchEvent(new CustomEvent('rfyr:auth-refresh'))

    // 8. reload
    setTimeout(() => {
      window.location.reload()
    }, 300)
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

    // 在后台换取 7 天 fakeToken（不阻塞登录流程，失败也不影响登录）
    requestFakeToken(data.session!.access_token).then(({ fakeToken }) => {
      if (!fakeToken) return
      try {
        const current = JSON.parse(localStorage.getItem('custom_auth') || '{}')
        current.fakeToken = fakeToken
        // 将 fakeToken 也写入 session.access_token，延长有效期至 7 天
        if (current.session) current.session.access_token = fakeToken
        localStorage.setItem('custom_auth', JSON.stringify(current))
      } catch { /* ignore */ }
    }).catch(() => { /* 失败静默忽略，不影响主登录流程 */ })

    setAuthStatus('idle')

    // 与注册流程一致：先注册监听器再调用 refreshAuth，避免竞态
    await new Promise<void>((resolve) => {
      let settled = false
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; window.removeEventListener('rfyr:auth-refresh', handler); resolve() }
      }, 5000)
      const handler = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        window.removeEventListener('rfyr:auth-refresh', handler)
        resolve()
      }
      window.addEventListener('rfyr:auth-refresh', handler)
      void refreshAuth()
    })

    onOpenChange(false)
    clearUrlRef()
  }

  const resetForm = () => {
    setAuthStatus('idle')
    setError('')
    setRegName('')
    setRegEmail('')
    setRegPassword('')
    setRegConfirmPassword('')
    setRegReferrerCode('')
    setReferrerTouched(false)
    setReferrerValidating(false)
    setReferrerValid(false)
    setPendingEmail('')
    setPendingName('')
    setPendingPassword('')
    setVerifyCode('')
    setCodeSent(false)
    setCodeCountdown(0)
    setCodeVersion(0)
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

                    <div className="space-y-2">
                      <Label htmlFor="reg-ref">邀请码 <span className="text-xs text-muted-foreground font-normal">（可选，来自朋友分享）</span></Label>
                      <div className="relative">
                        <Input
                          id="reg-ref"
                          placeholder="留空表示无邀请码"
                          value={regReferrerCode}
                          onChange={(e) => { setRegReferrerCode(e.target.value.toLowerCase()); setError(''); setReferrerValid(false) }}
                          onBlur={handleReferrerBlur}
                          disabled={authStatus === 'loading' || referrerValidating}
                          maxLength={16}
                          className={cn(
                            "font-mono pr-8",
                            referrerValid === true && "border-green-500 focus:border-green-500",
                            referrerValid === false && referrerTouched && "border-red-500 focus:border-red-500"
                          )}
                        />
                        {referrerValidating && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {!referrerValidating && referrerValid === true && (
                          <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                        )}
                        {!referrerValidating && referrerValid === false && referrerTouched && (
                          <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                        )}
                      </div>
                      {referrerValidating && (
                        <p className="text-xs text-muted-foreground">核对邀请码中…</p>
                      )}
                      {!referrerValidating && referrerValid === false && referrerTouched && (
                        <p className="text-xs text-red-500">邀请码不正确，请核对后再填</p>
                      )}
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
