"use client"

import Link from "next/link"
import * as React from "react"
import { BookOpen, Loader2, ArrowRight, ArrowDown } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Paywall } from "@/components/paywall"
import { PDFDownloadButton } from "@/components/pdf-download-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getArticlesByCategory, initArticlesTable } from "@/lib/articles"

// 短线笔记分类信息
const category = {
  id: "notes",
  name: "短线笔记",
  icon: "📝",
  description: "技术分析与实战复盘",
  href: "/notes"
}

export default function NotesPage() {
  const [articles, setArticles] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const loadArticles = async () => {
      try {
        // 直接获取文章数据，不需要每次都初始化表
        const data = await getArticlesByCategory("短线笔记")
        setArticles(data)
        // 缓存数据到localStorage，减少重复请求
        localStorage.setItem('notesArticles', JSON.stringify(data))
      } catch (error) {
        console.error('Error loading articles:', error)
        // 加载失败时尝试从缓存获取
        const cachedData = localStorage.getItem('notesArticles')
        if (cachedData) {
          setArticles(JSON.parse(cachedData))
        }
      } finally {
        setIsLoading(false)
      }
    }
    
    // 先尝试从缓存获取数据
    const cachedData = localStorage.getItem('notesArticles')
    if (cachedData) {
      setArticles(JSON.parse(cachedData))
      setIsLoading(false)
    } else {
      // 缓存不存在时从API获取
      loadArticles()
    }
  }, [])

  const notesCollectionPdf = React.useMemo(() => {
    const withPdf = articles.find(
      (a: { pdf_url?: string | null }) => a.pdf_url && String(a.pdf_url).trim() !== ""
    )
    if (!withPdf?.pdf_url) return { url: null as string | null, fileName: undefined as string | undefined }
    const name =
      (withPdf.title && `${String(withPdf.title).replace(/[/\\?%*:|"<>]/g, "-")}.pdf`) ||
      "短线学习笔记合集.pdf"
    return { url: withPdf.pdf_url as string, fileName: name }
  }, [articles])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      
      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground md:text-3xl">
                  短线学习笔记
                </h1>
                <p className="mt-2 text-muted-foreground">
                  技术分析与实战复盘，提升交易能力
                </p>
              </div>
              <PDFDownloadButton
                articleId="notes-collection"
                articleTitle="短线学习笔记合集"
                pdfUrl={notesCollectionPdf.url}
                pdfFileName={notesCollectionPdf.fileName}
                variant="outline"
                size="default"
              />
            </div>
          </div>
        </section>

        {/* Notes Categories with Paywall */}
        <Paywall requiredPermission="notes">
          <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <div className="grid gap-6 md:grid-cols-1">
              {category && (
                <Card key={category.id} className="group overflow-hidden transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <BookOpen className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                    </div>
                    <Link
                      href="/notes/all"
                      className="flex items-center gap-1 text-sm text-primary transition-opacity hover:opacity-100 cursor-pointer hover:underline z-10 relative"
                      style={{ position: 'relative', zIndex: 10 }}
                    >
                      更多
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2" style={{ paddingLeft: '20px' }}>
                      {isLoading ? (
                        <li className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </li>
                      ) : articles.length > 0 ? (
                        articles.map((article, index) => (
                          <li key={article.id} style={{ marginLeft: '20px' }}>
                            <Link
                              href={`${category.href}/${article.short_id || article.id}`}
                              className="flex items-center justify-between hover:text-primary py-2"
                            >
                              <span className="line-clamp-1 text-sm">{article.title}</span>
                              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{article.publishDate}</span>
                            </Link>
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-muted-foreground">暂无文章</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
        </Paywall>
      </main>

      <SiteFooter />
    </div>
  )
}
