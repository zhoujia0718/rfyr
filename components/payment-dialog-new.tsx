"use client"

import * as React from "react"
import { Upload, Check, AlertCircle, Loader2, CreditCard, Crown } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { resolveAppUserId } from "@/lib/app-user-id"
import { createPayment, uploadPaymentProof, generateOrderId } from "@/lib/payments"

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId?: string | null
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

export function PaymentDialog({ open, onOpenChange, planId }: PaymentDialogProps) {
  const [uploadStatus, setUploadStatus] = React.useState<UploadStatus>('idle')
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')
  const [isSubmitted, setIsSubmitted] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const dropZoneRef = React.useRef<HTMLDivElement>(null)

  const plans = {
    'weekly': {
      name: '周卡免费会员',
      price: 0,
      period: '7天',
      planType: 'weekly' as const
    },
    'yearly': {
      name: '年度VIP会员',
      price: 299,
      period: '365天',
      planType: 'yearly' as const
    }
  }

  const selectedPlan = planId ? plans[planId as keyof typeof plans] : plans.yearly

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('图片大小不能超过 5MB')
      return
    }

    setSelectedFile(file)
    setError('')

    const reader = new FileReader()
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('请先选择支付凭证图片')
      return
    }

    const uid = await resolveAppUserId()
    if (!uid) {
      setError('请先登录')
      return
    }

    setUploadStatus('uploading')
    setUploadProgress(0)
    setIsSubmitting(true)

    try {
      const orderId = generateOrderId()
      const proofUrl = await uploadPaymentProof(orderId, selectedFile)

      setUploadProgress(100)
      setUploadStatus('success')

      await createPayment({
        user_id: uid,
        order_id: orderId,
        amount: selectedPlan.price,
        plan_type: selectedPlan.planType,
        proof_url: proofUrl,
      })

      setIsSubmitted(true)
      setIsSubmitting(false)
      setTimeout(() => {
        onOpenChange(false)
        resetForm()
      }, 2000)
    } catch (err: unknown) {
      setUploadStatus('error')
      setError(err instanceof Error ? err.message : '上传失败')
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setUploadStatus('idle')
    setUploadProgress(0)
    setError('')
    setIsSubmitting(false)
    setIsSubmitted(false)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm()
      onOpenChange(open)
    }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            支付订单
          </DialogTitle>
          <DialogDescription>
            请扫码支付后上传凭证，我们会尽快审核
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {isSubmitted ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-green-200 bg-green-50 p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-green-800">提交成功</h3>
              <p className="mt-2 text-center text-sm text-green-600">
                我们会尽快审核您的支付凭证
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-secondary/30 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{selectedPlan.name}</h3>
                    <p className="text-sm text-muted-foreground">有效期：{selectedPlan.period}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-primary">
                      ¥{selectedPlan.price}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center space-y-4">
                <h4 className="text-sm font-medium">扫码支付</h4>
                <div className="w-64 h-64 flex items-center justify-center bg-white p-4 border border-border">
                  <img 
                    src="/payment-qr.jpg" 
                    alt="支付二维码" 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Crect width='256' height='256' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='16' fill='%23666'%3E支付二维码%3C/text%3E%3C/svg%3E"
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  支付完成后，请截图保存支付凭证
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">上传支付凭证</label>
                <div
                  ref={dropZoneRef}
                  className={`
                    relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors
                    ${uploadStatus === 'success' ? 'border-green-500 bg-green-50' : 'border-border hover:border-primary hover:bg-secondary/50'}
                  `}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileSelect(file)
                    }}
                  />

                  {previewUrl ? (
                    <div className="flex flex-col items-center space-y-4">
                      <img
                        src={previewUrl}
                        alt="支付凭证预览"
                        className="max-h-[300px] w-auto object-contain rounded-lg"
                      />
                      <p className="text-sm text-muted-foreground">点击更换图片</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center space-y-2 text-center">
                      <Upload className="h-12 w-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        点击或拖拽图片到此处上传
                      </p>
                      <p className="text-xs text-muted-foreground">
                        支持 JPG、PNG 格式，最大 5MB
                      </p>
                    </div>
                  )}

                  {uploadStatus === 'uploading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-lg">
                      <div className="flex flex-col items-center space-y-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">上传中... {uploadProgress}%</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              resetForm()
              onOpenChange(false)
            }}
            disabled={isSubmitting || isSubmitted}
          >
            取消
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || uploadStatus === 'uploading' || isSubmitting || isSubmitted}
            className="min-w-[120px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : uploadStatus === 'success' ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                已提交
              </>
            ) : (
              '提交审核'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
