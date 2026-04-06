"use client"

import * as React from "react"
import { Check, X, ZoomIn, CreditCard, AlertCircle, Loader2, Settings, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getPendingPayments, approvePaymentAtomic, Payment } from "@/lib/payments"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export default function VerifyPaymentsPage() {
  const [payments, setPayments] = React.useState<Payment[]>([])
  const [loading, setLoading] = React.useState(true)
  const [processing, setProcessing] = React.useState<string | null>(null)
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null)
  const [error, setError] = React.useState('')

  const loadPayments = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPendingPayments()
      setPayments(data)
    } catch (error: any) {
      setError(error.message || '加载支付记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadPayments()
  }, [loadPayments])

  const handleApprove = async (payment: Payment) => {
    setProcessing(payment.id)
    try {
      // 1. 先删除用户现有的所有会员记录（确保一个用户只有一个会员权限）
      const { error: deleteError } = await supabase
        .from('memberships')
        .delete()
        .eq('user_id', payment.user_id)
      
      if (deleteError) {
        console.warn('删除现有会员记录失败:', deleteError)
        // 继续执行，不中断流程
      }
      
      // 2. 执行原子化审核操作
      await approvePaymentAtomic(payment.id, payment.user_id)
      
      // 3. 生成会员结束时间
      const endDate = new Date()
      if (payment.plan_type === 'weekly') {
        endDate.setDate(endDate.getDate() + 8)
      } else {
        endDate.setFullYear(endDate.getFullYear() + 1)
        endDate.setDate(endDate.getDate() + 1)
      }
      
      // 4. 在 memberships 表中创建会员记录
      const { error: membershipError } = await supabase
        .from('memberships')
        .insert({
          user_id: payment.user_id,
          membership_type: payment.plan_type === 'weekly' ? 'weekly_vip' : 'annual_vip',
          start_date: new Date().toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          status: 'active'
        })
      
      if (membershipError) {
        console.warn('创建会员记录失败:', membershipError)
        // 继续执行，不中断流程
      }
      
      await loadPayments()
      setError('')
    } catch (error: any) {
      setError(error.message || '审核失败')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (paymentId: string) => {
    if (!confirm('确定要拒绝这个支付申请吗？')) {
      return
    }

    setProcessing(paymentId)
    try {
      const { error } = await supabase
        .from('payments')
        .update({ status: 'rejected' })
        .eq('id', paymentId)

      if (error) throw error

      await loadPayments()
      setError('')
    } catch (error: any) {
      setError(error.message || '拒绝失败')
    } finally {
      setProcessing(null)
    }
  }

  const getPlanTypeLabel = (planType: string) => {
    return planType === 'weekly' ? '周卡' : '年卡'
  }

  const getPlanTypeBadge = (planType: string) => {
    return planType === 'weekly' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">后台管理系统</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              设置
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.href = "/admin/login"}>
              <LogOut className="h-4 w-4 mr-2" />
              退出登录
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>支付审核</CardTitle>
            <CardDescription>审核用户提交的支付凭证，开通会员权限</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">暂无待审核的支付记录</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  当有新的支付申请时，会显示在这里
                </p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {payments.map((payment) => (
                  <Card key={payment.id} className="flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">
                            订单号：{payment.order_id}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {new Date(payment.created_at).toLocaleString('zh-CN')}
                          </CardDescription>
                        </div>
                        <Badge className={getPlanTypeBadge(payment.plan_type)}>
                          {getPlanTypeLabel(payment.plan_type)}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="flex flex-1 flex-col space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">用户ID：</span>
                          <span className="font-mono text-xs">{payment.user_id.substring(0, 8)}...</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">金额：</span>
                          <span className="font-semibold">¥{payment.amount}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">支付凭证</label>
                        <div
                          className="relative cursor-pointer rounded-lg border border-border overflow-hidden hover:border-primary transition-colors"
                          onClick={() => setSelectedImage(payment.proof_url)}
                        >
                          <img
                            src={payment.proof_url || ''}
                            alt="支付凭证"
                            className="h-48 w-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:opacity-100">
                            <ZoomIn className="h-8 w-8 text-white" />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">点击图片放大查看</p>
                      </div>

                      <div className="flex gap-2 mt-auto">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleReject(payment.id)}
                          disabled={processing === payment.id}
                        >
                          {processing === payment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <X className="mr-2 h-4 w-4" />
                              拒绝
                            </>
                          )}
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={() => handleApprove(payment)}
                          disabled={processing === payment.id}
                        >
                          {processing === payment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              确认开通
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 图片放大预览 */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>支付凭证预览</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-4">
            <img
              src={selectedImage || ''}
              alt="支付凭证"
              className="max-h-[70vh] w-auto object-contain rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
