"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { ArticleLayout } from "@/components/article-layout"
import { getArticleBySlugOrId, incrementReadingCount, getArticlesByCategory } from "@/lib/articles"
import { stripBorderStylesFromDocument } from "@/lib/article-html"
import { Loader2 } from "lucide-react"

export default function NoteArticlePage() {
  const params = useParams()
  const articleId = typeof params.slug === 'string' ? params.slug : ''
  const [article, setArticle] = React.useState<any>(null)
  const [articles, setArticles] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!articleId) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const loadArticle = async () => {
      try {
        const data = await getArticleBySlugOrId(articleId)

        if (cancelled) return
        if (!data) {
          setError('文章不存在')
          return
        }
        setArticle(data)
        void incrementReadingCount(data.id).catch(() => {})

        const articlesData = await getArticlesByCategory('短线笔记')
        if (!cancelled) setArticles(articlesData)
      } catch {
        if (!cancelled) setError('加载文章失败')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadArticle()
    return () => { cancelled = true }
  }, [articleId])

  const renderedContent = React.useMemo(() => {
    const raw = String(article?.content || '')
    if (!raw || typeof window === 'undefined') return raw
    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html')
      stripBorderStylesFromDocument(doc)
      return doc.body.innerHTML
    } catch {
      return raw
    }
  }, [article?.content])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{error || '文章不存在'}</h1>
          <p className="mt-4 text-muted-foreground">请检查文章链接是否正确</p>
        </div>
      </div>
    )
  }

  // 动态生成侧边栏链接，按分类管理中的子分类分组
  const sidebarItems = (() => {
    // 按分类分组文章
    const groupedArticles: Record<string, any[]> = {}
    
    articles.forEach(a => {
      const categoryName = a.category
      if (!groupedArticles[categoryName]) {
        groupedArticles[categoryName] = []
      }
      groupedArticles[categoryName].push(a)
    })
    
    // 生成侧边栏项目
    const items: any[] = []
    
    // 按分类名称排序
    Object.keys(groupedArticles)
      .sort()
      .forEach(categoryName => {
        // 如果分类名称与当前分类相同，直接显示文章
        if (categoryName === '短线笔记') {
          groupedArticles[categoryName].forEach(a => {
            items.push({
              title: a.title,
              href: `/notes/${a.short_id || a.id}`
            })
          })
        } else {
          // 如果是子分类，显示分类标题和文章
          items.push({
            title: categoryName,
            items: groupedArticles[categoryName].map(a => ({
              title: a.title,
              href: `/notes/${a.short_id || a.id}`
            }))
          })
        }
      })
    
    return items
  })()

  const breadcrumbs = [
    { title: "短线学习笔记", href: "/notes" },
    { title: article.title },
  ]

  return (
    <ArticleLayout
      sidebarItems={sidebarItems}
      sidebarTitle="短线学习笔记"
      tocItems={[]}
      breadcrumbs={breadcrumbs}
      articleTitle={article.title}
      isLocked={false}
      membershipType="yearly"
    >
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: renderedContent }} />
    </ArticleLayout>
  )
}
