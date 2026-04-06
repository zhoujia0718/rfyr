"use client"

import * as React from "react"
import { Loader2, Check, Mail, AlertCircle } from "lucide-react"
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
import { supabase } from "@/lib/supabase"
import { useMembership } from "@/components/membership-provider"

interface EmailLoginProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type LoginStatus = 'idle' | 'sending' | 'verifying' | 'success' | 'error'

export function EmailLogin({ open, onOpenChange }: EmailLoginProps) {
  const { refreshMembership } = useMembership()
  const [loginStatus, setLoginStatus] = React.useState<LoginStatus>('idle')
  const [email, setEmail] = React.useState('')
  const [otp, setOtp] = React.useState('')
  const [error, setError] = React.useState('')
  const [step, setStep] = React.useState<'email' | 'otp'>('email')
  const [countdown, setCountdown] = React.useState<number>(0)

  // 倒计时逻辑
  React.useEffect(() => {
    let interval: NodeJS.Timeout
    if (countdown > 0) {
      interval = setInterval(() => {
        setCountdown(prev => prev - 1)
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [countdown])

  // 发送验证码
  const handleSendOtp = async () => {
    if (!email) {
      setError('请输入邮箱地址')
      return
    }

    if (countdown > 0) {
      setError(`请在 ${countdown} 秒后重试`)
      return
    }

    setError('')
    setLoginStatus('sending')

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true }
      })

      if (error) throw error

      setLoginStatus('idle')
      setStep('otp')
      setCountdown(60)
    } catch (err: unknown) {
      setLoginStatus('error')
      setError(err instanceof Error ? err.message : '发送验证码失败')
    }
  }

  // 验证验证码
  const handleVerifyOtp = async () => {
    if (!otp) {
      setError('请输入验证码')
      return
    }

    setError('')
    setLoginStatus('verifying')

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email'
      })

      if (error) throw error

      // 获取用户信息并同步到 custom_auth
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()

        const loginInfo = {
          user: userData ?? { id: user.id, email: user.email },
          session: {},
          loginTime: Date.now(),
        }
        localStorage.setItem('custom_auth', JSON.stringify(loginInfo))
        localStorage.setItem('isLoggedIn', 'true')
        localStorage.setItem('userEmail', email)
        localStorage.setItem('userId', user.id)
      }

      setLoginStatus('success')
      await refreshMembership()
    } catch (err: unknown) {
      setLoginStatus('error')
      setError(err instanceof Error ? err.message : '验证失败')
    }
  }

  // 重置登录状态
  const resetLogin = () => {
    setLoginStatus('idle')
    setEmail('')
    setOtp('')
    setError('')
    setStep('email')
    setCountdown(0)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            邮箱登录
          </DialogTitle>
          <DialogDescription>
            使用邮箱验证码登录您的账号
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* 登录成功 */}
        {loginStatus === 'success' ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-green-200 bg-green-50 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-green-800">登录成功</h3>
            <p className="mt-2 text-center text-sm text-green-600">
              您已成功登录，可查看会员内容
            </p>
            <Button 
              className="mt-4" 
              onClick={async () => {
                onOpenChange(false)
                // 刷新会员状态
                await refreshMembership()
                window.location.reload()
              }}
            >
              确定
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 邮箱输入步骤 */}
            {step === 'email' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">邮箱地址</label>
                  <Input
                    type="email"
                    placeholder="请输入您的邮箱"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loginStatus === 'sending'}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleSendOtp}
                  disabled={loginStatus === 'sending' || countdown > 0}
                >
                  {loginStatus === 'sending' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      发送中...
                    </>
                  ) : countdown > 0 ? (
                    '验证码已发送，请检查邮箱（包括垃圾箱）'
                  ) : (
                    '发送验证码'
                  )}
                </Button>
                {countdown > 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    {countdown}秒后可重新发送
                  </p>
                )}
              </div>
            )}

            {/* 验证码输入步骤 */}
            {step === 'otp' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">验证码</label>
                  <Input
                    type="text"
                    placeholder="请输入收到的6位验证码"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    disabled={loginStatus === 'verifying'}
                    maxLength={6}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleVerifyOtp}
                  disabled={loginStatus === 'verifying'}
                >
                  {loginStatus === 'verifying' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      验证中...
                    </>
                  ) : (
                    '验证登录'
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep('email')}
                >
                  重新输入邮箱
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-center">
          <Button 
            variant="outline" 
            onClick={() => {
              onOpenChange(false)
              resetLogin()
            }}
          >
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
