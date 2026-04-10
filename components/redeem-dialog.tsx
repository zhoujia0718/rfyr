"use client"

import * as React from "react"
import { KeyRound, Check, AlertCircle, Loader2, Gift, Crown } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { resolveAppUserId } from "@/lib/app-user-id"

interface RedeemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planType?: "weekly" | "yearly"
  onSuccess?: () => void
}

type RedeemStatus = "idle" | "loading" | "success" | "error"

const PLAN_INFO = {
  weekly: {
    name: "周卡会员",
    period: "7天",
    color: "#0969da",
    bg: "#eff8ff",
    border: "rgba(9,105,218,0.15)",
    Icon: Gift,
  },
  yearly: {
    name: "年度VIP",
    period: "365天",
    color: "#d97706",
    bg: "#fffbeb",
    border: "rgba(217,119,6,0.15)",
    Icon: Crown,
  },
}

export function RedeemDialog({ open, onOpenChange, planType = "yearly", onSuccess }: RedeemDialogProps) {
  const [code, setCode] = React.useState("")
  const [status, setStatus] = React.useState<RedeemStatus>("idle")
  const [message, setMessage] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const plan = PLAN_INFO[planType] || PLAN_INFO.yearly
  const PlanIcon = plan.Icon

  const handleRedeem = async () => {
    const trimmed = code.trim()
    if (!trimmed) {
      setStatus("error")
      setMessage("请输入兑换码")
      return
    }

    setStatus("loading")
    setMessage("")

    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      })

      const data = await res.json()

      if (data.success) {
        setStatus("success")
        const expiresDate = new Date(data.expiresAt).toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
        setMessage(`恭喜！您的${plan.name}已开通，有效期至 ${expiresDate}`)
        setTimeout(() => {
          onOpenChange(false)
          onSuccess?.()
        }, 3000)
      } else {
        setStatus("error")
        setMessage(data.message || "兑换失败，请检查兑换码是否正确")
      }
    } catch {
      setStatus("error")
      setMessage("网络异常，请稍后重试")
    }
  }

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setCode("")
      setStatus("idle")
      setMessage("")
    }
    onOpenChange(val)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && status !== "loading") {
      handleRedeem()
    }
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
    if (status === "error") {
      setStatus("idle")
      setMessage("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[440px] p-0 overflow-hidden"
        style={{ borderRadius: "16px" }}
      >
        {/* Top color accent */}
        <div className="h-1 w-full" style={{ background: plan.color }} />

        {/* Header */}
        <div className="px-8 pt-7 pb-0 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: plan.bg, border: `1px solid ${plan.border}` }}
          >
            <PlanIcon className="h-7 w-7" style={{ color: plan.color }} />
          </div>
          <DialogTitle className="text-xl font-bold text-[#1f2328]">
            开通{plan.name}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-[#656d76]">
            输入您手中的兑换码，立即开通 {plan.period} 会员权益
          </DialogDescription>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-4">
          {status === "error" && message && (
            <div
              className="flex items-center gap-2.5 rounded-xl px-4 py-3"
              style={{ background: "#fef2f2", border: "1px solid rgba(207,34,46,0.15)" }}
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-[#cf222e]" />
              <p className="text-sm text-[#cf222e]">{message}</p>
            </div>
          )}

          {status === "success" ? (
            <div
              className="flex flex-col items-center justify-center rounded-2xl py-10"
              style={{ background: "#f0fdf4", border: "1px solid rgba(26,127,55,0.15)" }}
            >
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: "#dcfce7" }}
              >
                <Check className="h-7 w-7 text-[#1a7f37]" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#1a7f37]">兑换成功</h3>
              <p className="mt-2 text-center text-sm text-[#166534] leading-relaxed px-2">
                {message}
              </p>
            </div>
          ) : (
            <>
              <div className="relative">
                <KeyRound
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8c959f]"
                />
                <Input
                  ref={inputRef}
                  value={code}
                  onChange={handleCodeChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`RFYR-${planType === "weekly" ? "WEEK" : "YEAR"}-XXXXXX`}
                  className="pl-11 pr-4 h-12 text-center text-base font-medium tracking-widest placeholder:text-center placeholder:text-[#8c959f]/70 bg-white border-[#d0d7de] focus-visible:ring-[2px] focus-visible:ring-[#0969da]/30 focus-visible:border-[#0969da]"
                  style={{ borderRadius: "10px" }}
                  disabled={status === "loading"}
                  autoFocus
                />
              </div>

              <p className="text-xs text-center text-[#8c959f]">
                格式：RFYR-{planType === "weekly" ? "WEEK" : "YEAR"}-六位字符
              </p>

              <Button
                size="lg"
                className="w-full h-11 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-60"
                style={{
                  background: plan.color,
                  borderRadius: "10px",
                  boxShadow: `0 4px 12px ${plan.color}30`,
                }}
                onClick={handleRedeem}
                disabled={status === "loading" || !code.trim()}
                onMouseEnter={(e) => {
                  if (!status) e.currentTarget.style.filter = "brightness(0.92)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = ""
                }}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    兑换中...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    立即兑换
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
