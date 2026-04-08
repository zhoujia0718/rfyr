"use client"

import { useParams } from "next/navigation"
import { ArticleLayout } from "@/components/article-layout"
import { ArticleHtmlFullEmbed } from "@/components/article-html-full-embed"
import { Loader2, FileDown } from "lucide-react"
import { useArticleReader, useSanitizedArticleHtml } from "@/hooks/use-article-reader"

export default function MasterArticlePage() {
  const params = useParams()
  const articleId = typeof params.slug === "string" ? params.slug : ""
  const { article, articles, isLoading, isRefreshing, error } = useArticleReader(
    articleId,
    "大佬合集"
  )
  const renderedContent = useSanitizedArticleHtml(article?.content)

  if (isLoading && !article) {
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

    Object.keys(groupedArticles)
      .sort()
      .forEach((categoryName) => {
        if (categoryName === "大佬合集") {
          groupedArticles[categoryName].forEach((a) => {
            items.push({
              title: a.title,
              href: `/masters/${a.short_id || a.id}`,
            })
          })
        } else {
          items.push({
            title: categoryName,
            items: groupedArticles[categoryName].map((a) => ({
              title: a.title,
              href: `/masters/${a.short_id || a.id}`,
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

  const pdfFileName = (() => {
    const originalName = (article.pdf_original_name || "").trim()
    if (originalName) return originalName

    const url = (article.pdf_url || "").toString()
    if (!url) return "PDF"

    const clean = url.split("?")[0]?.split("#")[0]
    const parts = clean.split("/")
    return parts[parts.length - 1] || "PDF"
  })()

  return (
    <>
      {isRefreshing ? (
        <div
          className="pointer-events-none fixed left-0 right-0 top-0 z-[70] h-0.5 bg-primary/30"
          aria-hidden
        >
          <div className="h-full w-full origin-left animate-pulse bg-primary" />
        </div>
      ) : null}
      <ArticleLayout
        sidebarItems={sidebarItems}
        sidebarTitle="大佬合集"
        tocItems={[]}
        breadcrumbs={breadcrumbs}
        articleTitle={article.title}
        isLocked={false}
        membershipType="yearly"
        pdfUrl={article.pdf_url}
        pdfFileName={pdfFileName}
        hideArticleTitle={hasHtmlEmbed}
        suppressProse={hasHtmlEmbed}
      >
        {hasHtmlEmbed ? (
          <ArticleHtmlFullEmbed article={article} />
        ) : article.pdf_url && article.pdf_url.trim() !== '' && article.pdf_url.startsWith('http') ? (
          <div className="w-full mb-6">
            <div className="rounded-2xl border border-gray-200/70 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-primary/10 via-white to-secondary/10 border-b border-gray-200/70 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-medium text-gray-900 text-center truncate">{pdfFileName}</h4>
                  <p className="mt-0.5 text-xs text-gray-500 text-center">PDF 已上传（在线预览）</p>
                </div>
                <a
                  href={article.pdf_url}
                  download={article.pdf_original_name || pdfFileName}
                  className="ml-4 shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <FileDown className="h-4 w-4" />
                  下载 PDF
                </a>
              </div>
              <div className="w-full h-[78vh] min-h-[520px] bg-white overflow-hidden">
                <object
                  data={`${article.pdf_url}#toolbar=0`}
                  type="application/pdf"
                  title="PDF Content"
                  style={{
                    border: "none",
                    display: "block",
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <div style={{ padding: "1rem", color: "#6b7280" }}>PDF 预览加载中...</div>
                </object>
              </div>
            </div>
          </div>
        ) : (
          <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: renderedContent }} />
        )}
      </ArticleLayout>
    </>
  )
}
