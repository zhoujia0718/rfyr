"use client"

import * as React from "react"
import { Loader2, Check, AlertCircle, Mail, User, Phone, Lock, X } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { registerUser, loginUser } from "@/app/actions/auth"

interface LoginFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AuthStatus = 'idle' | 'loading' | 'success' | 'error'

export function LoginForm({ open, onOpenChange }: LoginFormProps) {
  const [activeTab, setActiveTab] = React.useState('login')
  const [authStatus, setAuthStatus] = React.useState<AuthStatus>('idle')
  const [error, setError] = React.useState('')
  
  // 登录表单
  const [loginAccount, setLoginAccount] = React.useState('')
  const [loginPassword, setLoginPassword] = React.useState('')
  
  // 注册表单
  const [registerPhone, setRegisterPhone] = React.useState('')
  const [registerUsername, setRegisterUsername] = React.useState('')
  const [registerPassword, setRegisterPassword] = React.useState('')
  const [registerConfirmPassword, setRegisterConfirmPassword] = React.useState('')
  const [usernameError, setUsernameError] = React.useState('')
  
  // 忘记密码弹窗
  const [showForgotPassword, setShowForgotPassword] = React.useState(false)

  // 检查用户名是否已存在
  const checkUsernameExists = async (username: string) => {
    if (!username) {
      setUsernameError('')
      return
    }
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', username)
        .single()
      
      if (data) {
        setUsernameError('用户名已被占用')
      } else {
        setUsernameError('')
      }
    } catch (error) {
      console.error('检查用户名失败:', error)
    }
  }

  // 注册逻辑
  const handleRegister = async () => {
    // 逻辑 A：检查两个密码是否一致
    if (registerPassword !== registerConfirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    
    // 逻辑 B：检查用户名是否已存在
    if (usernameError) {
      setError('请检查用户名是否可用')
      return
    }
    
    setError('')
    setAuthStatus('loading')

    let regResult: Awaited<ReturnType<typeof registerUser>>
    try {
      regResult = await registerUser({
        phone: registerPhone,
        password: registerPassword,
        username: registerUsername,
      })
    } catch (e: unknown) {
      console.error('注册请求失败:', e)
      setAuthStatus('error')
      setError('无法连接服务器，请稍后重试。')
      return
    }

    if (!regResult.success) {
      setAuthStatus('error')
      setError(regResult.message)
      return
    }

    setAuthStatus('success')
    setTimeout(() => {
      onOpenChange(false)
      window.location.reload()
    }, 1500)
  }

  // 登录逻辑
  const handleLogin = async () => {
    setError('')
    setAuthStatus('loading')

    let loginResult: Awaited<ReturnType<typeof loginUser>>
    try {
      loginResult = await loginUser({
        account: loginAccount,
        password: loginPassword,
      })
    } catch (e: unknown) {
      console.error('登录请求失败:', e)
      setAuthStatus('error')
      setError(
        '无法连接服务器（可能维护中或网络异常），请稍后重试。若持续出现请联系管理员。'
      )
      return
    }

    if (!loginResult.success) {
      setAuthStatus('error')
      setError(loginResult.message)
      return
    }

    const { user, session } = loginResult

    try {
      const { data: userData } = await supabase.from('users').select('*').eq('id', user.id).single()

      const loginInfo = {
        user: {
          id: user.id,
          email: user.email,
          ...userData,
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        },
        loginTime: Date.now(),
      }
      localStorage.setItem('custom_auth', JSON.stringify(loginInfo))

      setAuthStatus('success')
      setTimeout(() => {
        onOpenChange(false)
        window.location.reload()
      }, 1500)
    } catch (error: any) {
      console.error('登录后同步用户信息失败:', error)
      setAuthStatus('error')
      setError(error.message || '登录成功但同步用户信息失败，请刷新重试')
    }
  }

  // 重置表单
  const resetForm = () => {
    setAuthStatus('idle')
    setError('')
    setLoginAccount('')
    setLoginPassword('')
    setRegisterPhone('')
    setRegisterUsername('')
    setRegisterPassword('')
    setRegisterConfirmPassword('')
    setUsernameError('')
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm()
      onOpenChange(open)
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {activeTab === 'login' ? '登录' : '注册'}
          </DialogTitle>
          <DialogDescription>
            {activeTab === 'login' ? '使用手机号或用户名登录' : '注册新账号'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-4 space-y-4">
            {authStatus === 'success' ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-green-200 bg-green-50 p-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-green-800">登录成功</h3>
                <p className="mt-2 text-center text-sm text-green-600">
                  正在跳转...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>账号</Label>
                  <div className="relative">
                    <Input
                      placeholder="手机号或用户名"
                      value={loginAccount}
                      onChange={(e) => setLoginAccount(e.target.value)}
                      disabled={authStatus === 'loading'}
                      className="pr-10"
                    />
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>密码</Label>
                  <div className="relative">
                    <Input
                      type="password"
                      placeholder="请输入密码"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      disabled={authStatus === 'loading'}
                      className="pr-10"
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                
                <Button
                  className="w-full"
                  onClick={handleLogin}
                  disabled={authStatus === 'loading'}
                >
                  {authStatus === 'loading' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="register" className="mt-4 space-y-4">
            {authStatus === 'success' ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-green-200 bg-green-50 p-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-green-800">注册成功</h3>
                <p className="mt-2 text-center text-sm text-green-600">
                  正在跳转...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>手机号</Label>
                  <div className="relative">
                    <Input
                      placeholder="请输入手机号"
                      value={registerPhone}
                      onChange={(e) => setRegisterPhone(e.target.value)}
                      disabled={authStatus === 'loading'}
                      className="pr-10"
                    />
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>用户名</Label>
                  <div className="relative">
                    <Input
                      placeholder="请输入用户名"
                      value={registerUsername}
                      onChange={(e) => {
                        setRegisterUsername(e.target.value)
                        checkUsernameExists(e.target.value)
                      }}
                      disabled={authStatus === 'loading'}
                      className="pr-10"
                    />
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                  {usernameError && (
                    <p className="text-xs text-red-600">{usernameError}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>密码</Label>
                  <div className="relative">
                    <Input
                      type="password"
                      placeholder="请输入密码"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      disabled={authStatus === 'loading'}
                      className="pr-10"
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>确认密码</Label>
                  <div className="relative">
                    <Input
                      type="password"
                      placeholder="请再次输入密码"
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      disabled={authStatus === 'loading'}
                      className="pr-10"
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                
                <Button
                  className="w-full"
                  onClick={handleRegister}
                  disabled={authStatus === 'loading'}
                >
                  {authStatus === 'loading' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      注册中...
                    </>
                  ) : (
                    '注册'
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center gap-4">
          {activeTab === 'login' ? (
            <button
              type="button"
              className="text-sm text-primary hover:underline mr-auto"
              onClick={() => setShowForgotPassword(true)}
            >
              忘记密码
            </button>
          ) : (
            <div className="mr-auto" />
          )}
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
      </DialogContent>

      {/* 忘记密码弹窗 */}
      {showForgotPassword && (
        <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
          <DialogContent className="sm:max-w-[380px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                忘记密码
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                由于系统升级，请联系客服人工重置密码
              </p>
              
              <div className="flex justify-center">
                <img 
                  src="/qrcode/微信图片_20260328173325_3_11.png" 
                  alt="客服二维码" 
                  className="w-48 h-48 object-contain"
                />
              </div>
              
              <p className="text-sm text-center text-muted-foreground">
                扫码添加客服微信
              </p>
            </div>
            
            <DialogFooter className="flex justify-center">
              <Button onClick={() => setShowForgotPassword(false)}>
                确定
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}
