"use client"

import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { ArticleLayout } from "@/components/article-layout"
import { ArticleHtmlFullEmbed } from "@/components/article-html-full-embed"
import { useArticleReader, useSanitizedArticleHtml } from "@/hooks/use-article-reader"
import { WechatGuideOverlay } from "@/components/wechat-guide-overlay"
import { LoginForm } from "@/components/auth/login-form"
import { resolveAuthenticatedUserId } from "@/lib/app-user-id"
import { fetchReferrerCodeByUserId } from "@/lib/referral-client"
import { useReadingLimit } from "@/hooks/use-reading-limit"
import { useReadingSettings } from "@/hooks/use-reading-settings"

export default function MasterArticlePage() {
  const params = useParams()
  const articleId = typeof params.slug === "string" ? params.slug : ""
  const { article, articles, isLoading, isRefreshing, error, requireLogin, membershipRequired, requiredLevel } = useArticleReader(
    articleId,
    "大佬合集"
  )
  const [showLogin, setShowLogin] = useState(false)
  const [quotaDismissed, setQuotaDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [referralShareLoading, setReferralShareLoading] = useState(true)
  const [referralShareCode, setReferralShareCode] = useState<string | null>(null)
  const renderedContent = useSanitizedArticleHtml(article?.content)

  const {
    readIds,
    todayReadIds,
    isMonthly,
    isYearly,
  } = useReadingLimit()
  const { show_read_progress } = useReadingSettings()
  const showReadStyles = isYearly ? show_read_progress : true

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setQuotaDismissed(false)
  }, [articleId, membershipRequired])

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
    return () => { cancelled = true }
  }, [])

  if (isLoading && !article) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !article) {
    return buildArticlePage(
      null,
      articles,
      -1,
      "",
      false,
      { mode: "membership_required" as const, requiredLevel: "monthly" },
      referralShareCode,
      referralShareLoading,
      showLogin,
      setShowLogin,
      quotaDismissed,
      setQuotaDismissed
    )
  }

  if (!article) {
    return null
  }

  const sidebarItems = (() => {
    const groupedArticles: Record<string, any[]> = {}

    articles.forEach((a) => {
      const categoryName = a.category
      if (!groupedArticles[categoryName]) {
        groupedArticles[categoryName] = []
      }
      groupedArticles[categoryName].push(a)
    })

    const items: any[] = []
    let articleIndexCounter = 0

    Object.keys(groupedArticles)
      .sort()
      .forEach((categoryName) => {
        if (categoryName === "大佬合集") {
          groupedArticles[categoryName].forEach((a) => {
            items.push({
              title: a.title.replace(/\s*[|｜]\s*\S+$/, ''),
              href: `/masters/${a.short_id || a.id}`,
              articleIndex: articleIndexCounter++,
              accessLevel: a.access_level || "free",
            })
          })
        } else {
          items.push({
            title: categoryName,
            items: groupedArticles[categoryName].map((a) => ({
              title: a.title.replace(/\s*[|｜]\s*\S+$/, ''),
              href: `/masters/${a.short_id || a.id}`,
              articleIndex: articleIndexCounter++,
              accessLevel: a.access_level || "free",
            })),
          })
        }
      })

    return items
  })()

  const breadcrumbs = [
    { title: "大佬合集", href: "/masters" },
    { title: article.title },
  ]

  const hasHtmlEmbed =
    !!(article.html_url && article.html_url.trim() !== "" && article.html_url.startsWith("http"))

  return (
    <>
      {isRefreshing && (
        <div className="pointer-events-none fixed left-0 right-0 top-0 z-[70] h-0.5 bg-primary/30">
          <div className="h-full w-full origin-left animate-pulse bg-primary" />
        </div>
      )}
      <ArticleLayout
        sidebarItems={sidebarItems}
        sidebarTitle="大佬合集"
        tocItems={[]}
        breadcrumbs={breadcrumbs}
        articleTitle={article.title}
        paywallPermission={null}
        hideArticleTitle={hasHtmlEmbed}
        suppressProse={hasHtmlEmbed}
      >
        {hasHtmlEmbed ? (
          <ArticleHtmlFullEmbed article={article} />
        ) : (
          <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: renderedContent }} />
        )}
      </ArticleLayout>

      {mounted && requireLogin && !quotaDismissed && (
        <WechatGuideOverlay
          open={true}
          mode="require_login"
          referralCode={referralShareCode}
          referralShareLoading={referralShareLoading}
          forceLogin={false}
          onOpenLogin={() => setShowLogin(true)}
          onClose={() => setQuotaDismissed(true)}
        />
      )}

      {mounted && membershipRequired && !quotaDismissed && !requireLogin && (
        <WechatGuideOverlay
          open={true}
          mode={requiredLevel ? "membership_required" : "require_login"}
          requiredLevel={requiredLevel ?? "monthly"}
          referralCode={referralShareCode}
          referralShareLoading={referralShareLoading}
          forceLogin={false}
          onOpenLogin={() => setShowLogin(true)}
          onClose={() => setQuotaDismissed(true)}
        />
      )}

      {showLogin !== undefined && setShowLogin && (
        <LoginForm open={showLogin} onOpenChange={setShowLogin} />
      )}
    </>
  )
}

// ─── 文章展示辅助函数 ─────────────────────────────────────────────────────────

type MasterLimitInfo =
  | { mode: "require_login" }
  | { mode: "quota_exhausted"; readCount: number; maxCount: number; remaining: number; bonusCount?: number; dailyBonusCount?: number; isMonthly?: boolean }
  | { mode: "membership_required"; requiredLevel: string }
  | null

function buildArticlePage(
  article: any,
  articles: any[],
  _articleIndex: number,
  renderedContent: string,
  isRefreshing: boolean,
  limitInfo: MasterLimitInfo,
  referralShareCode: string | null = null,
  referralShareLoading: boolean = false,
  showLogin?: boolean,
  setShowLogin?: (open: boolean) => void,
  quotaDismissed?: boolean,
  setQuotaDismissed?: (dismissed: boolean) => void
) {
  const groupedArticles: Record<string, any[]> = {}
  articles.forEach((a: any) => {
    const categoryName = a.category || "大佬合集"
    if (!groupedArticles[categoryName]) groupedArticles[categoryName] = []
    groupedArticles[categoryName].push(a)
  })
  const sidebarItems: any[] = []
  let articleIndexCounter = 0
  Object.keys(groupedArticles).sort().forEach((categoryName) => {
    if (categoryName === "大佬合集") {
      groupedArticles[categoryName].forEach((a: any) => {
        sidebarItems.push({
          title: a.title.replace(/\s*[|｜]\s*\S+$/, ''),
          href: `/masters/${a.short_id || a.id}`,
          articleIndex: articleIndexCounter++,
          accessLevel: a.access_level || "free",
        })
      })
    } else {
      sidebarItems.push({
        title: categoryName,
        items: groupedArticles[categoryName].map((a: any) => ({
          title: a.title.replace(/\s*[|｜]\s*\S+$/, ''),
          href: `/masters/${a.short_id || a.id}`,
          articleIndex: articleIndexCounter++,
          accessLevel: a.access_level || "free",
        })),
      })
    }
  })

  const breadcrumbs = article
    ? [{ title: "大佬合集", href: "/masters" }, { title: article.title?.replace(/\s*[|｜]\s*\S+$/, '') || "文章" }]
    : [{ title: "大佬合集", href: "/masters" }]

  const hasHtmlEmbed = !!(article?.html_url?.startsWith("http"))

  return (
    <>
      {isRefreshing && (
        <div className="pointer-events-none fixed left-0 right-0 top-0 z-[70] h-0.5 bg-primary/30">
          <div className="h-full w-full origin-left animate-pulse bg-primary" />
        </div>
      )}
      {article ? (
        <ArticleLayout
          sidebarItems={sidebarItems}
          sidebarTitle="大佬合集"
          tocItems={[]}
          breadcrumbs={breadcrumbs}
          articleTitle={article.title?.replace(/\s*[|｜]\s*\S+$/, '') || "文章"}
          paywallPermission={null}
          hideArticleTitle={hasHtmlEmbed}
          suppressProse={hasHtmlEmbed}
        >
          {hasHtmlEmbed ? (
            <ArticleHtmlFullEmbed article={article} />
          ) : (
            <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: renderedContent }} />
          )}
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
          forceLogin={false}
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
