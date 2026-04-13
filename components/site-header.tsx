"use client"

import * as React from "react"
import { ChevronDown, Search, LogOut, Crown, Menu } from "lucide-react"
import { useRouter } from "next/navigation"
import { ClientNavLink } from "@/components/client-nav-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useMembership } from "@/components/membership-provider"
import { MembershipType } from "@/lib/membership"
import { supabase } from "@/lib/supabase"
// 登录弹窗见文末：<LoginForm> 常驻挂载，仅用 open 控制，避免与 Radix 关闭动画竞态导致遮罩残留
import { LoginForm } from "@/components/auth/login-form"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface MenuItem {
  title: string
  href: string
  category: string
  highlight?: boolean
  hasDropdown: boolean
  items?: SubItem[]
}

interface SubItem {
  title: string
  href: string
}

const baseMenuItems: MenuItem[] = [
  {
    title: "个人实盘",
    href: "/portfolio",
    category: "calendar",
    hasDropdown: false,
  },
  {
    title: "个股挖掘",
    href: "/stocks/all",
    category: "stocks",
    highlight: true,
    hasDropdown: true,
    items: [
      { title: "全部个股", href: "/stocks/all" },
      { title: "潜力个股", href: "/stocks/potential" },
      { title: "热门个股", href: "/stocks/hot" },
    ],
  },
]

export function SiteHeader() {
  const router = useRouter()
  const [showSearch, setShowSearch] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [showLogin, setShowLogin] = React.useState(false)
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)
  const [user, setUser] = React.useState<any>(null)
  const [showUpgradeDialog, setShowUpgradeDialog] = React.useState(false)
  const [showLogoutMenu, setShowLogoutMenu] = React.useState(false)
  const [showMobileMenu, setShowMobileMenu] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)
  const [isDev, setIsDev] = React.useState(false)
  const { hasAccess, membershipType } = useMembership()

  React.useEffect(() => {
    setIsMounted(true)
    setIsDev(
      process.env.NODE_ENV === "development" ||
      process.env.NEXT_PUBLIC_DEV_LOGIN === "true" ||
      window.location.hostname === "localhost"
    )
  }, [])

  // 检查用户登录状态
  React.useEffect(() => {
    if (!isMounted) return
    const checkLoginStatus = async () => {
      const customAuth = localStorage.getItem('custom_auth')
      if (customAuth) {
        try {
          const authData = JSON.parse(customAuth)
          const maxAgeSeconds = 7 * 24 * 60 * 60
          if (authData.loginTime && authData.loginTime > 0 && authData.user?.id) {
            setIsLoggedIn(true)
            // 尝试拉取 users 表最新数据（允许失败，失败时用 localStorage 缓存）
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

      // localStorage 中不存在时，尝试从 cookie 读取（用于跨页面刷新场景）
      if (!customAuth) {
        try {
          const match = document.cookie.match(/admin-session-local=([^;]+)/)
          if (match) {
            const cookieData = JSON.parse(decodeURIComponent(match[1]))
            const userId = cookieData.userId || cookieData.user?.id
            if (cookieData.loginTime && cookieData.loginTime > 0 && userId) {
              // cookie 有效但 localStorage 丢失，重新写入 localStorage
              const restored = {
                user: { id: userId, email: cookieData.email },
                session: { access_token: `cookie_${Date.now()}`, refresh_token: `cookie_refresh_${Date.now()}`, expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
                loginTime: cookieData.loginTime,
                source: "cookie",
              }
              localStorage.setItem('custom_auth', JSON.stringify(restored))
              setIsLoggedIn(true)
              setUser(restored.user)
              return
            }
          }
        } catch { /* ignore */ }
      }

      // custom_auth 不存在时，尝试 supabase auth session（用于密码登录等场景）
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
    }
    void checkLoginStatus()
  }, [isMounted])

  // 监听登录成功后的静默刷新事件
  React.useEffect(() => {
    if (!isMounted) return
    const handler = () => { void checkLoginStatus() }
    window.addEventListener("rfyr:auth-refresh", handler)
    return () => window.removeEventListener("rfyr:auth-refresh", handler)
  }, [isMounted])

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

  // 过滤菜单项
  const menuItems = baseMenuItems.map((item) => {
    // 检查当前菜单项的权限
    const hasItemAccess = hasAccess(item.category as any)
    
    // 过滤子菜单项
    const filteredItems = item.items?.filter(() => hasItemAccess)
    
    return {
      ...item,
      items: filteredItems,
    }
  })

  // 获取会员徽章（从 membership-provider 读取，而非 custom_auth 缓存）
  const getMembershipBadge = () => {
    if (membershipType === 'weekly') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
          周卡
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
        <nav className="hidden md:flex items-center space-x-35">
          {menuItems.map((item) => {
            // 检查当前菜单项是否有权限
            const hasItemAccess = hasAccess(item.category as any)
            
            return (
              <div key={item.title} className={cn("relative", item.hasDropdown && "group")}>
                <ClientNavLink
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1 rounded-md bg-transparent px-6 py-3 text-base font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400",
                    item.highlight && "font-semibold"
                  )}
                  onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                    if (item.category === "stocks" && !hasItemAccess) {
                      e.preventDefault()
                      setShowUpgradeDialog(true)
                    }
                  }}
                >
                  {item.title}
                  {item.hasDropdown && item.items && item.items.length > 0 && <ChevronDown className="h-5 w-5" />}
                </ClientNavLink>
                {item.hasDropdown && item.items && item.items.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 bg-popover text-popover-foreground border shadow-md rounded-md w-[280px] p-3 hidden group-hover:block z-50">
                    <ul className="space-y-1">
                      {item.items?.map((subItem: SubItem) => (
                        <li key={subItem.title}>
                          <ClientNavLink
                            href={subItem.href}
                            className="block rounded-md p-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                              if (item.category === "stocks" && !hasItemAccess) {
                                e.preventDefault()
                                setShowUpgradeDialog(true)
                              }
                            }}
                          >
                            {subItem.title}
                          </ClientNavLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
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
                
                {/* Divider */}
                {membershipType !== 'none' && (
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
            <nav className="space-y-2">
              {menuItems.map((item) => {
                const hasItemAccess = hasAccess(item.category as any)
                
                return (
                  <div key={item.title}>
                    <ClientNavLink
                      href={item.href}
                      className={cn(
                        "block rounded-md px-4 py-3 text-base font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-500",
                        item.highlight && "font-semibold"
                      )}
                      onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                        if (item.category === "stocks" && !hasItemAccess) {
                          e.preventDefault()
                          setShowUpgradeDialog(true)
                        }
                        setShowMobileMenu(false)
                      }}
                    >
                      {item.title}
                    </ClientNavLink>
                    {item.hasDropdown && item.items && item.items.length > 0 && (
                      <div className="ml-4 mt-2 space-y-2">
                        {item.items?.map((subItem: SubItem) => (
                          <ClientNavLink
                            key={subItem.title}
                            href={subItem.href}
                            className="block py-2 px-4 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent"
                            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                              if (item.category === "stocks" && !hasItemAccess) {
                                e.preventDefault()
                                setShowUpgradeDialog(true)
                              }
                              setShowMobileMenu(false)
                            }}
                          >
                            {subItem.title}
                          </ClientNavLink>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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

      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader className="text-center items-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <Crown className="h-8 w-8 text-red-500" />
            </div>
            <DialogTitle className="text-xl text-center">个股挖掘年度VIP专享</DialogTitle>
            <DialogDescription className="text-base mt-2 text-center text-muted-foreground">
              升级年度VIP会员，解锁深度个股研究报告和投资机会挖掘
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button asChild className="w-full" size="lg">
              <ClientNavLink href="/membership" onClick={() => setShowUpgradeDialog(false)}>
                立即开通会员
              </ClientNavLink>
            </Button>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => setShowUpgradeDialog(false)}
            >
              稍后再说
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}
