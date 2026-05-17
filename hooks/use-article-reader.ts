"use client"

import * as React from "react"
import type { Article } from "@/lib/articles"
import { getArticlesByCategory } from "@/lib/articles"
import { resolveAppUserId } from "@/lib/app-user-id"
import { stripBorderStylesFromDocument } from "@/lib/article-html"

// ─── 新增：服务端强制的游客阅读限制接口 ──────────────────────────────────

export interface ArticleContentResponse {
  /** 文章内容（HTML 字符串） */
  content?: string
  /** 文章标题 */
  title?: string
  /** 外链 HTML URL（如果使用嵌入模式） */
  html_url?: string | null
  /** 文章 ID */
  articleId?: string
  /** 访问类型：user=已登录用户，guest=游客，monthly=月卡会员 */
  accessType?: "user" | "guest" | "monthly"
  /** 当前已读篇数（终身） */
  readCount?: number
  /** 今日已读篇数（月卡） */
  dailyReadCount?: number
  /** 阅读上限 */
  limit?: number
  /** 错误信息 */
  error?: string
  /** 错误码 */
  code?: string
  /** 需要的会员等级（仅会员权限不足时返回） */
  requiredLevel?: string
  /** 月卡每日有效上限 */
  effectiveDailyLimit?: number
  /** 邀请奖励阅读次数（非会员） */
  bonusCount?: number
  /** 每日邀请奖励次数（会员） */
  dailyBonusCount?: number
  /** 累积已读文章 ID 列表（终身） */
  readIds?: string[]
  /** 当日已读文章 ID 列表 */
  todayReadIds?: string[]
}

/**
 * 通过服务端 API 获取文章内容
 * 服务端会强制执行游客阅读限制
 */
async function fetchArticleContent(articleId: string): Promise<ArticleContentResponse> {
  try {
    const uid = await resolveAppUserId()
    const headers: Record<string, string> = { "Content-Type": "application/json" }

    if (uid) {
      headers["X-User-Id"] = uid
      const customAuth = localStorage.getItem("custom_auth")
      if (customAuth) {
        try {
          const authData = JSON.parse(customAuth)
          // session.access_token：admin login、cookie 登录写入；fakeToken：统一存在此字段
          const token = authData.fakeToken || authData.session?.access_token
          if (token) {
            headers["Authorization"] = `Bearer ${token}`
          }
        } catch { /* ignore */ }
      }
    }

    const res = await fetch(`/api/articles/${encodeURIComponent(articleId)}`, { headers })
    const data: ArticleContentResponse = {}
    if (!res.ok) {
      let msg = `请求失败 (${res.status})`
      try {
        const errData = await res.json()
        if (errData?.message) {
          msg = errData.message
        } else if (errData?.error) {
          msg = errData.error
        }
        if (errData?.code) data.code = errData.code
        if (errData?.readCount !== undefined) data.readCount = errData.readCount
        if (errData?.dailyReadCount !== undefined) data.dailyReadCount = errData.dailyReadCount
        if (errData?.limit !== undefined) data.limit = errData.limit
        if (errData?.effectiveDailyLimit !== undefined) data.effectiveDailyLimit = errData.effectiveDailyLimit
        if (errData?.requiredLevel) data.requiredLevel = errData.requiredLevel
        if (errData?.articleId) data.articleId = errData.articleId
        if (errData?.title) data.title = errData.title
        if (errData?.html_url !== undefined) data.html_url = errData.html_url
        if (errData?.bonusCount !== undefined) data.bonusCount = errData.bonusCount
        if (errData?.dailyBonusCount !== undefined) data.dailyBonusCount = errData.dailyBonusCount
      } catch { /* ignore */ }
      data.error = msg
      // 对于已由代码处理的错误类型，不触发 React Error Boundary，改用 warn
      const handledCodes = ["REQUIRE_LOGIN", "LIMIT_EXCEEDED", "YEARLY_REQUIRED", "MEMBERSHIP_REQUIRED", "DAILY_LIMIT_EXCEEDED"]
      if (data.code && handledCodes.includes(data.code)) {
        console.warn("[ArticleContent] API handled error:", data.code, data.error)
      } else {
        console.error("[ArticleContent] API 错误:", res.status, data.error)
      }
      return data
    }

    const jsonData = await res.json()
    return jsonData
  } catch (err) {
    // 区分网络错误和 JSON 解析错误
    const isSyntaxError = err instanceof SyntaxError || (err && (err as Error).name === "SyntaxError")
    if (isSyntaxError) {
      return { error: "服务器响应格式错误，请稍后重试" }
    }
    return { error: "网络错误，请稍后重试" }
  }
}

// ─── 文章详情 Hook ────────────────────────────────────────────────────────

interface UseArticleReaderOptions {
  /** 是否启用服务端强制限制（默认 true） */
  enforceServerLimit?: boolean
}

/**
 * 文章详情：优先通过服务端 API 获取内容（强制执行阅读限制）
 * 
 * 流程：
 * 1. 获取文章列表（用于侧边栏导航）
 * 2. 通过服务端 API 获取文章内容（已登录用户直接返回；游客强制限制）
 * 3. 同目录内切换 slug 时保留内容并显示刷新状态
 */
export function useArticleReader(
  articleId: string,
  categoryName: string,
  options: UseArticleReaderOptions = {}
) {
  const { enforceServerLimit = true } = options
  
  const [article, setArticle] = React.useState<Article | null>(null)
  const [articles, setArticles] = React.useState<Article[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  
// 游客阅读限制状态
  const [guestLimitExceeded, setGuestLimitExceeded] = React.useState(false)
  const [guestReadCount, setGuestReadCount] = React.useState(0)
  const [guestLimit, setGuestLimit] = React.useState(3)

  // 会员权限不足状态（null=未确定, false=已登录但无限制, true=权限不足需升级）
  const [membershipRequired, setMembershipRequired] = React.useState<boolean | null>(null)
  const [requiredLevel, setRequiredLevel] = React.useState<string | null>(null)
  // 需要登录状态（用于区分：session 过期但 localStorage 中还有 token）
  const [requireLogin, setRequireLogin] = React.useState(false)

  // 月卡每日限制超限状态
  const [dailyLimitExceeded, setDailyLimitExceeded] = React.useState(false)
  // 合并数据状态：先更新数据（弹窗立即可见），再更新 exceeded 标志触发弹窗
  const [dailyLimitData, setDailyLimitData] = React.useState<{
    dailyReadCount: number
    effectiveDailyLimit: number
  } | null>(null)
  // 正常阅读路径的每日配额（DAILY_LIMIT_EXCEEDED 时不需要）
  const [dailyReadCount, setDailyReadCount] = React.useState(0)
  const [effectiveDailyLimit, setEffectiveDailyLimit] = React.useState(8)

  const seenRef = React.useRef(false)
  const [refreshToken, setRefreshToken] = React.useState(0)

  // 登录成功时强制刷新文章（监听 auth-context 触发的 rfyr:auth-refresh 事件）
  React.useEffect(() => {
    const handler = () => {
      seenRef.current = false
      setArticle(null)
      setError(null)
      setMembershipRequired(null)
      setRequireLogin(false)
      setGuestLimitExceeded(false)
      setRefreshToken(t => t + 1)  // 触发 fetch effect 重新执行
    }
    window.addEventListener("rfyr:auth-refresh", handler)
    return () => window.removeEventListener("rfyr:auth-refresh", handler)
  }, [])

  // 获取文章列表（用于侧边栏）
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

  // 获取文章内容（通过服务端 API）
  React.useEffect(() => {
    if (!articleId) return

    let cancelled = false
    setError(null)

    const firstVisit = !seenRef.current
    if (firstVisit) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    const run = async () => {
      if (enforceServerLimit) {
        // ── 启用服务端限制：通过 API 获取内容 ──
        const data = await fetchArticleContent(articleId)

        // 在 async 函数顶部检查 cancelled，跳过已取消的请求
        if (cancelled) return

        if (data.error) {
          seenRef.current = false

          // ── 游客需要登录 ────────────────────────────────────────────
          // 必须放在 setError 之前，避免触发 Error Boundary
          // 设置 requireLogin=true，页面层会渲染 WechatGuideOverlay(require_login)
          if (data.code === "REQUIRE_LOGIN") {
            setRequireLogin(true)
            setMembershipRequired(false)
            setRequiredLevel(null)
            const articleData: Article = {
              id: data.articleId || articleId,
              title: data.title || "文章",
              content: data.content || "",
              category: categoryName,
              author: "",
              publishDate: "",
              readingCount: 0,
              created_at: "",
              updated_at: "",
              html_url: data.html_url,
            }
            setArticle(articleData)
            setArticles(prev => prev.map(a =>
              a.id === articleData.id || a.short_id === articleId
                ? articleData
                : a
            ))
            setIsLoading(false)
            setIsRefreshing(false)
            return
          }

          // ── 免费用户读满（服务端返回 LIMIT_EXCEEDED）──────────────────
          // 设置最小 article 占位对象（供 sidebar/breadcrumbs 渲染），但 content 为空
          // 页面层通过 guestLimitExceeded 检测并显示 WechatGuideOverlay 弹窗
          if (data.code === "LIMIT_EXCEEDED") {
            if (data.readCount !== undefined) {
              window.dispatchEvent(new CustomEvent("rfyr:quota-update", {
                detail: {
                  readCount: data.readCount,
                  bonusCount: data.bonusCount,
                  dailyBonusCount: data.dailyBonusCount,
                  readIds: data.readIds,
                  todayReadIds: data.todayReadIds,
                },
              }))
            }
            setGuestLimitExceeded(true)
            setGuestReadCount(data.readCount || 0)
            setGuestLimit(data.limit || 3)
            // 设置 article 占位对象（供侧边栏和面包屑渲染，内容区域显示弹窗）
            const articleData: Article = {
              id: data.articleId || articleId,
              title: data.title || "文章",
              content: "",
              category: categoryName,
              author: "",
              publishDate: "",
              readingCount: 0,
              created_at: "",
              updated_at: "",
              html_url: data.html_url,
            }
            setArticle(articleData)
            setArticles(prev => prev.map(a =>
              a.id === articleData.id || a.short_id === articleId
                ? articleData
                : a
            ))
            setIsLoading(false)
            setIsRefreshing(false)
            return
          }

          // ── 会员权限不足（YEARLY_REQUIRED / MEMBERSHIP_REQUIRED）──
          // 设置 article 使页面能渲染弹窗内容区
          if (data.code === "YEARLY_REQUIRED" || data.code === "MEMBERSHIP_REQUIRED") {
            setMembershipRequired(true)
            setRequiredLevel(data.requiredLevel || null)
            const articleData: Article = {
              id: data.articleId || articleId,
              title: data.title || "文章",
              content: data.content || "",
              category: categoryName,
              author: "",
              publishDate: "",
              readingCount: 0,
              created_at: "",
              updated_at: "",
              html_url: data.html_url,
            }
            setArticle(articleData)
            setArticles(prev => prev.map(a =>
              a.id === articleData.id || a.short_id === articleId
                ? articleData
                : a
            ))
            setIsLoading(false)
            setIsRefreshing(false)
            return
          }

          // ── 月卡每日限制超限 ────────────────────────────────────────
          if (data.code === "DAILY_LIMIT_EXCEEDED") {
            const apiDailyReadCount = data.dailyReadCount ?? data.readCount ?? 0
            const apiEffectiveLimit = data.effectiveDailyLimit ?? data.limit ?? 8
            window.dispatchEvent(new CustomEvent("rfyr:quota-update", {
              detail: {
                readCount: data.readCount ?? 0,
                dailyReadCount: apiDailyReadCount,
                bonusCount: data.bonusCount,
                dailyBonusCount: data.dailyBonusCount,
                readIds: data.readIds,
                todayReadIds: data.todayReadIds,
                // NOTE: 不传 effectiveDailyLimit，因为 apiEffectiveLimit 是 quota 公式中
                // 的 dailyLimit（即 monthly_daily_limit + dailyBonusCount），而 context
                // 的 effectiveDailyLimit 应该由 fetchData 根据最新 bonusCount 重新计算。
                // 传过来会错误覆盖（比如月卡基础 4+奖励 0=4，但正确值可能是 6）。
                // effectiveDailyLimit: apiEffectiveLimit,
              },
            }))
            // 先更新数据（下次渲染时弹窗可见），再更新标志触发弹窗显示
            setDailyLimitData({ dailyReadCount: apiDailyReadCount, effectiveDailyLimit: apiEffectiveLimit })
            setDailyLimitExceeded(true)
            // 同步更新本地 state（成功路径会调 setEffectiveDailyLimit，这里也要保持一致）
            setEffectiveDailyLimit(apiEffectiveLimit)
            const articleData: Article = {
              id: data.articleId || articleId,
              title: data.title || "文章",
              content: data.content || "",
              category: categoryName,
              author: "",
              publishDate: "",
              readingCount: 0,
              created_at: "",
              updated_at: "",
              html_url: data.html_url,
            }
            setArticle(articleData)
            setArticles(prev => prev.map(a =>
              a.id === articleData.id || a.short_id === articleId
                ? articleData
                : a
            ))
            setIsLoading(false)
            setIsRefreshing(false)
            return
          }

          // 其它未分类错误
          setIsLoading(false)
          setIsRefreshing(false)
          return
        }

        // 构建 Article 对象（使用 API 返回的内容）
        const articleData: Article = {
          id: data.articleId || articleId,
          title: data.title || "",
          content: data.content || "",
          category: categoryName,
          author: "",
          publishDate: "",
          readingCount: 0,
          created_at: "",
          updated_at: "",
          html_url: data.html_url,
        }

        setArticle(articleData)
        seenRef.current = true
        setGuestLimitExceeded(false)

        // 更新游客阅读计数
        if (data.accessType === "guest" && data.readCount !== undefined) {
          setGuestReadCount(data.readCount)
        }

        // 更新月卡每日阅读计数（来自服务端）
        if (data.accessType === "monthly") {
          if (data.dailyReadCount !== undefined) {
            setDailyReadCount(data.dailyReadCount)
          } else if (data.readCount !== undefined) {
            setDailyReadCount(data.readCount)
          }
          if (data.effectiveDailyLimit !== undefined) {
            setEffectiveDailyLimit(data.effectiveDailyLimit)
          }
          setDailyLimitExceeded(false)
        }

        // 更新文章列表中的这篇
        setArticles(prev => prev.map(a =>
          a.id === articleData.id || a.short_id === articleId
            ? articleData
            : a
        ))

        // ── 立即同步最新配额到 ReadingContext ──
        if (data.readCount !== undefined) {
          window.dispatchEvent(new CustomEvent("rfyr:quota-update", {
            detail: {
              readCount: data.readCount,
              dailyReadCount: data.dailyReadCount,
              bonusCount: data.bonusCount,
              dailyBonusCount: data.dailyBonusCount,
              readIds: data.readIds,
              todayReadIds: data.todayReadIds,
            },
          }))
        }
      }

      if (!cancelled) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [articleId, categoryName, enforceServerLimit, refreshToken])

  return {
    article,
    articles,
    isLoading,
    isRefreshing,
    error,
    // 游客限制信息
    guestLimitExceeded,
    guestReadCount,
    guestLimit,
    // 需要登录（session 过期）
    requireLogin,
    // 会员权限不足信息
    membershipRequired,
    requiredLevel,
    // 月卡每日限制信息
    dailyLimitExceeded,
    dailyLimitData,
    dailyReadCount,
    effectiveDailyLimit,
  }
}

/**
 * 文章 HTML 内容净化 — 使用 DOMParser 手动清理
 *
 * 注意：这里使用原生 DOMParser + 手动清理，而非 DOMPurify。
 * DOMParser.parseFromString 自动解析 HTML，不会执行脚本。
 * 清理规则：
 *  - 移除所有危险标签（script, style, iframe, object, embed, form, input, button, select）
 *  - 移除所有以 on* 开头的属性（内联事件处理器）
 *  - 移除超链接的 javascript: 协议 href
 *  - 移除装饰性边框样式（border, border-radius, box-shadow, outline）
 *  - SSR 时（window 不存在）直接返回原始内容
 */
export function useSanitizedArticleHtml(content: string | undefined) {
  return React.useMemo(() => {
    const raw = String(content || "")
    if (!raw) return raw

    // 服务端渲染时跳过（window/document 不存在）
    if (typeof window === "undefined") return raw

    try {
      // 延迟导入 DOMPurify
      if (!window.customElements) {
        // SSR 环境
        return raw
      }

      // 动态创建 DOMPurify 实例
      // 这里使用原生的 DOMParser 作为基础清理
      // 配合 HTML 清理配置实现 XSS 防护
      const parser = new window.DOMParser()
      const doc = parser.parseFromString(raw, 'text/html')

      // 移除脚本和危险元素
      const dangerous = doc.querySelectorAll('script, style, iframe, object, embed, form, input, button, select')
      dangerous.forEach(el => el.remove())

      // 清理所有元素的事件属性
      const allElements = doc.querySelectorAll('*')
      allElements.forEach(el => {
        const attrs = Array.from(el.attributes)
        attrs.forEach(attr => {
          if (attr.name.toLowerCase().startsWith('on')) {
            el.removeAttribute(attr.name)
          }
        })
      })

      // 清理超链接的 javascript: 协议
      doc.querySelectorAll('a[href]').forEach(el => {
        const href = el.getAttribute('href') || ''
        if (href.trim().toLowerCase().startsWith('javascript:')) {
          el.removeAttribute('href')
        }
      })

      // 移除边框样式
      stripBorderStylesFromDocument(doc)

      return doc.body.innerHTML
    } catch (err) {
      return raw
    }
  }, [content])
}
