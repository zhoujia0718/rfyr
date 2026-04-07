"use client"

import * as React from "react"
import type { Article } from "@/lib/articles"
import {
  getArticleBySlugOrId,
  getArticlesByCategory,
  incrementReadingCount,
} from "@/lib/articles"
import { stripBorderStylesFromDocument } from "@/lib/article-html"

/**
 * 文章详情：分类下列表只请求一次；同目录内切换 slug 时保留上一篇内容并显示 isRefreshing，避免整页白屏转圈。
 */
export function useArticleReader(articleId: string, categoryName: string) {
  const [article, setArticle] = React.useState<Article | null>(null)
  const [articles, setArticles] = React.useState<Article[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const seenRef = React.useRef(false)

  React.useEffect(() => {
    let cancelled = false
    getArticlesByCategory(categoryName)
      .then((data) => {
        if (!cancelled) setArticles(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setArticles([])
      })
    return () => {
      cancelled = true
    }
  }, [categoryName])

  React.useEffect(() => {
    if (!articleId) return
    let cancelled = false
    setError(null)
    const firstVisit = !seenRef.current
    if (firstVisit) setIsLoading(true)
    else setIsRefreshing(true)

    const run = async () => {
      try {
        const data = await getArticleBySlugOrId(articleId)
        if (cancelled) return
        if (!data) {
          setError("文章不存在")
          setArticle(null)
          seenRef.current = false
          return
        }
        setArticle(data)
        seenRef.current = true
        void incrementReadingCount(data.id).catch(() => {})
      } catch {
        if (cancelled) return
        if (firstVisit) {
          setError("加载文章失败")
          setArticle(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [articleId])

  return { article, articles, isLoading, isRefreshing, error }
}

export function useSanitizedArticleHtml(content: string | undefined) {
  return React.useMemo(() => {
    const raw = String(content || "")
    if (!raw || typeof window === "undefined") return raw
    try {
      const doc = new DOMParser().parseFromString(raw, "text/html")
      stripBorderStylesFromDocument(doc)
      return doc.body.innerHTML
    } catch {
      return raw
    }
  }, [content])
}
