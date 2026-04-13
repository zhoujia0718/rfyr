"use client"

import * as React from "react"
import Image from "next/image"
import { Check, Copy, Loader2, QrCode, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMembership } from "@/components/membership-provider"
import { cn } from "@/lib/utils"

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId?: string | null
}

// 支付状态
 type PaymentStatus = 'pending' | 'scanning' | 'success' | 'failed'

const plans = [
  {
    id: "yearly",
    name: "年度VIP会员",
    price: "299",
    period: "365天",
    features: [
      "全部短线笔记与大佬合集在线阅读",
      "年度VIP解锁个股挖掘深度内容",
      "专属客服支持",
    ],
    recommended: true,
  },
]

// 模拟支付二维码数据（实际项目中应该调用支付API生成）
const mockQRCode = {
  wechat: "/placeholder.svg?height=200&width=200&text=微信支付二维码",
  alipay: "/placeholder.svg?height=200&width=200&text=支付宝二维码",
}

export function PaymentDialog({ open, onOpenChange, planId }: PaymentDialogProps) {
  const [paymentMethod, setPaymentMethod] = React.useState("wechat")
  const [paymentStatus, setPaymentStatus] = React.useState<PaymentStatus>('pending')
  const [orderId, setOrderId] = React.useState<string>("")
  const [countdown, setCountdown] = React.useState(300) // 5分钟倒计时
  const { activateMembership, refreshMembership } = useMembership()

  // 生成订单号
  React.useEffect(() => {
    if (open && !orderId) {
      const newOrderId = `ORD${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`
      setOrderId(newOrderId)
      setPaymentStatus('pending')
      setCountdown(300)
    }
  }, [open, orderId])

  // 倒计时
  React.useEffect(() => {
    if (!open || paymentStatus !== 'pending') return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [open, paymentStatus])

  // 格式化倒计时
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 模拟支付成功（实际项目中应该轮询支付状态API）
  const simulatePayment = () => {
    setPaymentStatus('scanning')
    // 模拟3秒后支付成功
    setTimeout(() => {
      setPaymentStatus('success')
      // 激活会员
      if (planId === 'yearly') {
        activateMembership('yearly', 365)
      } else if (planId === 'weekly') {
        activateMembership('weekly', 7)
      }
    }, 3000)
  }

  // 重置支付状态
  const resetPayment = () => {
    setPaymentStatus('pending')
    setOrderId(`ORD${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`)
    setCountdown(300)
  }

  // 复制订单号
  const copyOrderId = () => {
    navigator.clipboard.writeText(orderId)
  }

  const selectedPlan = plans.find(p => p.id === (planId || "yearly")) || plans[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>开通年度VIP会员</DialogTitle>
          <DialogDescription>
            选择支付方式完成购买
          </DialogDescription>
        </DialogHeader>

        {/* Plan Info */}
        <div className="rounded-lg border bg-secondary/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{selectedPlan.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedPlan.period}</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-primary">¥{selectedPlan.price}</span>
            </div>
          </div>
          <ul className="mt-3 space-y-1">
            {selectedPlan.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-primary" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Order Info */}
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">订单号</Label>
            <div className="flex items-center gap-2">
              <Input 
                value={orderId} 
                readOnly 
                className="h-8 text-sm font-mono"
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 shrink-0"
                onClick={copyOrderId}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Payment Status */}
        {paymentStatus === 'success' ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-green-200 bg-green-50 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-green-800">支付成功</h3>
            <p className="mt-2 text-center text-sm text-green-600">
              您的年度VIP会员已激活，请刷新页面查看会员内容
            </p>
            <Button 
              className="mt-4" 
              onClick={async () => {
                onOpenChange(false)
                await refreshMembership()
              }}
            >
              确定
            </Button>
          </div>
        ) : (
          <>
            {/* Payment Method */}
            <Tabs value={paymentMethod} onValueChange={setPaymentMethod}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="wechat">微信支付</TabsTrigger>
                <TabsTrigger value="alipay">支付宝</TabsTrigger>
              </TabsList>

              <TabsContent value="wechat" className="mt-4">
                <div className="flex flex-col items-center rounded-lg border p-6">
                  {paymentStatus === 'scanning' ? (
                    <div className="flex flex-col items-center">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="mt-4 text-sm text-muted-foreground">正在等待支付结果...</p>
                    </div>
                  ) : (
                    <>
                      <div className="relative h-48 w-48">
                        <Image
                          src={mockQRCode.wechat}
                          alt="微信支付二维码"
                          fill
                          className="rounded-lg object-cover"
                        />
                      </div>
                      <p className="mt-4 text-sm text-muted-foreground">
                        请使用微信扫一扫完成支付
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        剩余时间: <span className="font-mono text-primary">{formatCountdown(countdown)}</span>
                      </p>
                      {/* 模拟支付按钮（实际项目中应该通过轮询API检查支付状态） */}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={simulatePayment}
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        模拟已扫码支付
                      </Button>
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="alipay" className="mt-4">
                <div className="flex flex-col items-center rounded-lg border p-6">
                  {paymentStatus === 'scanning' ? (
                    <div className="flex flex-col items-center">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="mt-4 text-sm text-muted-foreground">正在等待支付结果...</p>
                    </div>
                  ) : (
                    <>
                      <div className="relative h-48 w-48">
                        <Image
                          src={mockQRCode.alipay}
                          alt="支付宝二维码"
                          fill
                          className="rounded-lg object-cover"
                        />
                      </div>
                      <p className="mt-4 text-sm text-muted-foreground">
                        请使用支付宝扫一扫完成支付
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        剩余时间: <span className="font-mono text-primary">{formatCountdown(countdown)}</span>
                      </p>
                      {/* 模拟支付按钮 */}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={simulatePayment}
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        模拟已扫码支付
                      </Button>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Refresh Button */}
            {countdown === 0 && (
              <Button 
                variant="outline" 
                className="w-full mt-4"
                onClick={resetPayment}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                重新生成二维码
              </Button>
            )}
          </>
        )}

        <p className="text-center text-xs text-muted-foreground">
          支付完成后，会员将在1-2分钟内自动激活
        </p>
      </DialogContent>
    </Dialog>
  )
}
