"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Settings,
  LogOut,
  FileText,
  LineChart,
  KeyRound,
  Loader2,
  Users,
  BarChart3,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import CategoryItem from "@/app/admin/categories/CategoryItem"

export interface Stats {
  totalUsers: number
  totalMemberships: number
  totalArticles: number
  todayVisits: number
}

// Admin-specific Category (树形结构，与 lib/articles 的 Category 不同)
export interface AdminCategory {
  id: string
  name: string
  icon: string
  description: string
  href: string
  parentId?: string | null
  children: AdminCategory[]
}

interface Article {
  id: string
  title: string
  category?: string
  publishDate?: string
  readingCount?: number
  created_at?: string
}

export interface Membership {
  id: string
  user_id: string
  membership_type: string
  start_date: string
  end_date: string
  status: string
  user_name: string
}

export interface User {
  id: string
  username?: string
  phone?: string
  created_at: string
  vip_tier?: string
}

interface AdminDashboardProps {
  initialData: {
    stats: Stats
    articles: Article[]
    categories: AdminCategory[]
    users: User[]
    memberships: Membership[]
  }
}

function buildCategoryTree(
  items: { id: string; name: string; icon?: string; description?: string; href?: string; parent_id?: string | null }[],
  parentId?: string
): Array<{
  id: string; name: string; icon: string; description: string; href: string; parentId?: string | null; children: ReturnType<typeof buildCategoryTree>
}> {
  return (items ?? [])
    .filter((item) =>
      parentId === undefined
        ? item.parent_id === null
        : item.parent_id === parentId
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      icon: item.icon || '',
      description: item.description || '',
      href: item.href || '',
      parentId: item.parent_id,
      children: buildCategoryTree(items, item.id),
    }))
}

/**
 * 规范化会员类型字段，支持新旧两种格式
 *
 * 旧格式: annual_vip, monthly_vip
 * 新格式: yearly, monthly
 */
function normalizeMembershipType(raw: string): string {
  if (!raw) return 'free'
  const normalized = raw.toLowerCase().replace(/[_\s-]/g, '')
  if (normalized.includes('year') || normalized.includes('annual') || normalized === 'permanent') {
    return normalized.includes('month') ? 'monthly' : 'yearly'
  }
  if (normalized.includes('month')) return 'monthly'
  return 'free'
}

export default function AdminDashboard({ initialData }: AdminDashboardProps) {
  const [articles, setArticles] = React.useState<Article[]>(initialData.articles as Article[])
  // categories 已在服务端构建为树形，直接使用
  const [categories, setCategories] = React.useState<AdminCategory[]>(
    initialData.categories as AdminCategory[]
  )
  const [users, setUsers] = React.useState<User[]>(initialData.users as User[])
  const [memberships, setMemberships] = React.useState<Membership[]>(initialData.memberships)
  const [stats, setStats] = React.useState<Stats>(initialData.stats)
  const [isProcessing, setIsProcessing] = React.useState<string | null>(null)

  // 升级会员对话框
  const [upgradeDialog, setUpgradeDialog] = React.useState<{
    open: boolean
    userId: string
    userName: string
  }>({ open: false, userId: "", userName: "" })
  const [upgradePlanType, setUpgradePlanType] = React.useState<string>("")

  // 续费确认对话框
  const [renewDialog, setRenewDialog] = React.useState<{
    open: boolean
    membership: Membership | null
  }>({ open: false, membership: null })

  // 取消会员确认对话框
  const [cancelDialog, setCancelDialog] = React.useState<{
    open: boolean
    membership: Membership | null
  }>({ open: false, membership: null })

  // 降级确认对话框
  const [downgradeDialog, setDowngradeDialog] = React.useState<{
    open: boolean
    membership: Membership | null
  }>({ open: false, membership: null })

  // 刷新数据
  async function refreshData() {
    const res = await fetch("/api/admin/dashboard", { cache: "no-store" })
    if (res.ok) {
      const data = await res.json()
      setStats(data.stats)
      setArticles(data.articles)
      setCategories(data.categories)
      setUsers(data.users)
      setMemberships(data.memberships)
    }
  }

  function removeCategoryById(cats: AdminCategory[], id: string): AdminCategory[] {
    return cats
      .filter((c) => c.id !== id)
      .map((c) => ({
        ...c,
        children: c.children ? removeCategoryById(c.children, id) : [],
      }))
  }

  const getCategoryName = (categories: AdminCategory[], categoryId: string): string => {
    for (const category of categories) {
      if (category.id === categoryId) return category.name
      if (category.children?.length) {
        const name = getCategoryName(category.children, categoryId)
        if (name) return name
      }
    }
    return ""
  }

  const handleDeleteArticle = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/articles/${id}`, {
        method: "DELETE",
        credentials: 'include',
      })
      if (res.ok) {
        setArticles((prev) => prev.filter((a) => a.id !== id))
        setStats((prev) => ({ ...prev, totalArticles: prev.totalArticles - 1 }))
        toast.success("删除文章成功")
      } else {
        toast.error("删除文章失败")
      }
    } catch {
      toast.error("删除文章失败")
    }
  }

  const handleEditArticle = (id: string) => {
    window.location.href = `/admin/articles?id=${id}`
  }

  const handleEditCategory = (id: string) => {
    window.location.href = `/admin/categories/edit/${id}`
  }

  const handleDeleteCategory = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("删除分类成功")
        refreshData()
      } else {
        toast.error("删除分类失败")
      }
    } catch {
      toast.error("删除分类失败")
    }
  }

  const handleUpgradeMembershipConfirm = async () => {
    if (!upgradePlanType) {
      toast.error("请选择会员类型")
      return
    }
    setIsProcessing(upgradeDialog.userId)
    try {
      const res = await fetch("/api/admin/membership/operations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upgrade",
          userId: upgradeDialog.userId,
          planType: upgradePlanType,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || "升级成功")
        setUpgradeDialog({ open: false, userId: "", userName: "" })
        refreshData()
      } else {
        toast.error(data.error || "升级失败")
      }
    } catch {
      toast.error("升级失败")
    } finally {
      setIsProcessing(null)
    }
  }

  const handleRenewConfirm = async () => {
    if (!renewDialog.membership) return
    setIsProcessing(renewDialog.membership.id)
    try {
      const res = await fetch("/api/admin/membership/operations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "renew",
          membershipId: renewDialog.membership.id,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || "续费成功")
        setRenewDialog({ open: false, membership: null })
        refreshData()
      } else {
        toast.error(data.error || "续费失败")
      }
    } catch {
      toast.error("续费失败")
    } finally {
      setIsProcessing(null)
    }
  }

  const handleCancelConfirm = async () => {
    if (!cancelDialog.membership) return
    setIsProcessing(cancelDialog.membership.id)
    try {
      const res = await fetch("/api/admin/membership/operations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          membershipId: cancelDialog.membership.id,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || "取消成功")
        setCancelDialog({ open: false, membership: null })
        refreshData()
      } else {
        toast.error(data.error || "取消失败")
      }
    } catch {
      toast.error("取消失败")
    } finally {
      setIsProcessing(null)
    }
  }

  const handleDowngradeConfirm = async () => {
    if (!downgradeDialog.membership) return
    setIsProcessing(downgradeDialog.membership.id)
    try {
      const res = await fetch("/api/admin/membership/operations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "downgrade",
          membershipId: downgradeDialog.membership.id,
          userId: downgradeDialog.membership.user_id,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || "降级成功")
        setDowngradeDialog({ open: false, membership: null })
        refreshData()
      } else {
        toast.error(data.error || "降级失败")
      }
    } catch {
      toast.error("降级失败")
    } finally {
      setIsProcessing(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">后台管理系统</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (window.location.href = "/admin/login")}
            >
              <LogOut className="h-4 w-4 mr-2" />
              退出登录
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { title: "总用户数", value: stats.totalUsers, icon: Users, color: "bg-blue-500" },
            { title: "会员数量", value: stats.totalMemberships, icon: Users, color: "bg-green-500" },
            { title: "文章总数", value: stats.totalArticles, icon: FileText, color: "bg-amber-500" },
            { title: "今日访问量", value: stats.todayVisits, icon: BarChart3, color: "bg-purple-500" },
          ].map((stat, i) => {
            const Icon = stat.icon
            return (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-full ${stat.color} text-white`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>管理中心</CardTitle>
            <CardDescription>管理网站内容和用户</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="users" className="w-full">
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="users">用户管理</TabsTrigger>
                <TabsTrigger value="articles">文章管理</TabsTrigger>
                <TabsTrigger value="categories">分类管理</TabsTrigger>
                <TabsTrigger value="membership">会员管理</TabsTrigger>
                <TabsTrigger value="portfolio">
                  <span className="flex items-center gap-1.5">
                    <LineChart className="h-4 w-4" />
                    个人实盘
                  </span>
                </TabsTrigger>
                <TabsTrigger value="redeem">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4" />
                    兑换码
                  </span>
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <span className="flex items-center gap-1.5">
                    <Settings className="h-4 w-4" />
                    设置
                  </span>
                </TabsTrigger>
              </TabsList>

              {/* 用户管理 */}
              <TabsContent value="users">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">用户列表</h3>
                    <Button asChild>
                      <Link href="/admin/users/create">添加用户</Link>
                    </Button>
                  </div>
                  <div className="rounded-md border">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <div className="grid grid-cols-6 gap-4 text-sm font-medium">
                        <div>用户ID</div>
                        <div>用户名称</div>
                        <div>注册时间</div>
                        <div>会员状态</div>
                        <div>操作</div>
                      </div>
                    </div>
                    {users.length > 0 ? (
                      users.map((user) => {
                        const userMembership = memberships.find(
                          (m) => m.user_id === user.id
                        )
                        let membershipStatus = "普通"
                        if (userMembership) {
                          const normalizedType = normalizeMembershipType(userMembership.membership_type)
                          if (normalizedType === 'yearly') membershipStatus = '年度VIP'
                          else if (normalizedType === 'monthly') membershipStatus = '月卡'
                        }
                        return (
                          <div
                            key={user.id}
                            className="px-4 py-3 border-b hover:bg-gray-50"
                          >
                            <div className="grid grid-cols-6 gap-4">
                              <div className="font-mono text-sm">{user.id}</div>
                              <div>
                                {user.id === "00000000-0000-0000-0000-000000000001"
                                  ? "普通用户"
                                  : user.id ===
                                    "00000000-0000-0000-0000-000000000002"
                                  ? "管理员"
                                  : user.username ||
                                    user.phone ||
                                    "日富一日用户"}
                              </div>
                              <div>{user.created_at?.substring(0, 10)}</div>
                              <div>{membershipStatus}</div>
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600"
                                  onClick={() =>
                                    setUpgradeDialog({
                                      open: true,
                                      userId: user.id,
                                      userName:
                                        user.username ||
                                        user.phone ||
                                        "日富一日用户",
                                    })
                                  }
                                >
                                  升级会员
                                </Button>
                                {userMembership?.membership_type ===
                                  "annual_vip" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-amber-600"
                                    onClick={() =>
                                      setDowngradeDialog({
                                        open: true,
                                        membership: userMembership,
                                      })
                                    }
                                  >
                                    降级月卡
                                  </Button>
                                )}
                                {userMembership && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-orange-600"
                                    onClick={() =>
                                      setCancelDialog({
                                        open: true,
                                        membership: userMembership,
                                      })
                                    }
                                  >
                                    取消会员
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        暂无用户数据
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* 文章管理 */}
              <TabsContent value="articles">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">文章列表</h3>
                    <Button asChild>
                      <Link href="/admin/articles">管理文章</Link>
                    </Button>
                  </div>
                  <div className="rounded-md border">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <div className="grid grid-cols-5 gap-4 text-sm font-medium">
                        <div>标题</div>
                        <div>分类</div>
                        <div>发布时间</div>
                        <div>阅读量</div>
                        <div>操作</div>
                      </div>
                    </div>
                    {articles.length > 0 ? (
                      articles.map((article) => (
                        <div
                          key={article.id}
                          className="px-4 py-3 border-b hover:bg-gray-50"
                        >
                          <div className="grid grid-cols-5 gap-4">
                            <div>{article.title}</div>
                            <div>
                              {article.category
                                ? getCategoryName(categories, article.category) ||
                                  article.category
                                : "-"}
                            </div>
                            <div>
                              {article.publishDate ||
                                article.created_at?.substring(0, 10)}
                            </div>
                            <div>{article.readingCount || 0}</div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditArticle(article.id)}
                              >
                                编辑
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                onClick={() => handleDeleteArticle(article.id)}
                              >
                                删除
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        暂无文章数据
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* 分类管理 */}
              <TabsContent value="categories">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">分类列表</h3>
                    <Button asChild>
                      <Link href="/admin/categories/create">添加分类</Link>
                    </Button>
                  </div>
                  <div className="rounded-md border">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <div className="grid grid-cols-4 gap-4 text-sm font-medium">
                        <div>名称</div>
                        <div>描述</div>
                        <div>排序</div>
                        <div>操作</div>
                      </div>
                    </div>
                    {categories.length > 0 ? (
                      <div className="divide-y">
                        {categories.map((category) => (
                          <CategoryItem
                            key={category.id}
                            category={category}
                            level={0}
                            onDeleted={(id) => {
                              // 从本地状态移除已删除的分类
                              setCategories((prev) =>
                                removeCategoryById(prev, id)
                              )
                            }}
                            onRefresh={refreshData}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        暂无分类数据
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* 会员管理 */}
              <TabsContent value="membership">
                <div className="space-y-6">
                  <div className="flex justify-end">
                    <Button asChild>
                      <Link href="/admin/membership/create">手动开通会员</Link>
                    </Button>
                  </div>
                  <div>
                    <h3 className="font-medium mb-4">现有会员列表</h3>
                    <div className="rounded-md border">
                      <div className="bg-gray-50 px-4 py-3 border-b">
                        <div className="grid grid-cols-6 gap-4 text-sm font-medium">
                          <div>用户ID</div>
                          <div>用户名称</div>
                          <div>会员类型</div>
                          <div>开始时间</div>
                          <div>结束时间</div>
                          <div>操作</div>
                        </div>
                      </div>
                      {memberships.length > 0 ? (
                        memberships.map((membership) => (
                          <div
                            key={membership.id}
                            className="px-4 py-3 border-b hover:bg-gray-50"
                          >
                            <div className="grid grid-cols-6 gap-4">
                              <div className="font-mono text-sm">
                                {membership.user_id}
                              </div>
                              <div>{membership.user_name}</div>
                              <div>
                                {normalizeMembershipType(membership.membership_type) === 'yearly'
                                  ? "年度VIP"
                                  : normalizeMembershipType(membership.membership_type) === 'monthly'
                                  ? "月卡会员"
                                  : membership.membership_type}
                              </div>
                              <div>{membership.start_date}</div>
                              <div>{membership.end_date}</div>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setRenewDialog({ open: true, membership })
                                  }
                                  disabled={isProcessing === membership.id}
                                >
                                  {isProcessing === membership.id
                                    ? "处理中..."
                                    : "续费"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() =>
                                    setCancelDialog({ open: true, membership })
                                  }
                                  disabled={isProcessing === membership.id}
                                >
                                  {isProcessing === membership.id
                                    ? "处理中..."
                                    : "取消"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-12 text-center text-muted-foreground">
                          暂无会员数据
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* 个人实盘 */}
              <TabsContent value="portfolio">
                <div className="space-y-4">
                  <h3 className="font-medium">内容管理</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link href="/admin/portfolio">
                      <Card className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all">
                        <CardContent className="p-5 flex items-center gap-4">
                          <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                            <LineChart className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">个人实盘</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              每日截图记录
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                    <Link href="/admin/reviews">
                      <Card className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all">
                        <CardContent className="p-5 flex items-center gap-4">
                          <div className="p-2.5 rounded-lg bg-amber-100 shrink-0">
                            <FileText className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">每日复盘</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              年卡专属文章
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </div>
                </div>
              </TabsContent>

              {/* 兑换码 */}
              <TabsContent value="redeem">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">兑换码管理</h3>
                    <Button asChild>
                      <Link href="/admin/redeem">进入兑换码管理</Link>
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    生成、查看和管理会员兑换码。月卡有效期 30 天，年卡有效期 365 天。
                  </p>
                </div>
              </TabsContent>

              {/* 设置 */}
              <TabsContent value="settings">
                <ReadingSettingsTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      {/* 升级会员对话框 */}
      <Dialog
        open={upgradeDialog.open}
        onOpenChange={(open) =>
          setUpgradeDialog({ ...upgradeDialog, open })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>升级会员</DialogTitle>
            <DialogDescription>
              为用户「{upgradeDialog.userName}」开通会员权限
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium mb-2">会员类型</label>
            <Select
              value={upgradePlanType}
              onValueChange={setUpgradePlanType}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择会员类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">月卡（30天）</SelectItem>
                <SelectItem value="yearly">年卡（365天）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUpgradeDialog({ open: false, userId: "", userName: "" })}
            >
              取消
            </Button>
            <Button
              onClick={handleUpgradeMembershipConfirm}
              disabled={isProcessing === upgradeDialog.userId}
            >
              {isProcessing === upgradeDialog.userId && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              确认升级
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 续费确认对话框 */}
      <Dialog
        open={renewDialog.open}
        onOpenChange={(open) =>
          setRenewDialog({ ...renewDialog, open })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认续费</DialogTitle>
            <DialogDescription>
              确定要为「{renewDialog.membership?.user_name}」续费
              {renewDialog.membership?.membership_type === "annual_vip"
                ? "一年"
                : "30天"}
              吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenewDialog({ open: false, membership: null })}
            >
              取消
            </Button>
            <Button
              onClick={handleRenewConfirm}
              disabled={
                isProcessing === renewDialog.membership?.id
              }
            >
              {isProcessing === renewDialog.membership?.id && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              确认续费
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 取消会员确认对话框 */}
      <Dialog
        open={cancelDialog.open}
        onOpenChange={(open) =>
          setCancelDialog({ ...cancelDialog, open })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认取消会员</DialogTitle>
            <DialogDescription>
              确定要取消「{cancelDialog.membership?.user_name}」的会员资格吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialog({ open: false, membership: null })}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelConfirm}
              disabled={
                isProcessing === cancelDialog.membership?.id
              }
            >
              {isProcessing === cancelDialog.membership?.id && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              确认取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 降级月卡确认对话框 */}
      <Dialog
        open={downgradeDialog.open}
        onOpenChange={(open) =>
          setDowngradeDialog({ ...downgradeDialog, open })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认降级为月卡</DialogTitle>
            <DialogDescription>
              确定要将「{downgradeDialog.membership?.user_name}」从年卡降级为月卡吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDowngradeDialog({ open: false, membership: null })}
            >
              取消
            </Button>
            <Button
              onClick={handleDowngradeConfirm}
              disabled={
                isProcessing === downgradeDialog.membership?.id
              }
            >
              {isProcessing === downgradeDialog.membership?.id && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              确认降级
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// 阅读设置选项卡（保留原有逻辑）
function ReadingSettingsTab() {
  const [settings, setSettings] = React.useState({
    guest_read_limit: 3,
    monthly_daily_limit: 8,
    referral_bonus_count: 2,
  })
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/reading-settings")
        const data = await res.json()
        setSettings({
          guest_read_limit: data.guest_read_limit ?? 3,
          monthly_daily_limit: data.monthly_daily_limit ?? 8,
          referral_bonus_count: data.referral_bonus_count ?? 2,
        })
      } catch (error) {
        console.error("获取设置失败:", error)
      } finally {
        setLoading(false)
      }
    }
    void fetchSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/reading-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast.success("设置已保存")
      } else {
        toast.error("保存失败")
      }
    } catch (error) {
      console.error("保存设置失败:", error)
      toast.error("保存失败")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium mb-4">阅读限制设置</h3>
        <p className="text-sm text-muted-foreground mb-6">
          配置网站的阅读限制规则。修改后立即生效。
        </p>
      </div>

      <div className="grid gap-6 max-w-xl">
        <div className="space-y-2">
          <label className="text-sm font-medium">游客阅读上限（篇）</label>
          <p className="text-xs text-muted-foreground">
            未登录用户可阅读的文章篇数上限
          </p>
          <input
            type="number"
            min="0"
            value={settings.guest_read_limit}
            onChange={(e) =>
              setSettings({
                ...settings,
                guest_read_limit: parseInt(e.target.value) || 0,
              })
            }
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">月卡每日阅读上限（篇）</label>
          <p className="text-xs text-muted-foreground">
            月卡用户每天可阅读的文章篇数上限
          </p>
          <input
            type="number"
            min="0"
            value={settings.monthly_daily_limit}
            onChange={(e) =>
              setSettings({
                ...settings,
                monthly_daily_limit: parseInt(e.target.value) || 0,
              })
            }
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">邀请奖励次数（次）</label>
          <p className="text-xs text-muted-foreground">
            每成功邀请一位用户注册，增加的阅读次数
          </p>
          <input
            type="number"
            min="0"
            value={settings.referral_bonus_count}
            onChange={(e) =>
              setSettings({
                ...settings,
                referral_bonus_count: parseInt(e.target.value) || 0,
              })
            }
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              保存中...
            </>
          ) : (
            "保存设置"
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            setSettings({
              guest_read_limit: 3,
              monthly_daily_limit: 8,
              referral_bonus_count: 2,
            })
          }
        >
          恢复默认
        </Button>
      </div>
    </div>
  )
}
