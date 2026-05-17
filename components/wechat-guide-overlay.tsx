"use client"

import * as React from "react"
import Link from "next/link"
import { Copy, Check, Crown, Mail, Zap, Calendar, ChevronRight, Gift } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { buildShareUrlWithReferrer } from "@/lib/referral-client"

export type WechatGuideOverlayMode = "require_login" | "quota_exhausted" | "membership_required" | "daily_limit_exceeded" | "free_monthly_card"

interface WechatGuideOverlayProps {
  open: boolean
  mode: WechatGuideOverlayMode
  readCount?: number
  maxCount?: number
  /** 月卡每日基础限额（不含奖励） */
  baseDailyLimit?: number
  /** 月卡每日邀请奖励次数 */
  dailyBonusCount?: number
  /** 累计邀请奖励次数（一次性） */
  bonusCount?: number
  remaining?: number
  effectiveDailyLimit?: number
  requiredLevel?: string
  onClose?: () => void
  forceLogin?: boolean
  referralCode?: string | null
  referralShareLoading?: boolean
  onOpenLogin?: () => void
}

export function WechatGuideOverlay({
  open,
  mode,
  readCount = 0,
  maxCount = 0,
  baseDailyLimit,
  dailyBonusCount = 0,
  bonusCount = 0,
  remaining = 0,
  effectiveDailyLimit = 8,
  requiredLevel = "monthly",
  onClose,
  forceLogin = false,
  referralCode = null,
  referralShareLoading = false,
  onOpenLogin,
}: WechatGuideOverlayProps) {
  const [copied, setCopied] = React.useState(false)
  // 本地控制弹窗关闭
  const [dismissed, setDismissed] = React.useState(false)
  const isVisible = open && !dismissed

  const handleClose = () => {
    if (forceLogin) return
    setDismissed(true)
    onClose?.()
  }

  const isDismissible = !forceLogin

  const handleCopyLink = async () => {
    const base = window.location.href
    const url =
      referralCode && referralCode.trim() !== ""
        ? buildShareUrlWithReferrer(base, referralCode.trim())
        : base
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isLogin = mode === "require_login"
  const isMembershipRequired = mode === "membership_required"
  const isDailyLimitExceeded = mode === "daily_limit_exceeded"
  const isFreeMonthlyCard = mode === "free_monthly_card"

  const getTitle = () => {
    if (isFreeMonthlyCard) return "免费获取月卡"
    if (isLogin) return "登录后继续阅读"
    if (isMembershipRequired) return requiredLevel === "yearly" ? "年卡专属内容" : "开通会员继续阅读"
    if (isDailyLimitExceeded) return "今日阅读已达上限"
    return "免费篇数已用完"
  }

  const getSubtitle = () => {
    if (isFreeMonthlyCard) return "微信扫码添加好友，完成转发任务领取月卡"
    if (isLogin) return "登录后可阅读更多内容"
    if (isMembershipRequired) return requiredLevel === "yearly" ? "此文章需要年卡会员权限" : "升级会员享受专属权益"
    if (isDailyLimitExceeded) return "明天再来继续阅读"
    return "升级会员或邀请好友获取更多额度"
  }

  return (
    <Dialog open={isVisible} onOpenChange={isDismissible ? handleClose : undefined}>
      <DialogContent className="sm:max-w-[400px] p-0">
        {forceLogin && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 opacity-50 hover:opacity-100 transition-opacity z-10 cursor-pointer"
            aria-label="关闭"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
        <div className="p-6">
          <DialogTitle className="sr-only">{getTitle()}</DialogTitle>
          <div className="text-center mb-5">
            <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
              {isDailyLimitExceeded ? (
                <Calendar className="h-6 w-6 text-muted-foreground" />
              ) : isMembershipRequired && requiredLevel === "yearly" ? (
                <Crown className="h-6 w-6 text-amber-600" />
              ) : isFreeMonthlyCard ? (
                <Gift className="h-6 w-6 text-[#d97706]" />
              ) : isLogin ? (
                <Mail className="h-6 w-6 text-muted-foreground" />
              ) : (
                <Zap className="h-6 w-6 text-primary" />
              )}
            </div>
            <h2 className="text-lg font-semibold">{getTitle()}</h2>
            <p className="text-sm text-muted-foreground mt-1">{getSubtitle()}</p>
          </div>

          {isFreeMonthlyCard && (
            <div className="flex flex-col items-center gap-3 mb-4">
              <div className="w-48 h-48 rounded-xl overflow-hidden border border-[#d0d7de]/50 shadow-sm">
                <img
                  src="/qrcode/微信图片_20260328173325_3_11.png"
                  alt="微信二维码"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                微信扫码 → 完成转发任务 → 领取月卡
              </p>
            </div>
          )}

          {isDailyLimitExceeded && (
            <div className="bg-muted/50 rounded-lg p-3 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span>今日已读</span>
                <span className="font-medium">{readCount} / {maxCount} 篇</span>
              </div>
              {baseDailyLimit !== undefined && (
                <div className="flex justify-between text-xs text-muted-foreground pl-2">
                  <span>月卡基础 {baseDailyLimit} + 邀请奖励 {dailyBonusCount}</span>
                </div>
              )}
            </div>
          )}

          {mode === "quota_exhausted" && (
            <div className="bg-muted/50 rounded-lg p-3 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span>免费额度</span>
                <span className="font-medium">{readCount} / {maxCount} 篇</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pl-2">
                <span>基础额度 {maxCount - bonusCount - dailyBonusCount} + 邀请奖励 {bonusCount + dailyBonusCount}</span>
              </div>
            </div>
          )}

          {!isLogin && !isFreeMonthlyCard && (
            <div className="space-y-3">
              <Button asChild className="w-full">
                <Link href="/membership">
                  升级会员
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>

              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  {referralShareLoading
                    ? "加载中..."
                    : referralCode
                      ? "分享给好友，好友注册后解锁更多阅读"
                      : "邀请好友获取额外阅读额度"}
                </p>
                <button
                  type="button"
                  onClick={referralShareLoading ? undefined : handleCopyLink}
                  className={cn(
                    "inline-flex items-center gap-2 text-sm transition-colors disabled:opacity-50 disabled:no-underline",
                    referralShareLoading
                      ? "text-muted-foreground cursor-default"
                      : "text-primary hover:underline"
                  )}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "已复制" : referralShareLoading ? "加载中..." : "复制邀请链接"}
                </button>
              </div>
            </div>
          )}

          {isLogin && !isFreeMonthlyCard && (
            <Button onClick={() => onOpenLogin?.()} className="w-full">
              <Mail className="mr-2 h-4 w-4" />
              登录 / 注册
            </Button>
          )}

          {/* 仅可取消模式下显示"稍后再说" */}
          {isDismissible && (
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              稍后再说
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
