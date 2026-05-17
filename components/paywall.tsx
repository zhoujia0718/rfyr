"use client"

import * as React from "react"
import Link from "next/link"
import { FileText } from "lucide-react"
import { useMembership } from "@/components/membership-provider"
import { useReadingSettings } from "@/hooks/use-reading-settings"
import { useReadingLimit } from "@/hooks/use-reading-limit"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { MemberContentPermission } from "@/lib/membership"
import { MEMBER_TIERS } from "@/lib/member-tiers"
import {
  QuotaCalculator,
  DEFAULT_QUOTA,
} from "@/lib/quota-calculator"

interface PaywallProps {
  children: React.ReactNode
  requiredPermission: MemberContentPermission
  /** 当前可见条数，配合 freeLimit/monthlyLimit 判断是否超限（仅 notes 权限生效） */
  count?: number
  /** 已登录非会员可见的前 N 条 */
  freeLimit?: number
  /** 月卡可见的前 N 条 */
  monthlyLimit?: number
  title?: string
  description?: string
  onUpgradeClick?: () => void
  onDismiss?: () => void
  onLoginClick?: () => void
}

export function Paywall({
  children,
  requiredPermission,
  count,
  freeLimit,
  monthlyLimit,
  title,
  description,
  onUpgradeClick,
  onDismiss,
  onLoginClick,
}: PaywallProps) {
  const { membershipType, isLoading: membershipLoading } = useMembership()
  const { guest_read_limit, monthly_daily_limit } = useReadingSettings()
  const { totalReadCount, dailyReadCount, bonusCount, dailyBonusCount } = useReadingLimit()

  // P4 修复：使用 QuotaCalculator 统一计算配额
  // 直接传入各配置项，避免 DEFAULT_QUOTA as const 的只读类型冲突
  const quota = React.useMemo(() => {
    return new QuotaCalculator({
      tier: membershipType,
      quota: {
        totalReadCount,
        readIds: [],
        dailyReadCount,
        lastReadDate: null,
        bonusCount,
        dailyBonusCount,
        bonusResetDate: null,
      },
      guestReadLimit: guest_read_limit ?? DEFAULT_QUOTA.GUEST_READ_LIMIT,
      monthlyDailyLimit: monthly_daily_limit ?? DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT,
      referralBonusCount: DEFAULT_QUOTA.REFERRAL_BONUS_COUNT,
      referralDailyBonus: DEFAULT_QUOTA.REFERRAL_DAILY_BONUS,
      articleRequires: requiredPermission === "notes" ? "notes" : requiredPermission === "stocks" ? "yearly" : "monthly",
      articleCount: count,
      freeLimit,
      monthlyLimit,
    }).calculate()
  }, [membershipType, totalReadCount, dailyReadCount, bonusCount, dailyBonusCount,
      guest_read_limit, monthly_daily_limit, requiredPermission, count, freeLimit, monthlyLimit])

  // 会员状态加载中：暂时放行
  if (membershipLoading) {
    return <>{children}</>
  }

  if (quota.canRead) {
    return <>{children}</>
  }

  const upgradeTitle =
    title ||
    (requiredPermission === "notes"
      ? quota.reason === "daily_limit"
        ? "月卡今日阅读已满"
        : "免费阅读已到达上限"
      : requiredPermission === "stocks"
        ? "个股挖掘年度VIP专享"
        : "会员专享内容")

  const upgradeDescription =
    description ||
    (requiredPermission === "notes"
      ? membershipType === MEMBER_TIERS.NONE
        ? `您已免费阅读 ${quota.totalReadCount} 篇短线笔记，开通月卡会员可解锁更多，年度VIP可解锁全部内容`
        : `您今日已阅读 ${quota.dailyReadCount} 篇短线笔记，升级年度VIP可解锁全部内容`
      : requiredPermission === "stocks"
        ? "升级年度VIP会员，解锁深度个股研究报告和投资机会挖掘"
        : "开通会员解锁更多专业投资内容")

  return (
    <>
      <div className="relative after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-to-b after:from-transparent after:via-transparent after:to-muted/40 after:rounded-b-lg">
        {children}
      </div>
      <UpgradePromptCard
        open={true}
        onUpgrade={onUpgradeClick}
        onLogin={onLoginClick}
        onDismiss={onDismiss}
        title={upgradeTitle}
        description={upgradeDescription}
      />
    </>
  )
}

function UpgradePromptCard({
  open,
  onUpgrade,
  onLogin,
  onDismiss,
  title,
  description,
}: {
  open: boolean
  onUpgrade?: () => void
  onLogin?: () => void
  onDismiss?: () => void
  title: string
  description: string
}) {
  // 使用受控 Dialog + onOpenChange 处理关闭回调
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss?.() }}>
      <DialogContent
        className="sm:max-w-md gap-0 rounded-2xl border bg-background p-8 pt-10 shadow-xl"
        showCloseButton={!!onDismiss}
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold text-foreground leading-snug">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-3 text-base text-muted-foreground leading-relaxed">
            {description}
          </DialogDescription>
        </div>

        <div className="mt-8 flex w-full flex-col gap-3">
          {onLogin ? (
            <>
              <Button
                onClick={onLogin}
                className="h-11 w-full rounded-lg bg-[#2B57AC] text-base font-semibold text-white hover:bg-[#234a8f]"
              >
                登录 / 注册
              </Button>
              {onUpgrade && (
                <Button asChild variant="outline" className="h-11 w-full rounded-lg text-base font-medium">
                  <Link href="/membership">升级会员</Link>
                </Button>
              )}
            </>
          ) : onUpgrade ? (
            <Button asChild className="h-11 w-full rounded-lg bg-[#2B57AC] text-base font-semibold text-white hover:bg-[#234a8f]">
              <Link href="/membership">立即开通会员</Link>
            </Button>
          ) : null}
          {onDismiss ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-lg border-border bg-background text-base font-medium text-foreground hover:bg-muted"
              onClick={onDismiss}
            >
              稍后再说
            </Button>
          ) : (
            !onLogin && !onUpgrade && (
              <p className="text-center text-xs text-muted-foreground">
                月卡会员 30天体验 · 年度VIP 最佳性价比
              </p>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
