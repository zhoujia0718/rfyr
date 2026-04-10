"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Mail, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "@/components/auth/login-form"

export default function WechatLoginPage() {
  const router = useRouter()
  const [showLogin, setShowLogin] = React.useState(true)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">登录方式已更新</CardTitle>
          <CardDescription className="text-base mt-2">
            微信扫码登录已停用。请使用邮箱登录方式
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button
            className="w-full"
            size="lg"
            onClick={() => setShowLogin(true)}
          >
            <Mail className="mr-2 h-5 w-5" />
            使用邮箱登录 / 注册
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回首页
          </Button>
        </CardContent>
      </Card>

      <LoginForm open={showLogin} onOpenChange={setShowLogin} />
    </div>
  )
}
