"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, Calendar, ZoomIn, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export default function PortfolioDetailPage() {
  const params = useParams()
  const router = useRouter()
  const slug = typeof params.slug === "string" ? params.slug : ""

  const [record, setRecord] = React.useState<any>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [lightboxImg, setLightboxImg] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!slug) return
    setIsLoading(true)
    fetch(`/api/portfolio?short_id=${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("记录不存在")
        return r.json()
      })
      .then((d) => setRecord(d))
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false))
  }, [slug])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !record) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{error || "记录不存在"}</h1>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/portfolio")}>
            返回个人实盘
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* 顶部导航 */}
        <div className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-3xl px-4 py-3 lg:px-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 h-8"
                onClick={() => router.push("/portfolio")}
              >
                <ArrowLeft className="h-4 w-4" />
                个人实盘
              </Button>
              <span>/</span>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span className="font-medium text-foreground">{record.date}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
          {/* 标题 */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold">
              {record.title || `${record.date} 实盘记录`}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {record.date}
              {(record.images?.length || 0) > 0 && (
                <span className="ml-2">共 {record.images.length} 张截图</span>
              )}
            </p>
          </div>

          {/* 截图 */}
          {record.images?.length > 0 && (
            <Card className="mb-5">
              <CardContent className="p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {record.images.map((img: string, i: number) => (
                    <button
                      key={i}
                      type="button"
                      className="group relative overflow-hidden rounded-lg border bg-background text-left"
                      onClick={() => setLightboxImg(img)}
                    >
                      <img
                        src={img}
                        alt={`实盘截图 ${i + 1}`}
                        className="h-full w-full object-cover"
                        style={{ aspectRatio: "4 / 3" }}
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                        <ZoomIn className="h-7 w-7 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 正文 */}
          {record.content ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-base leading-8 whitespace-pre-wrap text-foreground/90">
                  {record.content}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-25" />
              <p className="text-lg font-medium">暂无内容</p>
              <p className="text-sm mt-1">这篇记录还没有写任何内容</p>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />

      {/* 图片灯箱 */}
      <Dialog open={!!lightboxImg} onOpenChange={() => setLightboxImg(null)}>
        <DialogContent className="max-w-5xl p-0 bg-transparent border-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>图片放大查看</DialogTitle>
          </DialogHeader>
          <div className="relative flex items-center justify-center">
            {lightboxImg && (
              <img
                src={lightboxImg}
                alt="放大查看"
                className="w-full rounded-lg"
                style={{ maxHeight: "90vh", objectFit: "contain" }}
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70 rounded-full"
              onClick={() => setLightboxImg(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
