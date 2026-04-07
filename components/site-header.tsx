"use client"

import * as React from "react"
import { ChevronDown, Search, LogOut, Crown, X, Menu } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useMembership } from "@/components/membership-provider"
import { supabase } from "@/lib/supabase"
const LoginForm = React.lazy(() => import("@/components/auth/login-form").then(m => ({ default: m.LoginForm })))
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
  const { hasAccess } = useMembership()

  // 检查用户登录状态
  React.useEffect(() => {
    const checkLoginStatus = async () => {
      const customAuth = localStorage.getItem('custom_auth')
      if (customAuth) {
        try {
          const authData = JSON.parse(customAuth)
          const maxAge = 7 * 24 * 60 * 60 * 1000
          if (Date.now() - (authData.loginTime ?? 0) < maxAge && authData.user?.id) {
            setIsLoggedIn(true)
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
            return
          }
        } catch { /* ignore */ }
        localStorage.removeItem('custom_auth')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setIsLoggedIn(true)
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()
        if (data) setUser(data)
      } else {
        setIsLoggedIn(false)
        setUser(null)
      }
    }
    void checkLoginStatus()
  }, [])

  const handleLogout = async () => {
    localStorage.removeItem('custom_auth')
    localStorage.removeItem('membership')
    localStorage.removeItem('isLoggedIn')
    localStorage.removeItem('userEmail')
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

  // 获取会员徽章
  const getMembershipBadge = () => {
    if (!user?.vip_tier || user.vip_tier === 'none') {
      return null
    }
    
    if (user.vip_tier === 'weekly') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
          周卡
        </span>
      )
    } else if (user.vip_tier === 'yearly') {
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
        <Link href="/" className="flex items-center gap-4">
          <span className="text-2xl font-bold">
            <span className="text-blue-800">日</span>
            <span className="text-blue-800">富</span>
            <span className="text-blue-800">一</span>
            <span className="text-blue-800">日</span>
          </span>
          <span className="hidden text-sm text-muted-foreground md:inline-block">
            价值投机，看长做短
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-35">
          {menuItems.map((item) => {
            // 检查当前菜单项是否有权限
            const hasItemAccess = hasAccess(item.category as any)
            
            return (
              <div key={item.title} className={cn("relative", item.hasDropdown && "group")}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1 bg-transparent hover:bg-accent hover:text-accent-foreground px-6 py-3 rounded-md text-base font-medium",
                    item.highlight ? "text-red-600 font-semibold" : "text-foreground"
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
                </Link>
                {item.hasDropdown && item.items && item.items.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 bg-popover text-popover-foreground border shadow-md rounded-md w-[280px] p-3 hidden group-hover:block z-50">
                    <ul className="space-y-1">
                      {item.items?.map((subItem: SubItem) => (
                        <li key={subItem.title}>
                          <Link
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
                          </Link>
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

          {/* Membership Center - Hidden on Mobile */}
          <Link href="/membership" className="hidden md:block mr-3">
            <Button
              className="bg-[#1E40AF] text-white hover:bg-[#1E40AF]/90 font-bold"
            >
              会员中心
            </Button>
          </Link>

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
                {user?.vip_tier && user.vip_tier !== 'none' && (
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
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-gray-50 hover:text-[#1E40AF] text-left"
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div 
              onClick={() => setShowLogin(true)}
              className="hidden md:flex items-center gap-0 px-6 py-3 rounded-full cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_10px_15px_-3px_rgba(148,163,184,0.08),0_4px_6px_-2px_rgba(148,163,184,0.04)] active:scale-[0.98]"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #F1F5F9',
                boxShadow: '0 10px 15px -3px rgba(148, 163, 184, 0.08), 0 4px 6px -2px rgba(148, 163, 184, 0.04)'
              }}
            >
              <span 
                className="font-semibold text-sm transition-colors duration-200"
                style={{ color: '#1E40AF' }}
              >
                登录
              </span>
              
              {/* Divider */}
              <div className="w-px h-8 mx-4" style={{ backgroundColor: '#F1F5F9' }} />
              
              <span 
                className="font-semibold text-sm"
                style={{ color: '#475569' }}
              >
                注册
              </span>
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
                    <Link
                      href={item.href}
                      className={cn(
                        "block py-3 px-4 rounded-md text-base font-medium",
                        item.highlight ? "text-red-600 font-semibold" : "text-foreground"
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
                    </Link>
                    {item.hasDropdown && item.items && item.items.length > 0 && (
                      <div className="ml-4 mt-2 space-y-2">
                        {item.items?.map((subItem: SubItem) => (
                          <Link
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
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>

            {/* Mobile Actions */}
            <div className="pt-4 border-t space-y-3">
              <Link href="/membership" className="block w-full">
                <Button
                  className="w-full bg-[#1E40AF] text-white hover:bg-[#1E40AF]/90 font-bold"
                >
                  会员中心
                </Button>
              </Link>
              
              {isLoggedIn ? (
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
              ) : (
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Login Form */}
      {showLogin && (
        <React.Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
          <LoginForm open={showLogin} onOpenChange={setShowLogin} />
        </React.Suspense>
      )}

      {/* Upgrade Membership Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader className="text-center items-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <Crown className="h-8 w-8 text-red-500" />
            </div>
            <DialogTitle className="text-xl text-center">个股挖掘年度VIP专享</DialogTitle>
            <DialogDescription className="text-base mt-2 text-center">
              升级年度VIP会员，解锁深度个股研究报告和投资机会挖掘
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button asChild className="w-full" size="lg">
              <Link href="/membership" onClick={() => setShowUpgradeDialog(false)}>
                立即开通会员
              </Link>
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
