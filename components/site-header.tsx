"use client"

import * as React from "react"
import { ChevronDown, Search, LogOut, Menu } from "lucide-react"
import { useRouter } from "next/navigation"
import { ClientNavLink } from "@/components/client-nav-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useMembership } from "@/components/membership-provider"
import { useReadingLimit } from "@/hooks/use-reading-limit"
import { useReadingSettings } from "@/hooks/use-reading-settings"
import { MembershipType } from "@/lib/membership"
import { supabase } from "@/lib/supabase"
// 登录弹窗见文末：<LoginForm> 常驻挂载，仅用 open 控制，避免与 Radix 关闭动画竞态导致遮罩残留
import { LoginForm } from "@/components/auth/login-form"

export function SiteHeader() {
  const router = useRouter()
  const [showSearch, setShowSearch] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [showLogin, setShowLogin] = React.useState(false)
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)
  const [user, setUser] = React.useState<any>(null)
  const [showLogoutMenu, setShowLogoutMenu] = React.useState(false)
  const [showMobileMenu, setShowMobileMenu] = React.useState(false)
  const [isDev, setIsDev] = React.useState(false)
  const { membershipType } = useMembership()
  const { totalReadCount, dailyReadCount, effectiveDailyLimit, maxCount, isMonthly, isYearly, isLoading: limitLoading } = useReadingLimit()
  const { show_read_progress } = useReadingSettings()
  const isMountedRef = React.useRef(false)
  const checkLoginStatusRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    isMountedRef.current = true
    // 仅在非生产环境或明确配置了 NEXT_PUBLIC_DEV_LOGIN=true 时启用开发者快捷登录
    // 注意：生产环境绝对不能设置 NEXT_PUBLIC_DEV_LOGIN=true
    const isDevEnv = process.env.NODE_ENV === "development"
    const isDevLoginEnabled = process.env.NEXT_PUBLIC_DEV_LOGIN === "true"
    setIsDev(isDevEnv || isDevLoginEnabled)
  }, [])

  // ── 登录状态检查（空依赖，函数引用稳定）────────────
  const checkLoginStatus = React.useCallback(async () => {
    if (!isMountedRef.current) return

    const customAuth = localStorage.getItem('custom_auth')
    if (customAuth) {
      try {
        const authData = JSON.parse(customAuth)
        // Check expires_at to detect expired sessions
        if (authData.session?.expires_at) {
          const expiresAt = Number(authData.session.expires_at)
          if (expiresAt > 0 && expiresAt < Math.floor(Date.now() / 1000)) {
            localStorage.removeItem('custom_auth')
            setIsLoggedIn(false)
            setUser(null)
            // Dispatch event to show login dialog
            window.dispatchEvent(new CustomEvent("rfyr:show-login"))
            return
          }
        }
        if (authData.loginTime && authData.loginTime > 0 && authData.user?.id) {
          setIsLoggedIn(true)
          try {
            const { data: userData } = await supabase
              .from('users')
              .select('*')
              .eq('id', authData.user.id)
              .single()
            if (userData) {
              const merged = { ...authData.user, ...userData }
              setUser(merged)
              localStorage.setItem('custom_auth', JSON.stringify({ ...authData, user: merged }))
            } else {
              setUser(authData.user)
            }
          } catch {
            setUser(authData.user)
          }
          return
        }
      } catch { /* ignore */ }
      localStorage.removeItem('custom_auth')
    }

    // cookie 兜底（通过服务端 API 验证，不在前端直接解析 cookie）
    try {
      const res = await fetch("/api/admin/me", { credentials: "include" })
      if (res.status === 401) {
        localStorage.removeItem("custom_auth")
        setIsLoggedIn(false)
        setUser(null)
        return
      }
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated && data.adminId) {
          const restored = {
            user: { id: data.adminId, email: data.email },
            session: {
              access_token: '',
              refresh_token: '',
              expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
            },
            loginTime: Math.floor(Date.now() / 1000),
            source: "cookie",
          }
          localStorage.setItem("custom_auth", JSON.stringify(restored))
          setIsLoggedIn(true)
          setUser(restored.user)
          return
        }
      }
    } catch { /* ignore */ }

    // Supabase session 兜底
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData?.session?.user) {
        setIsLoggedIn(true)
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', sessionData.session.user.id)
          .single()
        if (data) setUser(data)
      }
    } catch { /* ignore */ }
  }, []) // 空依赖，函数引用稳定

  // 保存 checkLoginStatus 引用供事件监听器使用
  React.useEffect(() => {
    checkLoginStatusRef.current = checkLoginStatus
  }, [checkLoginStatus])

  // 初始化时检查一次（空依赖，只在挂载时运行）
  React.useEffect(() => {
    void checkLoginStatus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 监听登录成功后的静默刷新事件（checkLoginStatus 变化时重新注册 handler）
  React.useEffect(() => {
    const handler = () => { void checkLoginStatusRef.current?.() }
    window.addEventListener("rfyr:auth-refresh", handler)
    return () => window.removeEventListener("rfyr:auth-refresh", handler)
  }, [checkLoginStatus])

  // 监听打开登录弹窗的事件（来自 Paywall 等组件）
  React.useEffect(() => {
    const handler = () => setShowLogin(true)
    window.addEventListener("rfyr:show-login", handler)
    return () => window.removeEventListener("rfyr:show-login", handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    localStorage.removeItem('custom_auth')
    localStorage.removeItem('membership')
    localStorage.removeItem('isLoggedIn')
    localStorage.removeItem('userEmail')
    // 清除登录 cookie
    document.cookie = 'admin-session-local=; path=/; max-age=0'
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setUser(null)
    setShowLogoutMenu(false)
    window.location.reload()
  }

  // 处理搜索
  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push('/search?q=' + encodeURIComponent(searchQuery.trim()))
      setShowSearch(false)
      setSearchQuery('')
    }
  }

  // 获取会员徽章（从 membership-provider 读取，而非 custom_auth 缓存）
  const getMembershipBadge = () => {
    if (membershipType === 'monthly') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
          月卡
        </span>
      )
    } else if (membershipType === 'yearly') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
          年卡
        </span>
      )
    }
    return null
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <ClientNavLink href="/" className="flex items-center gap-4">
          <span className="text-2xl font-bold tracking-tight">
            <span className="text-primary">日</span>
            <span className="text-[#f97316]">富</span>
            <span className="text-[#1a7f37]">一</span>
            <span className="text-primary">日</span>
          </span>
          <span className="hidden text-sm text-muted-foreground md:inline-block">
            价值投机，看长做短
          </span>
        </ClientNavLink>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-end rounded-full bg-accent px-4 py-2 shadow-sm -translate-y-0.5 transition-all duration-200 ease-out hover:shadow-md hover:bg-zinc-200">
          <ClientNavLink
            href="/portfolio"
            className="text-base font-semibold whitespace-nowrap rounded-md px-2 py-0.5 leading-none transition-all duration-150 hover:bg-white/60"
            style={{ color: '#dc2626' }}
          >
            个人实盘
          </ClientNavLink>
          <span className="mx-3 self-stretch inline-block w-px bg-border/60 my-0.5" />
          <div className="flex items-center gap-1 leading-none pb-0.5" style={{ fontSize: '11px' }}>
            <ClientNavLink href="/portfolio?tab=portfolio" className="whitespace-nowrap rounded-md px-1.5 py-0.5 transition-all duration-150 hover:bg-white/60" style={{ color: '#ca8a04' }}>每日实盘</ClientNavLink>
            <span className="opacity-30 select-none" style={{ color: '#ca8a04' }}>·</span>
            <ClientNavLink href="/portfolio?tab=review" className="whitespace-nowrap rounded-md px-1.5 py-0.5 transition-all duration-150 hover:bg-white/60" style={{ color: '#ca8a04' }}>每日复盘</ClientNavLink>
            <span className="opacity-30 select-none" style={{ color: '#ca8a04' }}>·</span>
            <ClientNavLink href="/portfolio?tab=logic" className="whitespace-nowrap rounded-md px-1.5 py-0.5 transition-all duration-150 hover:bg-white/60" style={{ color: '#ca8a04' }}>严选逻辑</ClientNavLink>
          </div>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Menu</span>
          </Button>

          {/* Search - Hidden on Mobile */}
          <div className="hidden sm:block relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSearch(!showSearch)}
              className="h-9 w-9 text-gray-600 hover:text-gray-900"
            >
              <Search className="h-4 w-4" />
              <span className="sr-only">Search</span>
            </Button>
            {showSearch && (
              <div className="absolute right-0 top-full mt-6 w-64" style={{ transform: 'translateX(40px)' }}>
                <form onSubmit={handleSearch} className="flex">
                  <Input
                    type="search"
                    placeholder="搜索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="rounded-l-md rounded-r-none border-r-0"
                  />
                  <Button type="submit" className="rounded-l-none">
                    搜索
                  </Button>
                </form>
              </div>
            )}
          </div>

          {/* Membership Center */}
          <Button asChild className="mr-3 hidden md:block font-semibold shadow-sm">
            <ClientNavLink href="/membership">会员中心</ClientNavLink>
          </Button>

          {/* Login / User - Hidden on Mobile */}
          {isLoggedIn ? (
            <div className="hidden md:block relative">
              <div 
                className="flex items-center gap-2.5 px-5 py-2.5 rounded-full cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_10px_15px_-3px_rgba(148,163,184,0.08),0_4px_6px_-2px_rgba(148,163,184,0.04)] active:scale-[0.98]"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #F1F5F9',
                  boxShadow: '0 10px 15px -3px rgba(148, 163, 184, 0.08), 0 4px 6px -2px rgba(148, 163, 184, 0.04)'
                }}
                onClick={() => setShowLogoutMenu(!showLogoutMenu)}
              >
                {/* Username */}
                <span className="font-bold text-sm" style={{ color: '#1F2937' }}>
                  {user?.username}
                </span>

                {/* 今日阅读进度：已登录月卡用户可见 */}
                {isLoggedIn && isMonthly && !limitLoading && (
                  <>
                    {/* Divider */}
                    <div className="w-px h-10" style={{ backgroundColor: '#F1F5F9' }} />

                    {/* 阅读进度 */}
                    <div className="flex flex-col items-center min-w-[52px]">
                      <div className="flex items-center gap-1 leading-none">
                        <span className="text-xs" style={{ color: '#6B7280' }}>
                          今日
                        </span>
                        <span className="text-xs font-bold" style={{ color: dailyReadCount >= effectiveDailyLimit ? '#EF4444' : '#1D4ED8' }}>
                          {`${dailyReadCount}/${Number.isFinite(effectiveDailyLimit) ? effectiveDailyLimit : '—'}`}
                        </span>
                      </div>
                      {/* 进度条 */}
                      <div className="mt-1 w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#F1F5F9' }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Number.isFinite(effectiveDailyLimit) && effectiveDailyLimit > 0 ? Math.min(100, (dailyReadCount / effectiveDailyLimit) * 100) : 0}%`,
                            backgroundColor: dailyReadCount >= effectiveDailyLimit ? '#EF4444' : '#1D4ED8',
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* 总阅读进度：非月卡用户可见 */}
                {/* 非年卡用户始终显示；年卡用户由管理员开关 show_read_progress 控制 */}
                {isLoggedIn && !isMonthly && !limitLoading && (
                  <>
                    {/* 非年卡用户始终显示总已读进度 */}
                    {!isYearly ? (
                      <div className="flex flex-col items-center min-w-[52px]">
                        <div className="flex items-center gap-1 leading-none">
                          <span className="text-xs" style={{ color: '#6B7280' }}>
                            已读
                          </span>
                          <span className="text-xs font-bold" style={{ color: '#1D4ED8' }}>
                            {totalReadCount}
                          </span>
                        </div>
                        {/* 进度条 */}
                        <div className="mt-1 w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#F1F5F9' }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${maxCount > 0 && Number.isFinite(maxCount) ? Math.min(100, (totalReadCount / maxCount) * 100) : 0}%`,
                              backgroundColor: '#1D4ED8',
                            }}
                          />
                        </div>
                      </div>
                    ) : show_read_progress ? (
                      /* 年卡用户仅当管理员开关打开时显示总已读进度 */
                      <div className="flex flex-col items-center min-w-[52px]">
                        <div className="flex items-center gap-1 leading-none">
                          <span className="text-xs" style={{ color: '#6B7280' }}>
                            已读
                          </span>
                          <span className="text-xs font-bold" style={{ color: '#1D4ED8' }}>
                            {totalReadCount}
                          </span>
                        </div>
                        {/* 进度条 */}
                        <div className="mt-1 w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#F1F5F9' }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${maxCount > 0 && Number.isFinite(maxCount) ? Math.min(100, (totalReadCount / maxCount) * 100) : 0}%`,
                              backgroundColor: '#1D4ED8',
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </>
                )}

                {/* Divider */}
                {membershipType !== 'none' && !isMonthly && (
                  <div className="w-px h-10" style={{ backgroundColor: '#F1F5F9' }} />
                )}
                
                {/* Membership Badge */}
                {getMembershipBadge()}
                
                {/* Chevron */}
                <ChevronDown className="h-4 w-4" style={{ color: '#94A3B8' }} />
              </div>
              
              {/* Logout Menu */}
              {showLogoutMenu && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-[#F1F5F9] shadow-[0_10px_15px_-3px_rgba(148,163,184,0.08),0_4px_6px_-2px_rgba(148,163,184,0.04)] rounded-md w-32 z-50">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm font-medium hover:bg-muted hover:text-primary"
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
              <div className="flex items-center gap-3">
                {/* 开发者快捷登录（仅本地/开发环境显示） */}
                {isDev && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/dev/login")
                        const data = await res.json()
                        if (data.ok) {
                          localStorage.setItem("custom_auth", JSON.stringify({ loginTime: Math.floor(Date.now() / 1000), user: { id: data.userId, vip_tier: data.tier } }))
                          localStorage.removeItem("membership") // 清除旧缓存，确保重新拉取
                          window.location.reload()
                        } else {
                          alert("开发者登录失败: " + data.error)
                        }
                      } catch (e: any) {
                        alert("开发者登录失败: " + e.message)
                      }
                    }}
                    className="hidden md:inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border-2 border-dashed border-orange-300 text-orange-500 hover:bg-orange-50 transition-colors"
                    title="开发者快捷登录（测试用）"
                  >
                    [DEV]
                  </button>
                )}

                <div
                  onClick={() => setShowLogin(true)}
                  className="hidden md:flex items-center gap-0 px-6 py-3 rounded-full cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_10px_15px_-3px_rgba(148,163,184,0.08),0_4px_6px_-2px_rgba(148,163,184,0.04)] active:scale-[0.98]"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #F1F5F9',
                    boxShadow: '0 10px 15px -3px rgba(148, 163, 184, 0.08), 0 4px 6px -2px rgba(148, 163, 184, 0.04)'
                  }}
                >
                  <span className="text-sm font-semibold text-primary transition-colors duration-200">登录 / 注册</span>
                </div>
              </div>
          )}
        </div>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="md:hidden border-t bg-background">
          <div className="px-4 py-4 space-y-4">
            {/* Mobile Navigation */}
            <nav className="space-y-1">
              <ClientNavLink
                href="/portfolio"
                className="block rounded-md px-4 py-2 text-base font-medium text-foreground hover:bg-accent transition-colors"
                onClick={() => setShowMobileMenu(false)}
              >
                个人实盘
              </ClientNavLink>
              <div className="ml-4 flex flex-col gap-1">
                {[
                  { label: "每日实盘", tab: "portfolio" },
                  { label: "每日复盘", tab: "review" },
                  { label: "严选逻辑", tab: "logic" },
                ].map(({ label, tab }) => (
                  <ClientNavLink
                    key={tab}
                    href={`/portfolio?tab=${tab}`}
                    className="block rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    onClick={() => setShowMobileMenu(false)}
                  >
                    {label}
                  </ClientNavLink>
                ))}
              </div>
            </nav>

            {/* Mobile Actions */}
            <div className="pt-4 border-t space-y-3">
              <Button asChild className="w-full font-semibold">
                <ClientNavLink href="/membership">会员中心</ClientNavLink>
              </Button>
              
              {!isLoggedIn ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setShowLogin(true)
                    setShowMobileMenu(false)
                  }}
                >
                  登录 / 注册
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    handleLogout()
                    setShowMobileMenu(false)
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  退出登录
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/*
        登录弹窗必须常驻挂载，仅用 open 控制显隐。
        若用 {showLogin && <LoginForm />}，关闭时整组件卸载会与 Radix 关闭动画竞态，
        易导致遮罩层残留在页面上、看不见对话框内容。
      */}
      <LoginForm open={showLogin} onOpenChange={setShowLogin} />

    </header>
  )
}
