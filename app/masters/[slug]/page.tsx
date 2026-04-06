"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { ArticleLayout } from "@/components/article-layout"
import { getArticleBySlugOrId, incrementReadingCount, getArticlesByCategory } from "@/lib/articles"
import { stripBorderStylesFromDocument } from "@/lib/article-html"
import { Loader2 } from "lucide-react"

export default function MasterArticlePage() {
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

        const articlesData = await getArticlesByCategory('大佬合集')
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
        if (categoryName === '大佬合集') {
          groupedArticles[categoryName].forEach(a => {
            items.push({
              title: a.title,
              href: `/masters/${a.short_id || a.id}`
            })
          })
        } else {
          // 如果是子分类，显示分类标题和文章
          items.push({
            title: categoryName,
            items: groupedArticles[categoryName].map(a => ({
              title: a.title,
              href: `/masters/${a.short_id || a.id}`
            }))
          })
        }
      })
    
    return items
  })()

  const breadcrumbs = [
    { title: "大佬合集", href: "/masters" },
    { title: article.title },
  ]

  const pdfFileName = (() => {
    const originalName = (article.pdf_original_name || '').trim()
    if (originalName) return originalName

    const url = (article.pdf_url || '').toString()
    if (!url) return 'PDF'

    // 去掉查询参数/锚点，并从最后一级路径提取文件名
    const clean = url.split('?')[0]?.split('#')[0]
    const parts = clean.split('/')
    return parts[parts.length - 1] || 'PDF'
  })()

  return (
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
    >
      {article.pdf_url && article.pdf_url.trim() !== '' && article.pdf_url.startsWith('http') ? (
        <div className="w-full mb-6">
          <div className="rounded-2xl border border-gray-200/70 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-primary/10 via-white to-secondary/10 border-b border-gray-200/70">
              <h4 className="m-0 text-base font-medium text-gray-900 text-center truncate">
                {pdfFileName}
              </h4>
              <p className="mt-1 text-xs text-gray-500 text-center">PDF 已上传（在线预览）</p>
            </div>

            <div className="w-full h-[78vh] min-h-[520px] bg-white overflow-hidden">
              <object
                data={`${article.pdf_url}#toolbar=0`}
                type="application/pdf"
                title="PDF Content"
                style={{
                  border: 'none',
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#ffffff',
                }}
              >
                {/* object 标签某些浏览器不支持时会显示此文本 */}
                <div style={{ padding: '1rem', color: '#6b7280' }}>PDF 预览加载中...</div>
              </object>
            </div>
          </div>
        </div>
      ) : (
        <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: renderedContent }} />
      )}
    </ArticleLayout>
  )
}
