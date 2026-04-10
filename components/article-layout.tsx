"use client"

import * as React from "react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ArticleSidebar, type NavItem } from "@/components/article-sidebar"
import { TableOfContents } from "@/components/table-of-contents"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { Paywall } from "@/components/paywall"
import { UpgradeDialog } from "@/components/dialogs"
import { useMembership } from "@/components/membership-provider"
import { cn } from "@/lib/utils"
import { articlePageTitleClassName } from "@/lib/article-page-title"

interface TocItem {
  id: string
  title: string
  level: number
}

interface BreadcrumbItem {
  title: string
  href?: string
}

interface ArticleLayoutProps {
  children: React.ReactNode
  sidebarItems: NavItem[]
  sidebarTitle: string
  tocItems?: TocItem[]
  breadcrumbs: BreadcrumbItem[]
  articleTitle: string
  /**
   * 正文付费墙对应的权限键，与 lib/membership PERMISSIONS 一致。
   * null 表示不挡正文（如大佬合集）。
   */
  paywallPermission?: null | "notes" | "stocks"
  /** articles 中的当前文章索引（用于 notes 按篇数计上限） */
  paywallArticleIndex?: number
  paywallFreeLimit?: number
  paywallWeeklyLimit?: number
  showHeader?: boolean
  /** 锁定状态下是否自动弹出升级引导弹窗（首次访问弹一次） */
  autoShowUpgrade?: boolean
  /** HTML 外链全文嵌入时隐藏与正文重复的标题 */
  hideArticleTitle?: boolean
  /** 关闭 prose，避免影响 iframe 等嵌入内容 */
  suppressProse?: boolean
}

export function ArticleLayout({
  children,
  sidebarItems,
  sidebarTitle,
  tocItems,
  breadcrumbs,
  articleTitle,
  paywallPermission = null,
  paywallArticleIndex,
  paywallFreeLimit = 3,
  paywallWeeklyLimit = 10,
  showHeader = false,
  autoShowUpgrade = false,
  hideArticleTitle = false,
  suppressProse = false,
}: ArticleLayoutProps) {
  const [paymentOpen, setPaymentOpen] = React.useState(false)
  const { hasAccess, isLoading } = useMembership()
  const canAccessContent =
    !paywallPermission || hasAccess(paywallPermission)

  // 需付费墙且未开通时，首次访问弹一次升级引导
  React.useEffect(() => {
    if (!autoShowUpgrade || !paywallPermission || canAccessContent || isLoading) return
    const key = `upgrade_popup_${articleTitle}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1")
      const t = setTimeout(() => setPaymentOpen(true), 400)
      return () => clearTimeout(t)
    }
  }, [autoShowUpgrade, paywallPermission, canAccessContent, isLoading, articleTitle])

  return (
    <div
      className={cn(
        "flex flex-col",
        showHeader ? "min-h-screen" : "min-h-0 w-full flex-1"
      )}
    >
      {showHeader && <SiteHeader />}

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <ArticleSidebar items={sidebarItems} title={sidebarTitle} />

        <main className="flex flex-1">
          <article className="flex-1 px-4 py-6 lg:px-8">
            <div className="mb-6">
              <BreadcrumbNav items={breadcrumbs} />
            </div>

            {!hideArticleTitle ? (
              <div className="mb-8 sm:mb-10">
                {/* 居中标题：字号取上版与上上版之间；颜色用 Slate 700 (#334e68≈蓝灰)，比默认前景色更温暖柔和 */}
                <header className="mx-auto max-w-2xl px-2 text-center sm:px-6">
                  <h1 className={articlePageTitleClassName}>{articleTitle}</h1>
                  <div
                    className="mx-auto mt-3 h-px w-8 rounded-full bg-[#3d4f5f]/15 sm:mt-4 dark:bg-[#93c5fd]/30"
                    aria-hidden
                  />
                </header>
              </div>
            ) : null}

            <div
              className={
                suppressProse ? "max-w-none" : "prose prose-neutral max-w-none"
              }
            >
              {paywallPermission ? (
                <Paywall
                  requiredPermission={paywallPermission}
                  count={
                    paywallPermission === "notes" && paywallArticleIndex !== undefined
                      ? paywallArticleIndex
                      : undefined
                  }
                  freeLimit={paywallPermission === "notes" ? paywallFreeLimit : undefined}
                  weeklyLimit={paywallPermission === "notes" ? paywallWeeklyLimit : undefined}
                  onUpgradeClick={() => setPaymentOpen(true)}
                >
                  {children}
                </Paywall>
              ) : (
                children
              )}
            </div>
          </article>

          {tocItems && tocItems.length > 0 && <TableOfContents items={tocItems} />}
        </main>
      </div>

      {showHeader && <SiteFooter />}

      <UpgradeDialog open={paymentOpen} onOpenChange={setPaymentOpen} />
    </div>
  )
}
