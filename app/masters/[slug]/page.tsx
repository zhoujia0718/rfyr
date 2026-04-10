"use client"

import { useParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { ArticleLayout } from "@/components/article-layout"
import { ArticleHtmlFullEmbed } from "@/components/article-html-full-embed"
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
    </>
  )
}
