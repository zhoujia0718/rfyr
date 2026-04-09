"use client"

import * as React from "react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Calendar, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, X, BookOpen, Lock } from "lucide-react"
import Link from "next/link"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UpgradeDialog } from "@/components/dialogs"
import { useMembership } from "@/components/membership-provider"

type Tab = "portfolio" | "review"

/** 复盘正文可能是「纯文字 + 尾部 HTML 插图」，不能用 startsWith('<') 判断 */
function reviewContentHasHtml(s: string): boolean {
  return /<\s*[a-z][\s\S]*>/i.test(s)
}

/** 纯文本复盘：按空行分段，段内保留换行 */
function ReviewPlainBody({ text }: { text: string }) {
  const trimmed = text.trim()
  if (!trimmed) return null
  const blocks = trimmed.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const paragraphs = blocks.length > 0 ? blocks : [trimmed]
  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground">
      {paragraphs.map((para, i) => (
        <p key={i} className="whitespace-pre-wrap break-words">
          {para}
        </p>
      ))}
    </div>
  )
}

type LightboxState =
  | { kind: "portfolio"; src: string }
  | { kind: "review"; content: string; date?: string; title?: string }

export default function PortfolioPage() {
  const { membershipType } = useMembership()
  const [activeTab, setActiveTab] = React.useState<Tab>("portfolio")
  const [records, setRecords] = React.useState<any[]>([])
  const [reviews, setReviews] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [currentPage, setCurrentPage] = React.useState(0)
  const [lightbox, setLightbox] = React.useState<LightboxState | null>(null)
  const [paymentOpen, setPaymentOpen] = React.useState(false)
  const PAGE_SIZE = 10

  const isYearly = membershipType === "yearly"

  React.useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const [portfolioRes, reviewsRes] = await Promise.all([
          fetch("/api/portfolio"),
          isYearly ? fetch("/api/articles?is_review=true") : Promise.resolve(null),
        ])

        const portfolioData = await portfolioRes.json()
        if (Array.isArray(portfolioData)) {
          setRecords(portfolioData.sort((a: any, b: any) => b.date.localeCompare(a.date)))
        }

        if (reviewsRes) {
          const reviewsData = await reviewsRes.json()
          if (Array.isArray(reviewsData)) {
            setReviews(reviewsData.sort((a: any, b: any) => b.publishdate.localeCompare(a.publishdate)))
          }
        }
      } catch (err) {
        console.error("加载失败:", err)
      } finally {
        setIsLoading(false)
      }
    }
    void loadData()
  }, [membershipType])

  const reviewList = reviews
  const portfolioTotalPages = Math.ceil(records.length / PAGE_SIZE)
  const reviewTotalPages = Math.ceil(reviewList.length / PAGE_SIZE)
  const totalPages = activeTab === "portfolio" ? portfolioTotalPages : reviewTotalPages

  const currentData = activeTab === "portfolio" ? records : reviewList
  const paged = currentData.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const goPrev = () => setCurrentPage((p) => Math.max(0, p - 1))
  const goNext = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))

  // Switch tab → reset page
  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return
    if (tab === "review" && !isYearly) {
      setPaymentOpen(true)
      return
    }
    setActiveTab(tab)
    setCurrentPage(0)
  }

  const openReview = (review: any) => {
    if (!isYearly) {
      setPaymentOpen(true)
      return
    }
    setLightbox({
      kind: "review",
      content: review.content || "",
      date: review.publishdate,
      title: review.title,
    })
  }

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

        {/* Tab switcher */}
        <section className="mx-auto max-w-3xl px-4 pt-6 pb-2 lg:px-8">
          <div className="flex gap-1 border-b border-border">
            <button
              onClick={() => switchTab("portfolio")}
              className={`flex items-center gap-1.5 px-4 pb-3 text-sm font-medium transition-colors ${
                activeTab === "portfolio"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LineChartIcon className="h-4 w-4" />
              实盘记录
            </button>
            <button
              onClick={() => switchTab("review")}
              className={`flex items-center gap-1.5 px-4 pb-3 text-sm font-medium transition-colors ${
                activeTab === "review"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              每日复盘
              {!isYearly && <Lock className="h-3 w-3" />}
            </button>
          </div>
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
                {activeTab === "portfolio" ? "暂无实盘记录" : "暂无每日复盘"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeTab === "portfolio"
                  ? "博主正在准备中，敬请期待"
                  : isYearly
                  ? "年卡会员暂无复盘内容"
                  : "解锁年度VIP，查看每日复盘"}
              </p>
              {activeTab === "review" && !isYearly && (
                <Button className="mt-4" onClick={() => setPaymentOpen(true)}>
                  立即升级年度VIP
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm text-muted-foreground">
                  共 {currentData.length} 条记录
                </span>
                {activeTab === "review" && !isYearly && (
                  <Button variant="outline" size="sm" onClick={() => setPaymentOpen(true)}>
                    升级年卡查看全部
                  </Button>
                )}
              </div>

              {/* ── 实盘记录 ── */}
              {activeTab === "portfolio" && (
                <div className="space-y-3">
                  {paged.map((record) => {
                    const detailHref = record.short_id ? `/portfolio/${record.short_id}` : "#"
                    return (
                      <Card
                        key={record.id}
                        className="overflow-hidden transition-colors hover:border-primary/40 hover:shadow-sm"
                      >
                        <Link
                          href={detailHref}
                          className="block px-5 py-4 hover:bg-muted/20 transition-colors"
                          onClick={(e) => {
                            if (!record.short_id) e.preventDefault()
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex shrink-0 items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-bold">{record.date}</span>
                            </div>
                            {record.title && (
                              <span className="text-sm text-muted-foreground truncate">
                                {record.title}
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                              <ImageIcon className="h-3.5 w-3.5" />
                              <span>{record.images?.length || 0}</span>
                            </div>
                          </div>
                        </Link>

                        {(record.images?.length > 0 || record.content) && (
                          <CardContent className="border-t border-border/60 px-5 py-3 space-y-3">
                            {record.images?.length > 0 && (
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  className="h-16 w-24 overflow-hidden rounded-md border bg-background shrink-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() =>
                                    setLightbox({ kind: "portfolio", src: record.images[0] })
                                  }
                                  aria-label={`放大查看 ${record.date} 截图`}
                                >
                                  <img
                                    src={record.images[0]}
                                    alt={`${record.date} 截图`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                </button>
                                <Link
                                  href={detailHref}
                                  className="min-w-0 flex-1 rounded-md -m-1 p-1 hover:bg-muted/30 transition-colors"
                                  onClick={(e) => {
                                    if (!record.short_id) e.preventDefault()
                                  }}
                                >
                                  <p className="text-sm text-foreground/90 font-medium leading-6">
                                    {record.content?.trim()
                                      ? record.content.length > 70
                                        ? record.content.slice(0, 70) + "…"
                                        : record.content
                                      : "查看当日实盘截图"}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    共 {record.images.length} 张截图 · 点缩略图放大，点此处进详情
                                  </p>
                                </Link>
                              </div>
                            )}

                            {!record.images?.length && record.content && (
                              <Link
                                href={detailHref}
                                className="block rounded-md -m-1 p-1 hover:bg-muted/30 transition-colors"
                                onClick={(e) => {
                                  if (!record.short_id) e.preventDefault()
                                }}
                              >
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                  {record.content.length > 160
                                    ? record.content.slice(0, 160) + "…"
                                    : record.content}
                                </p>
                              </Link>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* ── 每日复盘 ── */}
              {activeTab === "review" && (
                <div className="space-y-3">
                  {paged.map((review) => {
                    const plainText = (review.content || "").replace(/<[^>]+>/g, "")
                    return (
                      <Card
                        key={review.id}
                        className="overflow-hidden transition-colors hover:border-amber-300 hover:shadow-sm"
                      >
                        <button
                          type="button"
                          className="w-full text-left px-5 py-4 hover:bg-muted/20 transition-colors"
                          onClick={() => openReview(review)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex shrink-0 items-center gap-2">
                              <BookOpen className="h-4 w-4 text-amber-500" />
                              <span className="text-sm font-bold">{review.publishdate}</span>
                            </div>
                            {review.title && (
                              <span className="text-sm text-muted-foreground truncate">
                                {review.title}
                              </span>
                            )}
                            <div className="ml-auto">
                              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                年卡专属
                              </span>
                            </div>
                          </div>
                          {plainText && (
                            <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-2 pl-0">
                              {plainText.slice(0, 120)}{plainText.length > 120 ? "…" : ""}
                            </p>
                          )}
                        </button>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goPrev}
                    disabled={currentPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一页
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {currentPage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goNext}
                    disabled={currentPage >= totalPages - 1}
                  >
                    下一页
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <SiteFooter />

      <UpgradeDialog open={paymentOpen} onOpenChange={setPaymentOpen} />

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-base">
              {lightbox?.kind === "review"
                ? lightbox.date
                  ? `${lightbox.date} 每日复盘`
                  : "每日复盘"
                : "图片查看"}
            </DialogTitle>
            {lightbox?.kind === "review" && lightbox.title && (
              <p className="text-sm text-muted-foreground font-normal">{lightbox.title}</p>
            )}
          </DialogHeader>
          {lightbox?.kind === "portfolio" && (
            <div className="mt-2">
              <img
                src={lightbox.src}
                alt="实盘截图"
                className="w-full rounded-lg"
                style={{ maxHeight: "75vh", objectFit: "contain" }}
              />
            </div>
          )}
          {lightbox?.kind === "review" && (
            <div className="mt-2">
              {reviewContentHasHtml(lightbox.content) ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none
                    whitespace-pre-line
                    [&_p]:mb-4 [&_p:last-child]:mb-0 [&_p]:leading-relaxed [&_p]:whitespace-pre-line
                    [&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:object-contain [&_img]:max-h-[75vh]"
                  dangerouslySetInnerHTML={{ __html: lightbox.content }}
                />
              ) : (
                <ReviewPlainBody text={lightbox.content} />
              )}
            </div>
          )}
          <div className="flex justify-end mt-4">
            <Button variant="outline" size="sm" onClick={() => setLightbox(null)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// 小图标组件（避免引入额外依赖）
function LineChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}