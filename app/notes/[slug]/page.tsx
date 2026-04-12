"use client"

import { useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { useArticleReader, useSanitizedArticleHtml } from "@/hooks/use-article-reader"
import { useReadingLimit } from "@/hooks/use-reading-limit"
import { ArticleLayout } from "@/components/article-layout"
import { ArticleHtmlFullEmbed } from "@/components/article-html-full-embed"
import { WechatGuideOverlay } from "@/components/wechat-guide-overlay"
import { LoginForm } from "@/components/auth/login-form"
import { resolveAuthenticatedUserId } from "@/lib/app-user-id"
import { fetchReferrerCodeByUserId } from "@/lib/referral-client"

const FREE_LIMIT = 3
const WEEKLY_LIMIT = 10

export default function NoteArticlePage() {
  const params = useParams()
  const articleId = typeof params.slug === "string" ? params.slug : ""

  const [showLogin, setShowLogin] = useState(false)

  const {
    isOverLimit,
    requiresLogin,
    isLoggedIn,
    isYearly,
    readCount,
    maxCount,
    remaining,
    isLoading: limitLoading,
    recordVisit,
  } = useReadingLimit()
  const { article, articles, isLoading, isRefreshing, error } = useArticleReader(articleId, "短线笔记")
  const renderedContent = useSanitizedArticleHtml(article?.content)
  const [referralShareLoading, setReferralShareLoading] = useState(true)
  const [referralShareCode, setReferralShareCode] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setReferralShareLoading(true)
      const uid = await resolveAuthenticatedUserId()
      console.log("[Referral] resolveAuthenticatedUserId 返回:", uid, "| cancelled:", cancelled)
      if (cancelled) return
      if (!uid) {
        console.log("[Referral] 未登录或 session 过期，跳过获取邀请码")
        setReferralShareCode(null)
        setReferralShareLoading(false)
        return
      }
      const code = await fetchReferrerCodeByUserId(uid)
      console.log("[Referral] fetchReferrerCodeByUserId 返回:", code)
      if (!cancelled) {
        setReferralShareCode(code)
        setReferralShareLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const recordVisitRef = useRef(recordVisit)
  recordVisitRef.current = recordVisit
  const recordVisitTriggerKey = `${articleId}:${limitLoading}:${article?.id ?? ""}:${isLoggedIn}:${isYearly}`
  useEffect(() => {
    if (!articleId || limitLoading || !article?.id) return
    if (!isLoggedIn || isYearly) return
    recordVisitRef.current(articleId)
  }, [recordVisitTriggerKey])

  if ((isLoading && !article) || limitLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !article) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{error}</h1>
          <p className="mt-4 text-muted-foreground">请检查文章链接是否正确</p>
        </div>
      </div>
    )
  }

  if (!article) {
    return null
  }

  const articleIndex = articles.findIndex(
    (a) => a.id === article.id || a.short_id === articleId
  )

  if (isYearly || (!requiresLogin && !isOverLimit)) {
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
      setShowLogin
    )
  }

  if (requiresLogin) {
    return buildArticlePage(
      article,
      articles,
      articleIndex,
      renderedContent,
      isRefreshing,
      { mode: "require_login" },
      null,
      false,
      showLogin,
      setShowLogin
    )
  }

  if (isOverLimit) {
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
      },
      referralShareCode,
      referralShareLoading,
      showLogin,
      setShowLogin
    )
  }

  return buildArticlePage(article, articles, articleIndex, renderedContent, isRefreshing, null, null, false, showLogin, setShowLogin)
}

// ─── 文章展示 ──────────────────────────────────────────────────────────────

function buildArticlePage(
  article: any,
  articles: any[],
  articleIndex: number,
  renderedContent: string,
  isRefreshing: boolean,
  limitInfo:
    | null
    | { mode: "require_login" }
    | { mode: "quota_exhausted"; readCount: number; maxCount: number; remaining: number },
  referralShareCode: string | null = null,
  referralShareLoading: boolean = false,
  showLogin?: boolean,
  setShowLogin?: (open: boolean) => void
) {
  const sidebarItems = buildSidebarItems(articles)
  const breadcrumbs = [
    { title: "短线学习笔记", href: "/notes" },
    { title: article.title },
  ]
  const hasHtmlEmbed = !!(article.html_url?.startsWith("http"))

  const articleContent = (
    <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: renderedContent }} />
  )

  return (
    <>
      {isRefreshing && <RefreshBar />}
      <ArticleLayout
        sidebarItems={sidebarItems}
        sidebarTitle="短线学习笔记"
        tocItems={[]}
        breadcrumbs={breadcrumbs}
        articleTitle={article.title}
        paywallPermission={null}
        paywallArticleIndex={articleIndex}
        paywallFreeLimit={FREE_LIMIT}
        paywallWeeklyLimit={WEEKLY_LIMIT}
        autoShowUpgrade={false}
        hideArticleTitle={hasHtmlEmbed}
        suppressProse={hasHtmlEmbed}
      >
        {hasHtmlEmbed ? <ArticleHtmlFullEmbed article={article} /> : articleContent}
      </ArticleLayout>

      {limitInfo && (
        <WechatGuideOverlay
          open={true}
          mode={limitInfo.mode}
          readCount={limitInfo.mode === "quota_exhausted" ? limitInfo.readCount : undefined}
          maxCount={limitInfo.mode === "quota_exhausted" ? limitInfo.maxCount : undefined}
          remaining={limitInfo.mode === "quota_exhausted" ? limitInfo.remaining : undefined}
          referralCode={limitInfo.mode === "quota_exhausted" ? referralShareCode : null}
          referralShareLoading={limitInfo.mode === "quota_exhausted" ? referralShareLoading : false}
          forceLogin
          onOpenLogin={() => setShowLogin?.(true)}
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

function buildSidebarItems(articles: any[]) {
  const grouped: Record<string, any[]> = {}
  articles.forEach((a) => {
    const cat = a.category || "未分类"
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(a)
  })

  const items: any[] = []
  Object.keys(grouped)
    .sort()
    .forEach((cat) => {
      if (cat === "短线笔记") {
        grouped[cat].forEach((a) =>
          items.push({ title: a.title, href: `/notes/${a.short_id || a.id}` })
        )
      } else {
        items.push({
          title: cat,
          items: grouped[cat].map((a) => ({
            title: a.title,
            href: `/notes/${a.short_id || a.id}`,
          })),
        })
      }
    })
  return items
}
