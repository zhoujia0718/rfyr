"use client"

import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useArticleReader, useSanitizedArticleHtml } from "@/hooks/use-article-reader"
import { useReadingLimit } from "@/hooks/use-reading-limit"
import { ArticleLayout } from "@/components/article-layout"
import type { NavItem } from "@/components/article-sidebar"
import { ArticleHtmlFullEmbed } from "@/components/article-html-full-embed"
import { WechatGuideOverlay } from "@/components/wechat-guide-overlay"
import { LoginForm } from "@/components/auth/login-form"
import { resolveAuthenticatedUserId } from "@/lib/app-user-id"
import { fetchReferrerCodeByUserId } from "@/lib/referral-client"
import { useReadingSettings } from "@/hooks/use-reading-settings"

export default function NoteArticlePage() {
  const params = useParams()
  const articleId = typeof params.slug === "string" ? params.slug : ""
  const { guest_read_limit, monthly_daily_limit } = useReadingSettings()

  const [showLogin, setShowLogin] = useState(false)
  const [mounted, setMounted] = useState(false)

  const {
    isOverLimit,
    requiresLogin,
    isLoggedIn,
    isMonthly,
    isYearly,
    readCount,
    maxCount,
    remaining,
    bonusCount,
    dailyBonusCount,
    isLoading: limitLoading,
  } = useReadingLimit()

  const {
    article,
    articles,
    isLoading,
    isRefreshing,
    error,
    membershipRequired,
    requiredLevel,
    dailyLimitExceeded,
    dailyLimitData,
    guestLimitExceeded,
    guestReadCount,
    guestLimit,
  } = useArticleReader(articleId, "短线笔记")

  const [referralShareLoading, setReferralShareLoading] = useState(true)
  const [referralShareCode, setReferralShareCode] = useState<string | null>(null)
  const [dailyLimitDismissed, setDailyLimitDismissed] = useState(false)
  const [quotaDismissed, setQuotaDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setReferralShareLoading(true)
      const uid = await resolveAuthenticatedUserId()
      if (cancelled) return
      if (!uid) {
        setReferralShareCode(null)
        setReferralShareLoading(false)
        return
      }
      const code = await fetchReferrerCodeByUserId(uid)
      if (!cancelled) {
        setReferralShareCode(code)
        setReferralShareLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const renderedContent = useSanitizedArticleHtml(article?.content)

  // 切换文章时重置弹窗 dismiss 状态
  useEffect(() => {
    setDailyLimitDismissed(false)
    setQuotaDismissed(false)
  }, [articleId])

  useEffect(() => {
    setMounted(true)
  }, [])

  if ((isLoading && !article) || limitLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !article) {
    // 根据实际登录状态决定弹窗类型
    const isLoggedIn = (() => {
      if (typeof window === "undefined") return false
      try {
        const raw = localStorage.getItem("custom_auth")
        if (!raw) return false
        const authData = JSON.parse(raw)
        return !!(authData.loginTime && authData.loginTime > 0 && authData.user?.id)
      } catch { return false }
    })()
    return buildArticlePage(
      null,
      articles,
      -1,
      "",
      false,
      isLoggedIn
        ? { mode: "membership_required" as const, requiredLevel: "monthly" }
        : { mode: "require_login" as const },
      null,
      false,
      showLogin,
      setShowLogin,
      guest_read_limit,
      monthly_daily_limit,
      quotaDismissed,
      setQuotaDismissed
    )
  }

  if (!article) {
    return null
  }

  const articleIndex = articles.findIndex(
    (a) => a.id === article.id || a.short_id === articleId
  )

  // ── 未登录：显示文章 + 弹窗引导登录，可关闭
  // ── 已登录但免费额度超限（服务端返回 LIMIT_EXCEEDED）: 显示 quota_exhausted
  if (guestLimitExceeded && !quotaDismissed) {
    const remaining = Math.max(0, (guestLimit + (bonusCount || 0)) - guestReadCount)
    return buildArticlePage(
      article,
      articles,
      articleIndex,
      renderedContent,
      isRefreshing,
      {
        mode: "quota_exhausted",
        readCount: guestReadCount,
        maxCount: guestLimit,
        remaining,
        bonusCount: bonusCount || 0,
        dailyBonusCount: dailyBonusCount || 0,
        isMonthly: false,
      },
      referralShareCode,
      referralShareLoading,
      showLogin,
      setShowLogin,
      guest_read_limit,
      monthly_daily_limit,
      quotaDismissed,
      setQuotaDismissed
    )
  }

  // ── 未登录：显示文章 + 弹窗引导登录，可关闭
  if (requiresLogin && !quotaDismissed) {
    return (
      <>
        {buildArticlePage(
          article,
          articles,
          articleIndex,
          renderedContent,
          isRefreshing,
          null,
          null,
          false,
          showLogin,
          setShowLogin,
          guest_read_limit,
          monthly_daily_limit,
          false,
          undefined
        )}
        <WechatGuideOverlay
          open={!quotaDismissed}
          mode="require_login"
          forceLogin={false}
          onOpenLogin={() => setShowLogin?.(true)}
          onClose={() => setQuotaDismissed(true)}
        />
      </>
    )
  }

  // ── 会员权限不足 ──
  // 显示文章内容 + 弹窗引导升级年卡，可关闭
  // 注意：必须排除未登录状态（requiresLogin=true），登录弹窗优先
  if (membershipRequired && !requiresLogin && !quotaDismissed) {
    return (
      <>
        {buildArticlePage(
          article,
          articles,
          articleIndex,
          renderedContent,
          isRefreshing,
          null,
          null,
          false,
          showLogin,
          setShowLogin,
          guest_read_limit,
          monthly_daily_limit,
          true,
          undefined
        )}
        <WechatGuideOverlay
          open={!quotaDismissed}
          mode="membership_required"
          requiredLevel={requiredLevel || "monthly"}
          forceLogin={false}
          onOpenLogin={() => setShowLogin?.(true)}
          onClose={() => setQuotaDismissed(true)}
        />
      </>
    )
  }

  // ── 年卡：无限制，正常显示 ──
  if (isYearly) {
    return buildArticlePage(
      article,
      articles,
      articleIndex,
      renderedContent,
      isRefreshing,
      null,
      null,
      false,
      showLogin,
      setShowLogin,
      guest_read_limit,
      monthly_daily_limit,
      false,
      undefined
    )
  }

  // ── 月卡每日限制超限 ──
  const showDailyLimitPopup = dailyLimitExceeded && !dailyLimitDismissed
  if (showDailyLimitPopup) {
    return (
      <>
        {buildArticlePage(
          article,
          articles,
          articleIndex,
          renderedContent,
          isRefreshing,
          null,
          referralShareCode,
          referralShareLoading,
          showLogin,
          setShowLogin,
          guest_read_limit,
          monthly_daily_limit,
          false,
          undefined
        )}
        <WechatGuideOverlay
          open={!dailyLimitDismissed}
          mode="daily_limit_exceeded"
          readCount={dailyLimitData?.dailyReadCount ?? 0}
          maxCount={dailyLimitData?.effectiveDailyLimit ?? 8}
          baseDailyLimit={monthly_daily_limit}
          dailyBonusCount={dailyBonusCount}
          referralCode={referralShareCode}
          referralShareLoading={referralShareLoading}
          onClose={() => setDailyLimitDismissed(true)}
          onOpenLogin={() => setShowLogin?.(true)}
        />
        {showLogin !== undefined && setShowLogin && (
          <LoginForm open={showLogin} onOpenChange={setShowLogin} />
        )}
      </>
    )
  }

  // ── 已登录但超限 ──
  if (isOverLimit && !quotaDismissed) {
    return buildArticlePage(
      article,
      articles,
      articleIndex,
      renderedContent,
      isRefreshing,
      {
        mode: "quota_exhausted",
        readCount,
        maxCount,
        remaining,
        bonusCount,
        dailyBonusCount,
        isMonthly,
      },
      referralShareCode,
      referralShareLoading,
      showLogin,
      setShowLogin,
      guest_read_limit,
      monthly_daily_limit,
      quotaDismissed,
      setQuotaDismissed
    )
  }

  return buildArticlePage(article, articles, articleIndex, renderedContent, isRefreshing, null, null, false, showLogin, setShowLogin, guest_read_limit, monthly_daily_limit, false, undefined)
}

// ─── 文章展示 ──────────────────────────────────────────────────────────────

function buildArticlePage(
  article: any,
  articles: any[],
  articleIndex: number,
  renderedContent: string,
  isRefreshing: boolean,
  limitInfo: { mode: "require_login" } | { mode: "quota_exhausted"; readCount: number; maxCount: number; remaining: number; bonusCount?: number; dailyBonusCount?: number; isMonthly?: boolean } | { mode: "membership_required"; requiredLevel: string } | null,
  referralShareCode: string | null = null,
  referralShareLoading: boolean = false,
  showLogin?: boolean,
  setShowLogin?: (open: boolean) => void,
  guestReadLimit: number = 3,
  monthlyDailyLimit: number = 8,
  quotaDismissed?: boolean,
  setQuotaDismissed?: (dismissed: boolean) => void
) {
  const sidebarItems = buildSidebarItems(articles, articleIndex)
  const breadcrumbs = [
    { title: "短线学习笔记", href: "/notes" },
    { title: article?.title?.replace(/\s*[|｜]\s*\S+$/, '') || "文章" },
  ]
  const effectivePermission = quotaDismissed ? null : limitInfo ? "notes" : null
  const hasHtmlEmbed = !!(article?.html_url?.startsWith("http"))

  const openLogin = () => window.dispatchEvent(new Event("rfyr:show-login"))

  const articleContent = article ? (
    <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: renderedContent }} />
  ) : null

  return (
    <>
      {isRefreshing && <RefreshBar />}
      {article ? (
        <ArticleLayout
          sidebarItems={sidebarItems}
          sidebarTitle="短线学习笔记"
          tocItems={[]}
          breadcrumbs={breadcrumbs}
          articleTitle={article.title?.replace(/\s*[|｜]\s*\S+$/, '') || "文章"}
          paywallPermission={limitInfo && !quotaDismissed ? null : effectivePermission}
          paywallArticleIndex={articleIndex}
          paywallFreeLimit={guestReadLimit}
          paywallMonthlyLimit={monthlyDailyLimit}
          autoShowUpgrade={false}
          hideArticleTitle={hasHtmlEmbed}
          suppressProse={hasHtmlEmbed}
          onLoginRequired={openLogin}
        >
          {hasHtmlEmbed ? <ArticleHtmlFullEmbed article={article} /> : articleContent}
        </ArticleLayout>
      ) : (
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {limitInfo && !quotaDismissed && (
        <WechatGuideOverlay
          open={true}
          mode={limitInfo.mode}
          readCount={limitInfo.mode === "quota_exhausted" ? limitInfo.readCount : undefined}
          maxCount={limitInfo.mode === "quota_exhausted" ? limitInfo.maxCount : undefined}
          remaining={limitInfo.mode === "quota_exhausted" ? limitInfo.remaining : undefined}
          bonusCount={limitInfo.mode === "quota_exhausted" ? (limitInfo.bonusCount ?? 0) : undefined}
          dailyBonusCount={limitInfo.mode === "quota_exhausted" ? (limitInfo.dailyBonusCount ?? 0) : undefined}
          requiredLevel={limitInfo.mode === "membership_required" ? limitInfo.requiredLevel : undefined}
          referralCode={limitInfo.mode === "quota_exhausted" ? referralShareCode : null}
          referralShareLoading={limitInfo.mode === "quota_exhausted" ? referralShareLoading : false}
          forceLogin={limitInfo.mode !== "quota_exhausted"}
          onOpenLogin={() => setShowLogin?.(true)}
          onClose={() => setQuotaDismissed?.(true)}
        />
      )}

      {showLogin !== undefined && setShowLogin && (
        <LoginForm open={showLogin} onOpenChange={setShowLogin} />
      )}
    </>
  )
}

// ─── 刷新进度条 ──────────────────────────────────────────────────────────

function RefreshBar() {
  return (
    <div className="pointer-events-none fixed left-0 right-0 top-0 z-[70] h-0.5 bg-primary/30">
      <div className="h-full w-full origin-left animate-pulse bg-primary" />
    </div>
  )
}

// ─── 侧边栏 ─────────────────────────────────────────────────────────────

function buildSidebarItems(articles: any[], currentArticleIndex: number) {
  const grouped: Record<string, any[]> = {}
  articles.forEach((a, idx) => {
    const cat = a.category || "未分类"
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push({ ...a, _idx: idx })
  })

  const items: NavItem[] = []
  Object.keys(grouped)
    .sort()
    .forEach((cat) => {
      if (cat === "短线笔记") {
        grouped[cat].forEach((a) =>
          items.push({
            title: a.title.replace(/\s*[\｜|]\s*\S+$/, ''),
            href: `/notes/${a.short_id || a.id}`,
            articleId: a.id,
            articleShortId: a.short_id,
            articleIndex: a._idx,
            accessLevel: a.access_level || "free",
          })
        )
      } else {
        items.push({
          title: cat,
          items: grouped[cat].map((a) => ({
            title: a.title.replace(/\s*[\｜|]\s*\S+$/, ''),
            href: `/notes/${a.short_id || a.id}`,
            articleId: a.id,
            articleShortId: a.short_id,
            articleIndex: a._idx,
            accessLevel: a.access_level || "free",
          })),
        })
      }
    })
  return items
}
