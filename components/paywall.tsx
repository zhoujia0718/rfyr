"use client"

import * as React from "react"
import Link from "next/link"
import { Lock, Crown, FileText, Download } from "lucide-react"
import { useMembership } from "@/components/membership-provider"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface PaywallProps {
  children: React.ReactNode
  requiredPermission: "calendar" | "masters" | "notes" | "stocks" | "pdfDownload"
  title?: string
  description?: string
  className?: string
  onUpgradeClick?: () => void
}

export function Paywall({
  children,
  requiredPermission,
  title,
  description,
  className,
  onUpgradeClick,
}: PaywallProps) {
  const { hasAccess, membershipType } = useMembership()
  const hasPermission = hasAccess(requiredPermission)

  // 根据权限类型显示不同的提示信息
  const getPaywallContent = () => {
    switch (requiredPermission) {
      case "notes":
        return {
          icon: <FileText className="h-12 w-12 text-primary" />,
          title: title || "短线笔记会员专享",
          description:
            description ||
            "开通周卡或年度会员，解锁全部短线交易笔记和实战案例分析",
        }
      case "stocks":
        return {
          icon: <Crown className="h-12 w-12 text-red-500" />,
          title: title || "个股挖掘年度VIP专享",
          description:
            description ||
            "升级年度VIP会员，解锁深度个股研究报告和投资机会挖掘",
        }
      case "pdfDownload":
        return {
          icon: <Download className="h-12 w-12 text-primary" />,
          title: title || "PDF下载年度VIP专属",
          description:
            description ||
            "升级年度VIP会员，下载大佬合集、短线笔记等PDF资料（含水印）",
        }
      default:
        return {
          icon: <Lock className="h-12 w-12 text-muted-foreground" />,
          title: title || "会员专享内容",
          description: description || "开通会员解锁更多专业投资内容",
        }
    }
  }

  const content = getPaywallContent()

  // 如果有权限，直接显示内容
  if (hasPermission) {
    return <>{children}</>
  }

  // 如果没有权限，显示付费墙
  return (
    <div className={cn("relative", className)}>
      {/* 模糊的内容预览 */}
      <div className="blur-sm pointer-events-none select-none opacity-50">
        {children}
      </div>

      {/* 付费墙遮罩 */}
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <Card className="mx-4 max-w-md w-full border-2 border-primary/20">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              {content.icon}
            </div>
            <CardTitle className="text-xl">{content.title}</CardTitle>
            <CardDescription className="text-base mt-2">
              {content.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={onUpgradeClick}
            >
              立即升级年度VIP
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              周卡会员 7天体验 · 年度VIP 最佳性价比
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// 简单的权限检查组件，不显示模糊预览
interface PermissionCheckProps {
  children: React.ReactNode
  requiredPermission: "calendar" | "masters" | "notes" | "stocks" | "pdfDownload"
  fallback?: React.ReactNode
}

export function PermissionCheck({
  children,
  requiredPermission,
  fallback,
}: PermissionCheckProps) {
  const { hasAccess } = useMembership()
  const hasPermission = hasAccess(requiredPermission)

  if (hasPermission) {
    return <>{children}</>
  }

  return <>{fallback || null}</>
}
