"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2, Calendar, ChevronLeft, ChevronRight,
  FileText, Image as ImageIcon, BookOpen, Lightbulb,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getClientAuthHeadersAsync } from "@/lib/app-user-id"

type Tab = "portfolio" | "review" | "logic"

interface ArticleItem {
  id: string
  short_id?: string
  title: string
  publishdate?: string
}

export default function PortfolioPage() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get("tab") as Tab) ?? "portfolio"
  const [activeTab, setActiveTab] = React.useState<Tab>(initialTab)
  const [records, setRecords] = React.useState<any[]>([])
  const [reviewArticles, setReviewArticles] = React.useState<ArticleItem[]>([])
  const [logicArticles, setLogicArticles] = React.useState<ArticleItem[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [dataLoaded, setDataLoaded] = React.useState(false)
  const [currentPage, setCurrentPage] = React.useState(0)
  const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null)
  const [showWechatDialog, setShowWechatDialog] = React.useState(false)
  const [hasReviewAccess, setHasReviewAccess] = React.useState(false)
  const [accessExpiry, setAccessExpiry] = React.useState<string | null>(null)
  const PAGE_SIZE = 10

  // 检查权限 + 加载实盘记录
  const loadData = React.useCallback(async () => {
    setIsLoading(true)
    const authHeaders = await getClientAuthHeadersAsync()

    const [portfolioRes, accessRes] = await Promise.all([
      fetch("/api/portfolio"),
      fetch("/api/review-access", { headers: authHeaders }),
    ])

    const portfolioData = await portfolioRes.json()
    if (Array.isArray(portfolioData)) {
      setRecords(portfolioData.toSorted((a: any, b: any) => b.date.localeCompare(a.date)))
    }

    const accessData = await accessRes.json().catch(() => ({ hasAccess: false }))
    setHasReviewAccess(accessData.hasAccess === true)
    if (accessData.expiresAt) setAccessExpiry(accessData.expiresAt)

    // 有权限时预加载文章列表
    if (accessData.hasAccess) {
      const [reviewRes, logicRes] = await Promise.all([
        fetch("/api/articles?is_review=true", { headers: authHeaders }),
        fetch("/api/articles?category=%E4%B8%A5%E9%80%89%E9%80%BB%E8%BE%91", { headers: authHeaders }),
      ])
      const reviewData = await reviewRes.json().catch(() => [])
      const logicData = await logicRes.json().catch(() => [])
      if (Array.isArray(reviewData)) setReviewArticles(reviewData)
      if (Array.isArray(logicData)) setLogicArticles(logicData)
    }

    setIsLoading(false)
    setDataLoaded(true)
  }, [])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  // 登录后重新检查权限
  React.useEffect(() => {
    const handler = () => { void loadData() }
    window.addEventListener("rfyr:auth-refresh", handler)
    return () => window.removeEventListener("rfyr:auth-refresh", handler)
  }, [loadData])

  const portfolioTotalPages = Math.ceil(records.length / PAGE_SIZE)
  const reviewTotalPages = Math.ceil(reviewArticles.length / PAGE_SIZE)
  const logicTotalPages = Math.ceil(logicArticles.length / PAGE_SIZE)

  const totalPages =
    activeTab === "portfolio" ? portfolioTotalPages :
    activeTab === "review" ? reviewTotalPages : logicTotalPages

  const currentList =
    activeTab === "portfolio" ? records :
    activeTab === "review" ? reviewArticles : logicArticles

  const paged = currentList.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const goPrev = () => setCurrentPage((p) => Math.max(0, p - 1))
  const goNext = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))

  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return
    if ((tab === "review" || tab === "logic") && !hasReviewAccess) {
      setShowWechatDialog(true)
      return
    }
    setActiveTab(tab)
    setCurrentPage(0)
  }

  // 当从导航栏点击子链接时，URL search params 变化但组件不重新挂载，需手动同步。
  // 用 dataLoaded 而不是 isLoading 做门控：dataLoaded 只在首次加载完成后变为 true，
  // 之后 searchParams / hasReviewAccess 任何一个变化都会用最新值重新执行，无 stale closure。
  React.useEffect(() => {
    if (!dataLoaded) return
    const tab = (searchParams.get("tab") as Tab) ?? "portfolio"
    if ((tab === "review" || tab === "logic") && !hasReviewAccess) {
      setShowWechatDialog(true)
      return
    }
    if (tab !== activeTab) {
      setActiveTab(tab)
      setCurrentPage(0)
    }
  }, [searchParams, dataLoaded, hasReviewAccess]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-3xl px-4 py-10 text-center lg:px-8">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">个人实盘</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              记录每一次交易，见证复利的奇迹
            </p>
          </div>
        </section>

        {/* Tabs */}
        <section className="mx-auto max-w-3xl px-4 pt-6 pb-2 lg:px-8">
          <div className="flex gap-1 border-b border-border">
            <TabButton active={activeTab === "portfolio"} onClick={() => switchTab("portfolio")}>
              <LineChartIcon className="h-4 w-4" />
              实盘记录
            </TabButton>
            <TabButton active={activeTab === "review"} onClick={() => switchTab("review")} locked={!hasReviewAccess}>
              <BookOpen className="h-4 w-4" />
              每日复盘
            </TabButton>
            <TabButton active={activeTab === "logic"} onClick={() => switchTab("logic")} locked={!hasReviewAccess}>
              <Lightbulb className="h-4 w-4" />
              严选逻辑
            </TabButton>
          </div>

          {/* 权限到期提示 */}
          {hasReviewAccess && accessExpiry && (activeTab === "review" || activeTab === "logic") && (
            <p className="mt-2 text-xs text-muted-foreground text-right">
              权限到期：{new Date(accessExpiry).toLocaleDateString('zh-CN')}
            </p>
          )}
        </section>

        {/* Content */}
        <section className="mx-auto max-w-3xl px-4 pb-12 pt-4 lg:px-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : paged.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <FileText className="mb-4 h-14 w-14 text-muted-foreground opacity-25" />
              <p className="text-xl font-medium text-foreground">
                {activeTab === "portfolio" ? "暂无实盘记录" :
                 activeTab === "review" ? "暂无每日复盘" : "暂无严选逻辑"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">博主正在准备中，敬请期待</p>
            </div>
          ) : (
            <>
              <div className="mb-2 px-1">
                <span className="text-sm text-muted-foreground">共 {currentList.length} 条</span>
              </div>

              {/* 实盘记录 */}
              {activeTab === "portfolio" && (
                <div className="space-y-3">
                  {(paged as any[]).map((record) => (
                    <Card key={record.id} className="overflow-hidden transition-colors hover:border-primary/40 hover:shadow-sm">
                      <div className="block px-5 py-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex shrink-0 items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-bold">{record.date}</span>
                          </div>
                          {record.title && (
                            <span className="text-sm text-muted-foreground truncate">{record.title}</span>
                          )}
                          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                            <ImageIcon className="h-3.5 w-3.5" />
                            <span>{record.images?.length || 0}</span>
                          </div>
                        </div>
                      </div>

                      {(record.images?.length > 0 || record.content) && (
                        <CardContent className="border-t border-border/60 px-5 py-3 space-y-3">
                          {record.images?.length > 0 && (
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                className="h-16 w-24 overflow-hidden rounded-md border bg-background shrink-0 cursor-zoom-in"
                                onClick={() => setLightboxSrc(record.images[0])}
                              >
                                <img
                                  src={record.images[0]}
                                  alt={`${record.date} 截图`}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-foreground/90 font-medium leading-6">
                                  {record.content?.trim()
                                    ? record.content.length > 70 ? record.content.slice(0, 70) + "…" : record.content
                                    : "查看当日实盘截图"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  共 {record.images.length} 张截图 · 点缩略图放大
                                </p>
                              </div>
                            </div>
                          )}
                          {!record.images?.length && record.content && (
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {record.content.length > 160 ? record.content.slice(0, 160) + "…" : record.content}
                            </p>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}

              {/* 每日复盘 / 严选逻辑 文章列表 */}
              {(activeTab === "review" || activeTab === "logic") && (
                <div className="space-y-2">
                  {(paged as ArticleItem[]).map((article) => (
                    <Link
                      key={article.id}
                      href={`/article/${article.short_id || article.id}`}
                      className="flex items-center gap-3 rounded-lg border bg-white px-5 py-3.5 hover:border-primary/40 hover:shadow-sm transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm leading-snug text-foreground line-clamp-1">
                          {article.title}
                        </p>
                        {article.publishdate && (
                          <p className="text-xs text-muted-foreground mt-0.5">{article.publishdate}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Link>
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-4">
                  <Button variant="outline" size="sm" onClick={goPrev} disabled={currentPage === 0}>
                    <ChevronLeft className="h-4 w-4" />上一页
                  </Button>
                  <span className="text-sm text-muted-foreground">{currentPage + 1} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={goNext} disabled={currentPage >= totalPages - 1}>
                    下一页<ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <SiteFooter />

      {/* 图片灯箱 */}
      <Dialog open={!!lightboxSrc} onOpenChange={(open) => !open && setLightboxSrc(null)}>
        <DialogContent className="max-w-4xl p-4">
          <DialogHeader><DialogTitle className="text-base">图片查看</DialogTitle></DialogHeader>
          {lightboxSrc && (
            <img src={lightboxSrc} alt="实盘截图" className="w-full rounded-lg" style={{ maxHeight: "75vh", objectFit: "contain" }} />
          )}
        </DialogContent>
      </Dialog>

      {/* 微信联系弹窗 */}
      <Dialog open={showWechatDialog} onOpenChange={setShowWechatDialog}>
        <DialogContent className="sm:max-w-[340px] text-center">
          <DialogHeader>
            <DialogTitle className="text-lg text-center">联系开通权限</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            扫码添加微信，联系开通每日复盘 · 严选逻辑权限
          </p>
          <div className="flex justify-center">
            <img
              src="/qrcode/微信图片_20260328173325_3_11.png"
              alt="微信二维码"
              className="w-48 h-48 rounded-lg border object-contain"
            />
          </div>
          <Button className="mt-4 w-full" onClick={() => setShowWechatDialog(false)}>关闭</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TabButton({
  active, onClick, locked, children,
}: {
  active: boolean
  onClick: () => void
  locked?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 pb-3 text-sm font-medium transition-colors ${
        active
          ? "border-b-2 border-primary text-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {locked && <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">需授权</span>}
    </button>
  )
}

function LineChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
