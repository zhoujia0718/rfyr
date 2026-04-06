"use client"

import * as React from "react"
import { FileDown } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ArticleSidebar, type NavItem } from "@/components/article-sidebar"
import { TableOfContents } from "@/components/table-of-contents"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { Paywall } from "@/components/paywall"
import { UpgradeDialog } from "@/components/upgrade-dialog"
import dynamic from 'next/dynamic'
import { Button } from "@/components/ui/button"
import { useMembership } from "@/components/membership-provider"

const PdfDownloadDialog = dynamic(() => import('@/components/pdf-download-dialog').then((mod) => mod.PdfDownloadDialog), {
  ssr: false,
})

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
  isLocked?: boolean
  membershipType?: "none" | "weekly" | "yearly"
  showHeader?: boolean
  /** 锁定状态下是否自动弹出升级引导弹窗（首次访问弹一次） */
  autoShowUpgrade?: boolean
  pdfUrl?: string | null
  pdfFileName?: string
}

export function ArticleLayout({
  children,
  sidebarItems,
  sidebarTitle,
  tocItems,
  breadcrumbs,
  articleTitle,
  isLocked = false,
  membershipType = "none",
  showHeader = false,
  autoShowUpgrade = false,
  pdfUrl,
  pdfFileName,
}: ArticleLayoutProps) {
  const [paymentOpen, setPaymentOpen] = React.useState(false)
  const [downloadOpen, setDownloadOpen] = React.useState(false)
  const { hasAccess, isLoading, membershipType: ctxMembershipType } = useMembership()
  const canAccessLocked = hasAccess("stocks")

  // 锁定页面首次访问时弹出一次升级引导（用 sessionStorage 避免刷新重复弹）
  React.useEffect(() => {
    if (!autoShowUpgrade || !isLocked || canAccessLocked || isLoading) return
    const key = `upgrade_popup_${articleTitle}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1")
      // 稍等一下让页面渲染完成再弹
      const t = setTimeout(() => setPaymentOpen(true), 400)
      return () => clearTimeout(t)
    }
  }, [autoShowUpgrade, isLocked, canAccessLocked, isLoading, articleTitle])

  return (
    <div className="flex min-h-screen flex-col">
      {showHeader && <SiteHeader />}

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <ArticleSidebar items={sidebarItems} title={sidebarTitle} />

        <main className="flex flex-1">
          <article className="flex-1 px-4 py-6 lg:px-8">
            <div className="mb-6">
              <BreadcrumbNav items={breadcrumbs} />
            </div>

            <div className="mb-8 flex items-start justify-between">
              <h1 className="text-2xl font-bold text-foreground lg:text-3xl">
                {articleTitle}
              </h1>
              {ctxMembershipType === "yearly" && !isLocked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (isLoading) return
                    setDownloadOpen(true)
                  }}
                  disabled={isLoading}
                  className="hidden shrink-0 sm:inline-flex"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  下载 PDF
                </Button>
              )}
            </div>

            <div className="prose prose-neutral max-w-none">
              {isLocked ? (
                <Paywall
                  requiredPermission="stocks"
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
      <PdfDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        membershipType={ctxMembershipType}
        articleTitle={articleTitle}
        pdfUrl={pdfUrl}
        pdfFileName={pdfFileName}
      />
    </div>
  )
}
