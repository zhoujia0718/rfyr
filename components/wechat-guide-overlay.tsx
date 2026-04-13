"use client"

import * as React from "react"
import Link from "next/link"
import { Copy, Check, Crown, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { buildShareUrlWithReferrer } from "@/lib/referral-client"

export type WechatGuideOverlayMode = "require_login" | "quota_exhausted"

interface WechatGuideOverlayProps {
  /** 是否显示遮罩 */
  open: boolean
  /** require_login：未登录须先登录；quota_exhausted：已登录但免费篇数用完 */
  mode: WechatGuideOverlayMode
  /** 以下仅在 quota_exhausted 时使用 */
  readCount?: number
  maxCount?: number
  remaining?: number
  /** 关闭回调 */
  onClose?: () => void
  /** 是否禁止点击背景关闭 */
  forceLogin?: boolean
  /** 分享用邀请短码（referrer_codes.code），复制时写入 ?ref= */
  referralCode?: string | null
  /** 正在拉取邀请码 */
  referralShareLoading?: boolean
  /** 触发登录弹窗回调（由父组件注入） */
  onOpenLogin?: () => void
}

export function WechatGuideOverlay({
  open,
  mode,
  readCount = 0,
  maxCount = 0,
  remaining = 0,
  onClose,
  forceLogin = false,
  referralCode = null,
  referralShareLoading = false,
  onOpenLogin,
}: WechatGuideOverlayProps) {
  const [copied, setCopied] = React.useState(false)

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

  if (!open) return null

  const isLogin = mode === "require_login"

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={() => !forceLogin && onClose?.()} />

      <Card className="relative z-10 w-full max-w-md mx-4 shadow-2xl">
        <CardContent className="p-8">
          {/* 标题区 */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              {isLogin ? (
                <Mail className="h-8 w-8 text-primary" />
              ) : (
                <Crown className="h-8 w-8 text-primary" />
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {isLogin
                ? "请先登录后阅读"
                : `本期已读 ${readCount} / ${maxCount} 篇`}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {isLogin
                ? "登录账号后可开始阅读免费篇目，额度用完可升级会员或分享邀请好友解锁更多"
                : "免费篇数已用完。升级会员可提升阅读额度并享受对应栏目权益（详见会员页），也可分享好友邀请注册以解锁更多篇数"}
            </p>
          </div>

          {isLogin ? (
            <>
              <div className="flex flex-col items-center space-y-4 mb-6">
                <Button
                  size="lg"
                  className="w-full max-w-xs h-12 text-base font-semibold"
                  onClick={() => onOpenLogin?.()}
                >
                  <Mail className="mr-2 h-5 w-5" />
                  登录 / 注册
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  点击上方按钮，通过邮箱登录或注册新账号
                </p>
              </div>

              <div className="bg-muted/50 rounded-xl p-4 mb-6 space-y-2">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <p className="text-sm text-muted-foreground">输入邮箱、名称和密码，发送验证码</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <p className="text-sm text-muted-foreground">查收邮件，输入 6 位验证码完成注册</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <p className="text-sm text-muted-foreground">登录后可按规则阅读若干篇；额度用完后可升级会员或分享邀请好友解锁更多</p>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4 mb-6">
              <Button asChild className="w-full h-11 text-base font-semibold" size="lg">
                <Link href="/membership">
                  <Crown className="mr-2 h-5 w-5" />
                  开通会员 · 解锁更多权益
                </Link>
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                已用尽本期 {maxCount} 篇免费额度。会员权益以会员页说明为准；分享带邀请码链接，好友注册成功可 +1 篇/人
              </p>
            </div>
          )}

          {/* 邀请链接：仅已登录（额度弹窗）展示；未登录请先完成上方登录 */}
          {isLogin ? (
            <p className="text-xs text-center text-muted-foreground mb-6">
              完成登录后，在阅读页可复制<strong className="text-foreground">带您专属邀请码</strong>
              的链接；好友通过链接访问并注册后，可为您解锁更多阅读篇数。
            </p>
          ) : (
            <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-xl p-4 mb-6">
              <p className="text-sm font-medium text-center text-foreground mb-3">
                {referralShareLoading
                  ? "正在加载您的邀请码…"
                  : referralCode
                    ? "复制下方链接分享给好友（已附带您的邀请码），对方通过微信完成注册后会计入邀请"
                    : "暂时无法获取邀请码，请稍后在「会员中心」查看或完成登录后重试"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={referralShareLoading || !referralCode}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 border-dashed transition-all text-sm font-medium",
                    (referralShareLoading || !referralCode) && "opacity-50 cursor-not-allowed",
                    copied
                      ? "border-green-400 bg-green-50 text-green-700"
                      : "border-border hover:border-primary hover:bg-primary/5"
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      复制邀请链接（含 ref）
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {!forceLogin && onClose && (
            <div className="text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                返回上一页
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
