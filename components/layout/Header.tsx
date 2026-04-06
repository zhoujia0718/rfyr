"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronDown, LogOut } from "lucide-react"
import { LoginForm } from "@/components/auth/login-form"

interface User {
  id: string
  username: string
  vip_tier?: string
}

export function Header() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)
  const [user, setUser] = React.useState<User | null>(null)
  const [showLogin, setShowLogin] = React.useState(false)
  const [showLogoutMenu, setShowLogoutMenu] = React.useState(false)

  // 模拟用户登录状态
  React.useEffect(() => {
    // 实际项目中这里会从 localStorage 或状态管理库中获取用户信息
    const mockUser: User = {
      id: "1",
      username: "Julio",
      vip_tier: "yearly"
    }
    setIsLoggedIn(true)
    setUser(mockUser)
  }, [])

  const handleLogout = () => {
    setIsLoggedIn(false)
    setUser(null)
    setShowLogoutMenu(false)
  }

  const getMembershipBadge = () => {
    if (!user?.vip_tier || user.vip_tier === 'none') {
      return null
    }

    if (user.vip_tier === 'weekly') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.25 rounded-full text-[9px] font-bold" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
          周卡
        </span>
      )
    } else if (user.vip_tier === 'yearly') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.25 rounded-full text-[9px] font-bold" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
          年卡
        </span>
      )
    }

    return null
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-4">
          <span className="text-2xl font-bold">
            <span className="text-[#1E40AF]">日</span>
            <span className="text-[#1E40AF]">富</span>
            <span className="text-[#1E40AF]">一</span>
            <span className="text-[#1E40AF]">日</span>
          </span>
          <span className="hidden text-sm text-gray-500 md:inline-block">
            价值投机，看长做短
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-4">
          <Link href="/" className="text-gray-700 hover:text-[#1E40AF] font-medium">
            首页
          </Link>
          <Link href="/articles" className="text-gray-700 hover:text-[#1E40AF] font-medium">
            文章
          </Link>
          <Link href="/calendar" className="text-gray-700 hover:text-[#1E40AF] font-medium">
            投资日历
          </Link>
          <Link href="/stock-picking" className="text-gray-700 hover:text-[#1E40AF] font-medium">
            个股挖掘
          </Link>
        </nav>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          {/* Membership Center */}
          <Link href="/membership">
            <Button
              className="bg-[#1E40AF] text-white hover:bg-[#1D4ED8] font-bold rounded-full transition-all duration-200"
            >
              会员中心
            </Button>
          </Link>

          {/* Login / User */}
          {isLoggedIn ? (
            <div className="relative">
              <div 
                className="flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_10px_15px_-3px_rgba(148,163,184,0.08),0_4px_6px_-2px_rgba(148,163,184,0.04)] active:scale-[0.98]"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #F1F5F9',
                  boxShadow: '0 10px 15px -3px rgba(148, 163, 184, 0.08), 0 4px 6px -2px rgba(148, 163, 184, 0.04)'
                }}
                onClick={() => setShowLogoutMenu(!showLogoutMenu)}
              >
                {/* Username */}
                <span className="font-bold text-[10px]" style={{ color: '#1F2937' }}>
                  {user?.username}
                </span>
                
                {/* Divider */}
                {user?.vip_tier && user.vip_tier !== 'none' && (
                  <div className="w-px h-6" style={{ backgroundColor: '#F1F5F9' }} />
                )}
                
                {/* Membership Badge */}
                {getMembershipBadge()}
                
                {/* Chevron */}
                <ChevronDown className="h-2.5 w-2.5" style={{ color: '#94A3B8' }} />
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
              className="flex items-center gap-0 px-4 py-2 rounded-full cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_10px_15px_-3px_rgba(148,163,184,0.08),0_4px_6px_-2px_rgba(148,163,184,0.04)] active:scale-[0.98]"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #F1F5F9',
                boxShadow: '0 10px 15px -3px rgba(148, 163, 184, 0.08), 0 4px 6px -2px rgba(148, 163, 184, 0.04)'
              }}
            >
              <span 
                className="font-bold text-xs transition-colors duration-200"
                style={{ color: '#1E40AF' }}
              >
                登录
              </span>
              
              {/* Divider */}
              <div className="w-px h-6 mx-3" style={{ backgroundColor: '#F1F5F9' }} />
              
              <span 
                className="font-bold text-xs"
                style={{ color: '#475569' }}
              >
                注册
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Login Form */}
      <LoginForm open={showLogin} onOpenChange={setShowLogin} />
    </header>
  )
}