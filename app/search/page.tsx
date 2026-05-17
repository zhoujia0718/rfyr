"use client"

import * as React from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Search, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Skeleton } from "@/components/ui/skeleton"

interface SearchResult {
  id: string
  title: string
  content?: string
  summary?: string
  category?: string
  created_at: string
  thumbnail?: string
  short_id?: string
  access_level: string
}

/**
 * S-01 修复：转义 ilike 模式中的特殊字符
 * $ 和 \ 在 Supabase ilike 中有特殊含义，需要转义
 */
function escapeIlikePattern(input: string): string {
  return input.replace(/[$%_\\]/g, '\\$&')
}

/**
 * S-03 修复：HTML 转义搜索词，防止 XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (c) => map[c])
}

/**
 * S-04 修复：防抖 Hook
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value)
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

/**
 * S-02 修复：获取用户会员等级，返回访问级别层级
 * 'free'=0, 'monthly'=1, 'yearly'=2, 'permanent'=3
 */
function getAccessLevel(user: { vip_tier?: string } | null): number {
  const hierarchy: Record<string, number> = { free: 0, monthly: 1, yearly: 2, permanent: 3 }
  return hierarchy[user?.vip_tier || 'free'] ?? 0
}

/**
 * 访问级别层级映射
 * free: 只能看 free
 * monthly: 只能看 free + monthly
 * yearly: 只能看 free + monthly + yearly
 * permanent: 可以看全部
 */
const CATEGORY_PATHS: Record<string, string> = {
  "个股挖掘": "stocks",
  "短线笔记": "notes",
  "短线学习笔记": "notes",
  "大佬合集": "masters",
}

function getCategoryPath(category: string | undefined, slug: string): string {
  const section = CATEGORY_PATHS[category ?? ""] ?? "notes"
  return `/${section}/${slug}`
}

function canAccessByLevel(userLevel: number, articleLevel: string): boolean {
  const articleLevelMap: Record<string, number> = { free: 0, monthly: 1, yearly: 2, permanent: 3 }
  const articleRank = articleLevelMap[articleLevel] ?? 0
  return userLevel >= articleRank
}

function SearchPageContent() {
  const searchParams = useSearchParams()
  const rawQuery = searchParams.get("q") || ""

  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [totalCount, setTotalCount] = React.useState(0)
  const [hasSearched, setHasSearched] = React.useState(false)

  // S-02 修复：从 localStorage 获取用户会员等级
  const userLevel = React.useMemo(() => {
    if (typeof window === 'undefined') return 0
    try {
      const customAuth = localStorage.getItem('custom_auth')
      if (!customAuth) return 0
      const { user } = JSON.parse(customAuth)
      return getAccessLevel(user)
    } catch {
      return 0
    }
  }, [])

  // S-04 修复：300ms 防抖
  const debouncedQuery = useDebounce(rawQuery.trim(), 300)
  // S-03 修复：转义搜索词用于安全展示
  const safeDisplayQuery = escapeHtml(rawQuery)

  React.useEffect(() => {
    // S-06 修复：空搜索词直接返回，不发起请求
    if (!debouncedQuery) {
      setResults([])
      setTotalCount(0)
      setHasSearched(false)
      return
    }

    const performSearch = async () => {
      setIsLoading(true)
      try {
        // S-01 修复：转义搜索词特殊字符，防止 SQL 注入
        const escapedQuery = escapeIlikePattern(debouncedQuery)
        const pattern = `%${escapedQuery}%`

        const { data, error, count } = await supabase
          .from('articles')
          .select('id, short_id, title, category, created_at, access_level', { count: 'exact' })
          .or(`title.ilike.${pattern},content.ilike.${pattern}`)
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) {
          console.error('搜索失败:', error)
          return
        }

        // S-02 修复：根据用户会员等级过滤搜索结果
        const filtered = (data || []).filter((article: SearchResult) =>
          canAccessByLevel(userLevel, article.access_level || 'free')
        )

        setResults(filtered)
        setTotalCount(count || 0)
        setHasSearched(true)
      } catch (error) {
        console.error('搜索出错:', error)
      } finally {
        setIsLoading(false)
      }
    }

    performSearch()
  }, [debouncedQuery, userLevel])

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  // 获取摘要
  const getExcerpt = (content: string, maxLength: number = 120) => {
    // 去除HTML标签
    const plainText = content.replace(/<[^>]+>/g, '')
    if (plainText.length <= maxLength) return plainText
    return plainText.substring(0, maxLength) + '...'
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
          {/* 搜索统计 - S-03 修复：搜索词已 HTML 转义 */}
          {hasSearched && (
            <div className="mb-8">
              <h1 className="text-lg text-gray-600">
                为您找到 <span style={{ color: '#1E40AF' }} className="font-bold" dangerouslySetInnerHTML={{ __html: `&ldquo;${safeDisplayQuery}&rdquo;` }}></span> 相关结果 <span className="font-bold">{totalCount}</span> 个
              </h1>
            </div>
          )}

          {/* 加载状态 */}
          {isLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div 
                  key={i} 
                  className="bg-white rounded-xl p-6"
                  style={{ border: '1px solid #E2E8F0' }}
                >
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 搜索结果 */}
          {!isLoading && results.length > 0 && (
            <div className="space-y-4">
              {results.map((article) => (
                <Link 
                  key={article.id}
                  href={getCategoryPath(article.category, article.short_id || article.id)}
                  className="block bg-white rounded-xl transition-shadow duration-200 hover:shadow-lg"
                  style={{ border: '1px solid #E2E8F0' }}
                >
                  <div className="p-6">
                    <div>
                      {/* 文字内容 */}
                      <div className="min-w-0">
                        {/* 标题和分类 */}
                        <div className="flex items-center gap-3 mb-2 relative">
                          <h2
                            className="text-base line-clamp-1"
                            style={{ color: '#1F2937' }}
                          >
                            {article.title}
                          </h2>
                          {article.access_level === 'yearly' && (
                            <span className="absolute -top-4 left-0 text-[10px] font-medium" style={{ color: '#D97706', opacity: 0.6 }}>年卡</span>
                          )}
                          {article.access_level === 'monthly' && (
                            <span className="absolute -top-4 left-0 text-[10px] font-medium" style={{ color: '#F87171', opacity: 0.6 }}>月卡</span>
                          )}
                          <span 
                            className="text-xs font-medium px-2 py-0.5 rounded flex-shrink-0"
                            style={{ 
                              backgroundColor: '#FEF2F2', 
                              color: '#EF4444' 
                            }}
                          >
                            {article.category || '投资资讯'}
                          </span>
                        </div>
                        <p 
                          className="text-sm line-clamp-2 mb-3"
                          style={{ color: '#64748B' }}
                        >
                          {article.category || '投资资讯'}
                        </p>
                        
                        {/* 页脚信息 - 只显示日期 */}
                        <div className="flex items-center justify-end">
                          <span 
                            className="text-xs"
                            style={{ color: '#94A3B8' }}
                          >
                            {formatDate(article.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* 空状态 */}
          {!isLoading && hasSearched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <div 
                className="h-20 w-20 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: '#F1F5F9' }}
              >
                <Search className="h-10 w-10" style={{ color: '#94A3B8' }} />
              </div>
              <p style={{ color: '#64748B' }} className="text-base">
                暂无相关投资资讯，请尝试其他关键词
              </p>
            </div>
          )}

          {/* 无搜索词状态 */}
          {!hasSearched && !isLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div 
                className="h-20 w-20 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: '#F1F5F9' }}
              >
                <Search className="h-10 w-10" style={{ color: '#94A3B8' }} />
              </div>
              <p style={{ color: '#64748B' }} className="text-base">
                请输入关键词搜索投资资讯
              </p>
            </div>
          )}
        </div>
    </main>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[50vh] flex-1 items-center justify-center px-4 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  )
}
