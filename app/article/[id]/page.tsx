"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { ArticleLayout } from "@/components/article-layout"
import { getArticleBySlugOrId, incrementReadingCount, getArticlesByCategory } from "@/lib/articles"
import { stripBorderStylesFromDocument } from "@/lib/article-html"
import { Loader2 } from "lucide-react"

export default function ArticlePage() {
  const params = useParams()
  const articleId = typeof params.id === 'string' ? params.id : ''
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

        const categoryArticles = await getArticlesByCategory(data.category)
        if (!cancelled) {
          setArticles(categoryArticles.filter((a: { id: string }) => a.id !== data.id))
        }
      } catch (err) {
        if (!cancelled) {
          setError('加载文章失败')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadArticle()
    return () => { cancelled = true }
  }, [articleId])

  const paywallPermission: null | "notes" | "stocks" =
    article?.category === "个股挖掘"
      ? "stocks"
      : article?.category === "短线笔记"
        ? "notes"
        : null

  // 在条件返回之前调用 useMemo
  const renderedContent = React.useMemo(() => {
    const raw = String(article?.content || '')
    if (!raw || typeof window === 'undefined') return raw
    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html')
      doc.querySelectorAll('img').forEach((img) => {
        const src = (img.getAttribute('src') || '').trim()
        if (!src) {
          img.remove()
          return
        }
        if (/^(file:|cid:|applewebdata:|blob:)/i.test(src)) {
          img.remove()
          return
        }
        if (/cdn\.nlark\.com|yuque\.com|larkoffice|feishu\.cn|larksuite/i.test(src)) {
          img.setAttribute('src', `/api/fetch-external-image?url=${encodeURIComponent(src)}`)
          img.setAttribute('referrerpolicy', 'no-referrer')
        }
      })
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">文章不存在</h1>
          <p className="text-gray-600">抱歉，您访问的文章不存在或已被删除</p>
        </div>
      </div>
    )
  }

  // 动态生成侧边栏链接
  const sidebarItems = (() => {
    // 按子分类分组文章
    const groupedArticles: Record<string, any[]> = {}
    
    articles.forEach((a: any) => {
      const subcategory = a.subcategory || '其他'
      if (!groupedArticles[subcategory]) {
        groupedArticles[subcategory] = []
      }
      groupedArticles[subcategory].push(a)
    })
    
    // 生成侧边栏项目
    const items: any[] = []
    
    // 按子分类名称排序
    Object.keys(groupedArticles)
      .sort()
      .forEach(subcategory => {
        if (subcategory === '其他' && groupedArticles[subcategory].length === articles.length) {
          // 如果没有子分类，直接显示文章列表
          groupedArticles[subcategory].forEach((a: any) => {
            items.push({
              title: a.title,
              href: `/article/${a.short_id || a.id}`
            })
          })
        } else {
          // 有子分类，显示分组
          items.push({
            title: subcategory,
            items: groupedArticles[subcategory].map((a: any) => ({
              title: a.title,
              href: `/article/${a.short_id || a.id}`
            }))
          })
        }
      })
    
    return items
  })()

  const breadcrumbs = [
    { title: article.category, href: `/${getCategoryPath(article.category)}` },
    { title: article.title },
  ]

  // 根据分类获取路径
  function getCategoryPath(category: string): string {
    const pathMap: Record<string, string> = {
      '个股挖掘': 'stocks',
      '短线笔记': 'notes',
      '大佬合集': 'masters',
      '投资日历': 'calendar',
    }
    return pathMap[category] || ''
  }

  return (
    <ArticleLayout
      sidebarItems={sidebarItems}
      sidebarTitle={article.category}
      tocItems={[]}
      breadcrumbs={breadcrumbs}
      articleTitle={article.title}
      paywallPermission={paywallPermission}
      autoShowUpgrade={paywallPermission === "stocks" || paywallPermission === "notes"}
      showHeader={false}
    >
      {/* 直接渲染PDF内容，不使用not-prose类，避免样式冲突 */}
      {article.pdf_url && article.pdf_url.trim() !== '' && article.pdf_url.startsWith('http') ? (
        <div style={{ 
          width: '100%', 
          marginBottom: '1rem'
        }}>
          <div style={{ 
            border: '1px solid #e5e7eb', 
            borderRadius: '0.375rem', 
            overflow: 'hidden', 
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ 
              padding: '1rem', 
              backgroundColor: '#f9fafb', 
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h4 style={{ 
                margin: 0, 
                fontSize: '1rem', 
                fontWeight: 500, 
                color: '#111827'
              }}>PDF 内容</h4>
            </div>
            <div style={{ width: '100%', height: '800px' }}>
              <iframe
                src={`${article.pdf_url}#toolbar=0`}
                width="100%"
                height="100%"
                style={{
                  border: 'none',
                  display: 'block'
                }}
                title="PDF Content"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : (
        <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: renderedContent }} />
      )}
    </ArticleLayout>
  )
}
