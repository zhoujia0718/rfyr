"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, Users, FileText, Settings, LogOut, Check, X, ZoomIn, CreditCard, AlertCircle, Loader2, LineChart, KeyRound } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase"
import { Article, Category } from "@/lib/articles"
import { getPendingPayments, approvePaymentAtomic, Payment } from "@/lib/payments"
import { toast } from "sonner"
import CategoryItem from "./categories/CategoryItem"
import { TreeViewItem, TreeViewTrigger, TreeViewContent } from "@/components/ui/tree-view"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export default function AdminPage() {
  const [stats, setStats] = React.useState([
    {
      title: "总用户数",
      value: 0,
      icon: Users,
      color: "bg-blue-500"
    },
    {
      title: "会员数量",
      value: 0,
      icon: Users,
      color: "bg-green-500"
    },
    {
      title: "文章总数",
      value: 0,
      icon: FileText,
      color: "bg-amber-500"
    },
    {
      title: "今日访问量",
      value: 0,
      icon: BarChart3,
      color: "bg-purple-500"
    }
  ])
  const [articles, setArticles] = React.useState<Article[]>([])
  const [categories, setCategories] = React.useState<Category[]>([])
  const [users, setUsers] = React.useState<any[]>([])
  const [memberships, setMemberships] = React.useState<any[]>([])
  const [payments, setPayments] = React.useState<Payment[]>([])
  const [loading, setLoading] = React.useState(true)
  const [processing, setProcessing] = React.useState<string | null>(null)
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null)
  const [error, setError] = React.useState('')
  const [openItems, setOpenItems] = React.useState<string[]>([])
  const [isProcessingMembership, setIsProcessingMembership] = React.useState<string | null>(null)
  const [editMembershipDialog, setEditMembershipDialog] = React.useState<{ open: boolean; membership: any }>({ open: false, membership: null })
  const [editStartDate, setEditStartDate] = React.useState('')
  const [editEndDate, setEditEndDate] = React.useState('')

  // 根据分类 ID 获取分类名称
  const getCategoryName = (categories: Category[], categoryId: string): string => {
    for (const category of categories) {
      if (category.id === categoryId) {
        return category.name
      }
      if (category.children && category.children.length > 0) {
        const name = getCategoryName(category.children, categoryId)
        if (name) return name
      }
    }
    return ''
  }

  React.useEffect(() => {
    const loadData = async () => {
      try {
        // 检查用户是否已登录（优先 localStorage，兼容 cookie）
        let isAuthenticated = false
        let currentUser = null

        // 1. 优先检查 localStorage（登录接口同步写入）
        try {
          const stored = localStorage.getItem('custom_auth')
          if (stored) {
            const authData = JSON.parse(stored)
            const maxAge = 7 * 24 * 60 * 60 * 1000 // 7天
            if (Date.now() - authData.loginTime < maxAge) {
              isAuthenticated = true
              currentUser = authData.user
            } else {
              localStorage.removeItem('custom_auth')
            }
          }
        } catch {
          localStorage.removeItem('custom_auth')
        }

        // 2. 检查 admin-session cookie（服务端登录接口写入）
        if (!isAuthenticated) {
          const allCookies = "; " + document.cookie
          const match = allCookies.split('; ').find(c => c.startsWith('admin-session='))
          if (match) {
            const userId = match.split('=')[1]
            if (userId && userId.length > 0) {
              isAuthenticated = true
              currentUser = { id: userId }
            }
          }
        }

        // 如果没有自定义登录状态，检查 Supabase 的登录状态
        if (!isAuthenticated) {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            isAuthenticated = true
            currentUser = user
          }
        }

        if (!isAuthenticated) {
          toast.error('请先登录')
          window.location.href = '/'
          return
        }

        setLoading(true)

        // 并行获取所有统计数据
        const [articlesCountResult, usersCountResult, membershipsCountResult] = await Promise.all([
          supabase.from('articles').select('*', { count: 'exact', head: true }),
          supabase.from('users').select('*', { count: 'exact', head: true }),
          supabase.from('memberships').select('*', { count: 'exact', head: true })
        ])
        
        setStats([
          {
            title: "总用户数",
            value: usersCountResult.count ?? 0,
            icon: Users,
            color: "bg-blue-500"
          },
          {
            title: "会员数量",
            value: membershipsCountResult.count ?? 0,
            icon: Users,
            color: "bg-green-500"
          },
          {
            title: "文章总数",
            value: articlesCountResult.count ?? 0,
            icon: FileText,
            color: "bg-amber-500"
          },
          {
            title: "今日访问量",
            value: 0,
            icon: BarChart3,
            color: "bg-purple-500"
          }
        ])
        
        // 并行获取文章和分类数据
        const [articlesResult, categoriesResult] = await Promise.all([
          supabase.from('articles').select('*').order('created_at', { ascending: false }),
          supabase.from('categories').select('*').order('created_at', { ascending: true })
        ])

        if (articlesResult.error) {
          toast.error('获取文章列表失败')
        } else {
          setArticles(articlesResult.data || [])
        }

        if (categoriesResult.error) {
          toast.error('获取分类列表失败')
        } else {
          const buildTree = (items: any[], parentId?: string): Category[] => {
            return items
              .filter(item => (item.parent_id === parentId) || (parentId === undefined && item.parent_id === null))
              .map(item => ({
                id: item.id,
                name: item.name,
                icon: item.icon,
                description: item.description,
                href: item.href,
                parentId: item.parent_id,
                children: buildTree(items, item.id)
              }))
          }

          setCategories(buildTree(categoriesResult.data || []))
        }

        // 用户和会员数据延迟加载，不阻塞页面显示
        setTimeout(async () => {
          const [usersResult, membershipsResult] = await Promise.all([
            supabase.from('users').select('*').order('created_at', { ascending: false }),
            supabase.from('memberships').select('*').order('created_at', { ascending: false })
          ])

          if (usersResult.error) {
            console.error('Error fetching users:', usersResult.error)
          } else {
            setUsers(usersResult.data || [])
          }

          if (membershipsResult.error) {
            console.error('Error fetching memberships:', membershipsResult.error)
          } else {
            const usersData = usersResult.data || []
            const membershipsWithUserNames = (membershipsResult.data || []).map(membership => {
              const user = usersData.find((u: any) => u.id === membership.user_id)
              let userName = '日富一日用户'
              if (user) {
                if (user.id === '00000000-0000-0000-0000-000000000001') {
                  userName = '普通用户'
                } else if (user.id === '00000000-0000-0000-0000-000000000002') {
                  userName = '管理员'
                } else {
                  userName = user.username || user.phone || '日富一日用户'
                }
              }
              return {
                ...membership,
                user_name: userName
              }
            })
            setMemberships(membershipsWithUserNames)
          }

          // 加载待审核的支付记录
          await loadPayments()
        }, 100)

      } catch (error) {
        console.error('Error loading data:', error)
        toast.error('加载数据失败')
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
    
    // 暴露刷新函数到全局，方便手动刷新
    ;(window as any).refreshAdminData = loadData
  }, [])

  const handleDeleteArticle = async (id: string) => {
    if (confirm('确定要删除这篇文章吗？')) {
      try {
        const { error } = await supabase
          .from('articles')
          .delete()
          .eq('id', id)
        
        if (error) {
          console.error('Error deleting article:', error)
          toast.error('删除文章失败')
        } else {
          setArticles(prev => prev.filter(article => article.id !== id))
          toast.success('删除文章成功')
          
          // 更新统计数据
          const { count } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true })
          
          setStats(prev => prev.map(stat => 
            stat.title === "文章总数" 
              ? { ...stat, value: count || 0 }
              : stat
          ))
        }
      } catch (error) {
        console.error('Error deleting article:', error)
        toast.error('删除文章失败')
      }
    }
  }

  const handleEditArticle = (id: string) => {
    window.location.href = `/admin/articles?id=${id}`
  }

  const handleEditCategory = (id: string) => {
    window.location.href = `/admin/categories/edit/${id}`
  }

  const handleDeleteCategory = async (id: string) => {
    if (confirm('确定要删除这个分类吗？')) {
      try {
        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('id', id)
        
        if (error) {
          console.error('Error deleting category:', error)
          toast.error('删除分类失败')
        } else {
          const { data: categoriesData } = await supabase
            .from('categories')
            .select('*')
            .order('created_at', { ascending: true })
          
          const buildTree = (items: any[], parentId?: string): Category[] => {
            return items
              .filter(item => (item.parent_id === parentId) || (parentId === undefined && item.parent_id === null))
              .map(item => ({
                id: item.id,
                name: item.name,
                icon: item.icon,
                description: item.description,
                href: item.href,
                parentId: item.parent_id,
                children: buildTree(items, item.id)
              }))
          }
          
          setCategories(buildTree(categoriesData || []))
          toast.success('删除分类成功')
        }
      } catch (error) {
        console.error('Error deleting category:', error)
        toast.error('删除分类失败')
      }
    }
  }

  const loadPayments = React.useCallback(async () => {
    try {
      const { data, error } = await getPendingPayments()
      if (error) {
        setError(error)
        setPayments([])
        return
      }
      setPayments(data)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : '加载支付记录失败')
    }
  }, [])

  const handleApprove = async (payment: Payment) => {
    setProcessing(payment.id)
    try {
      const { error } = await approvePaymentAtomic(payment.id, payment.user_id)
      if (error) {
        setError(error)
        toast.error('审核失败')
        return
      }
      await loadPayments()
      setError('')
      toast.success('审核通过，会员权限已开通')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : '审核失败')
      toast.error('审核失败')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (paymentId: string) => {
    if (!confirm('确定要拒绝这个支付申请吗？')) {
      return
    }

    setProcessing(paymentId)
    try {
      const { error } = await supabase
        .from('payments')
        .update({ status: 'rejected' })
        .eq('id', paymentId)

      if (error) throw error

      await loadPayments()
      setError('')
      toast.success('已拒绝该支付申请')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : '拒绝失败')
      toast.error('拒绝失败')
    } finally {
      setProcessing(null)
    }
  }

  const getPlanTypeLabel = (planType: string) => {
    return planType === 'weekly' ? '周卡' : '年卡'
  }

  const getPlanTypeBadge = (planType: string) => {
    return planType === 'weekly' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
  }

  const handleUpgradeMembership = (userId: string) => {
    const planType = prompt('请选择会员类型：\n1. 周卡会员\n2. 年卡会员\n\n请输入 1 或 2')
    
    if (planType === '1' || planType === '2') {
      const membershipType = planType === '1' ? 'weekly' : 'yearly'
      const planLabel = planType === '1' ? '周卡' : '年卡'
      
      if (confirm(`确定要将用户升级为${planLabel}会员吗？`)) {
        upgradeUserToMembership(userId, membershipType)
      }
    }
  }

  const upgradeUserToMembership = async (userId: string, planType: 'weekly' | 'yearly') => {
    try {
      // 1. 更新 users 表的 vip_tier 字段
      const { error: usersError } = await supabase
        .from('users')
        .update({ vip_tier: planType })
        .eq('id', userId)
      
      if (usersError) {
        console.warn('更新 users 表失败:', usersError)
        // 继续执行，不中断流程
      }
      
      // 2. 更新 user_profiles 表的 vip_status 为 TRUE
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ vip_status: true, updated_at: new Date().toISOString() })
        .eq('id', userId)
      
      if (profileError) {
        throw profileError
      }
      
      // 2. 删除用户现有的所有会员记录（确保一个用户只有一个会员权限）
      const { error: deleteError } = await supabase
        .from('memberships')
        .delete()
        .eq('user_id', userId)
      
      if (deleteError) {
        console.warn('删除现有会员记录失败:', deleteError)
        // 继续执行，不中断流程
      }
      
      // 3. 生成会员结束时间
      const endDate = new Date()
      if (planType === 'weekly') {
        endDate.setDate(endDate.getDate() + 8)
      } else {
        endDate.setFullYear(endDate.getFullYear() + 1)
        endDate.setDate(endDate.getDate() + 1)
      }
      
      // 4. 在 memberships 表中创建会员记录
      const { error: membershipError } = await supabase
        .from('memberships')
        .insert({
          user_id: userId,
          membership_type: planType === 'weekly' ? 'weekly_vip' : 'annual_vip',
          start_date: new Date().toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          status: 'active'
        })
      
      if (membershipError) {
        throw membershipError
      }
      
      toast.success(`用户已成功升级为${planType === 'weekly' ? '周卡' : '年卡'}会员`)
      
      // 刷新用户和会员数据
      const [usersResult, membershipsResult] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }),
        supabase.from('memberships').select('*').order('created_at', { ascending: false })
      ])
      
      if (usersResult.data) {
        setUsers(usersResult.data)
      }
      
      if (membershipsResult.data) {
        // 关联用户名称
        const usersData = usersResult.data || []
        const membershipsWithUserNames = membershipsResult.data.map(membership => {
          const user = usersData.find(u => u.id === membership.user_id)
          let userName = '日富一日用户'
          if (user) {
            if (user.id === '00000000-0000-0000-0000-000000000001') {
              userName = '普通用户'
            } else if (user.id === '00000000-0000-0000-0000-000000000002') {
              userName = '管理员'
            } else {
              userName = user.username || user.phone || '日富一日用户'
            }
          }
          return {
            ...membership,
            user_name: userName
          }
        })
        setMemberships(membershipsWithUserNames)
      }
      
    } catch (error: unknown) {
      console.error('升级会员失败:', error)
      toast.error('升级会员失败，请重试')
    }
  }

  const handleRenewMembership = async (membership: any) => {
    // 防止重复点击
    if (isProcessingMembership === membership.id) {
      return
    }
    
    try {
      setIsProcessingMembership(membership.id)
      
      // 确定会员类型
      const isAnnual = membership.membership_type === 'annual_vip'
      
      // 计算新的结束日期（在现有结束日期基础上延长）
      const currentEndDate = new Date(membership.end_date)
      const newEndDate = new Date(currentEndDate)
      
      if (isAnnual) {
        newEndDate.setFullYear(newEndDate.getFullYear() + 1)
        newEndDate.setDate(newEndDate.getDate() + 1)
      } else {
        newEndDate.setDate(newEndDate.getDate() + 8)
      }
      
      // 更新会员记录
      const { error: updateError } = await supabase
        .from('memberships')
        .update({
          end_date: newEndDate.toISOString().split('T')[0],
          status: 'active'
        })
        .eq('id', membership.id)
      
      if (updateError) {
        throw updateError
      }
      
      // 刷新会员数据
      const { data: membershipsData } = await supabase
        .from('memberships')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (membershipsData) {
        // 关联用户名称
        const usersData = users || []
        const membershipsWithUserNames = membershipsData.map(m => {
          const user = usersData.find(u => u.id === m.user_id)
          let userName = '日富一日用户'
          if (user) {
            if (user.id === '00000000-0000-0000-0000-000000000001') {
              userName = '普通用户'
            } else if (user.id === '00000000-0000-0000-0000-000000000002') {
              userName = '管理员'
            } else {
              userName = user.username || user.phone || '日富一日用户'
            }
          }
          return {
            ...m,
            user_name: userName
          }
        })
        setMemberships(membershipsWithUserNames)
      }
      
      toast.success(`会员已成功续费${isAnnual ? '一年' : '一周'}`)
    } catch (error: unknown) {
      console.error('续费失败:', error)
      toast.error('续费失败，请重试')
    } finally {
      setIsProcessingMembership(null)
    }
  }

  const handleCancelMembership = async (membershipId: string) => {
    // 防止重复点击
    if (isProcessingMembership === membershipId) {
      return
    }
    
    if (!confirm('确定要取消这个会员吗？')) {
      return
    }
    
    try {
      setIsProcessingMembership(membershipId)
      
      // 1. 获取会员记录，以便获取用户ID
      const { data: membershipData } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('id', membershipId)
        .single()
      
      if (membershipData) {
        // 2. 更新用户的vip_status为false
        await supabase
          .from('user_profiles')
          .update({ vip_status: false, updated_at: new Date().toISOString() })
          .eq('id', membershipData.user_id)
        
        // 3. 更新 users 表的 vip_tier 为 none
        await supabase
          .from('users')
          .update({ vip_tier: 'none' })
          .eq('id', membershipData.user_id)
      }
      
      // 3. 删除会员记录
      const { error: deleteError } = await supabase
        .from('memberships')
        .delete()
        .eq('id', membershipId)
      
      if (deleteError) {
        throw deleteError
      }
      
      // 4. 刷新用户和会员数据
      const [usersResult, membershipsResult] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }),
        supabase.from('memberships').select('*').order('created_at', { ascending: false })
      ])
      
      if (usersResult.data) {
        setUsers(usersResult.data)
      }
      
      if (membershipsResult.data) {
        // 关联用户名称
        const usersData = usersResult.data || []
        const membershipsWithUserNames = membershipsResult.data.map(membership => {
          const user = usersData.find(u => u.id === membership.user_id)
          let userName = '日富一日用户'
          if (user) {
            if (user.id === '00000000-0000-0000-0000-000000000001') {
              userName = '普通用户'
            } else if (user.id === '00000000-0000-0000-0000-000000000002') {
              userName = '管理员'
            } else {
              userName = user.username || user.phone || '日富一日用户'
            }
          }
          return {
            ...membership,
            user_name: userName
          }
        })
        setMemberships(membershipsWithUserNames)
      }
      
      toast.success('会员已取消')
    } catch (error: unknown) {
      console.error('取消会员失败:', error)
      toast.error('取消会员失败，请重试')
    } finally {
      setIsProcessingMembership(null)
    }
  }

  /** 将年卡用户降级为周卡：保留 memberships 记录，改为 weekly_vip，重新算 end_date */
  const handleDowngradeToWeekly = async (membershipId: string) => {
    if (!confirm('确定将该用户从年卡降级为周卡？')) return
    if (isProcessingMembership === membershipId) return

    try {
      setIsProcessingMembership(membershipId)

      const { data: membershipData } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('id', membershipId)
        .single()

      if (!membershipData) {
        toast.error('找不到该会员记录')
        return
      }

      const endDate = new Date()
      endDate.setDate(endDate.getDate() + 8)

      await supabase
        .from('users')
        .update({ vip_tier: 'weekly' })
        .eq('id', membershipData.user_id)

      await supabase
        .from('memberships')
        .update({
          membership_type: 'weekly_vip',
          end_date: endDate.toISOString(),
        })
        .eq('id', membershipId)

      toast.success('已降级为周卡')

      const [usersResult, membershipsResult] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }),
        supabase.from('memberships').select('*').order('created_at', { ascending: false }),
      ])

      if (usersResult.data) setUsers(usersResult.data)

      if (membershipsResult.data) {
        const usersData = usersResult.data || []
        setMemberships(
          membershipsResult.data.map((membership) => {
            const user = usersData.find((u) => u.id === membership.user_id)
            let userName = '日富一日用户'
            if (user) {
              if (user.id === '00000000-0000-0000-0000-000000000001') userName = '普通用户'
              else if (user.id === '00000000-0000-0000-0000-000000000002') userName = '管理员'
              else userName = user.username || user.phone || '日富一日用户'
            }
            return { ...membership, user_name: userName }
          })
        )
      }
    } catch (error) {
      console.error('降级失败:', error)
      toast.error('降级失败，请重试')
    } finally {
      setIsProcessingMembership(null)
    }
  }

  const handleEditMembership = (membership: any) => {
    setEditMembershipDialog({ open: true, membership })
    setEditStartDate(membership.start_date)
    setEditEndDate(membership.end_date)
  }

  const handleSaveMembershipPeriod = async () => {
    if (!editStartDate || !editEndDate) {
      toast.error('请选择开始日期和结束日期')
      return
    }

    if (!editMembershipDialog.membership) {
      toast.error('会员信息不存在')
      return
    }

    try {
      const { error } = await supabase
        .from('memberships')
        .update({
          start_date: editStartDate,
          end_date: editEndDate
        })
        .eq('id', editMembershipDialog.membership.id)
      
      if (error) {
        throw error
      }
      
      // 刷新会员数据
      const { data: membershipsData } = await supabase
        .from('memberships')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (membershipsData) {
        const usersData = users || []
        const membershipsWithUserNames = membershipsData.map(membership => {
          const user = usersData.find(u => u.id === membership.user_id)
          let userName = '日富一日用户'
          if (user) {
            if (user.id === '00000000-0000-0000-0000-000000000001') {
              userName = '普通用户'
            } else if (user.id === '00000000-0000-0000-0000-000000000002') {
              userName = '管理员'
            } else {
              userName = user.username || user.phone || '日富一日用户'
            }
          }
          return {
            ...membership,
            user_name: userName
          }
        })
        setMemberships(membershipsWithUserNames)
      }
      
      toast.success('会员周期已更新')
      setEditMembershipDialog({ open: false, membership: null })
    } catch (error: any) {
      console.error('更新会员周期失败:', error)
      toast.error('更新会员周期失败，请重试')
    }
  }

  const renderCategoryTree = (categories: Category[]) => {
    return categories.map((category) => (
      <TreeViewItem key={category.id} value={category.id}>
        <div className="flex items-center justify-between w-full py-2">
          <div className="flex items-center gap-2">
            <TreeViewTrigger showChevron={true}>
              {category.icon} {category.name}
            </TreeViewTrigger>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleEditCategory(category.id)}
            >
              编辑
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-red-600"
              onClick={() => handleDeleteCategory(category.id)}
            >
              删除
            </Button>
          </div>
        </div>
        {category.children && category.children.length > 0 && (
          <TreeViewContent>
            {renderCategoryTree(category.children)}
          </TreeViewContent>
        )}
      </TreeViewItem>
    ))
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
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              设置
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.href = "/admin/login"}>
              <LogOut className="h-4 w-4 mr-2" />
              退出登录
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon
            return (
              <Card key={index}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
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
              <TabsList className="grid w-full grid-cols-6">
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
              </TabsList>
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
                      {loading ? (
                        Array.from({ length: 5 }).map((_, index) => (
                          <div key={index} className="px-4 py-3 border-b animate-pulse">
                            <div className="grid grid-cols-6 gap-4">
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="flex gap-2">
                                <div className="h-8 w-16 bg-gray-200 rounded"></div>
                                <div className="h-8 w-16 bg-gray-200 rounded"></div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : users.length > 0 ? (
                        users.map((user) => {
                          // 查找用户的会员记录
                          const userMembership = memberships.find(m => m.user_id === user.id)
                          let membershipStatus = '普通'
                          
                          if (userMembership) {
                            if (userMembership.membership_type === 'annual_vip') {
                              membershipStatus = '年卡'
                            } else if (userMembership.membership_type === 'weekly_vip') {
                              membershipStatus = '周卡'
                            }
                          }
                          
                          return (
                            <div key={user.id} className="px-4 py-3 border-b hover:bg-gray-50">
                              <div className="grid grid-cols-6 gap-4">
                                <div className="font-mono text-sm">{user.id}</div>
                                <div>
                                  {user.id === '00000000-0000-0000-0000-000000000001' ? '普通用户' : 
                                   user.id === '00000000-0000-0000-0000-000000000002' ? '管理员' : 
                                   user.username || user.phone || '日富一日用户'}
                                </div>
                                <div>{user.created_at.substring(0, 10)}</div>
                                <div>{membershipStatus}</div>
                                <div className="flex gap-2">
                                  <Button variant="ghost" size="sm">编辑</Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-green-600"
                                    onClick={() => handleUpgradeMembership(user.id)}
                                  >
                                    升级会员
                                  </Button>
                                  {userMembership?.membership_type === 'annual_vip' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-amber-600"
                                      onClick={() => handleDowngradeToWeekly(userMembership.id)}
                                    >
                                      降级周卡
                                    </Button>
                                  )}
                                  {userMembership && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-orange-600"
                                      onClick={() => handleCancelMembership(userMembership.id)}
                                    >
                                      取消会员
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="sm" className="text-red-600">删除</Button>
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
                    {loading ? (
                      Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="px-4 py-3 border-b animate-pulse">
                          <div className="grid grid-cols-5 gap-4">
                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                            <div className="flex gap-2">
                              <div className="h-8 w-16 bg-gray-200 rounded"></div>
                              <div className="h-8 w-16 bg-gray-200 rounded"></div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : articles.length > 0 ? (
                      articles.map((article) => (
                        <div key={article.id} className="px-4 py-3 border-b hover:bg-gray-50">
                          <div className="grid grid-cols-5 gap-4">
                            <div>{article.title}</div>
                            <div>{article.category ? getCategoryName(categories, article.category) || article.category : '-'}</div>
                            <div>{article.publishDate}</div>
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
                    {loading ? (
                      Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="px-4 py-3 border-b animate-pulse">
                          <div className="grid grid-cols-4 gap-4">
                            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                            <div className="flex gap-2">
                              <div className="h-8 w-16 bg-gray-200 rounded"></div>
                              <div className="h-8 w-16 bg-gray-200 rounded"></div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : categories.length > 0 ? (
                      <div className="divide-y">
                        {categories.map((category) => (
                          <CategoryItem key={category.id} category={category} level={0} />
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
              <TabsContent value="membership">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <h3 className="font-medium">支付审核</h3>
                      {payments.length > 0 && (
                        <Button asChild>
                          <Link href="/admin/verify-payments" className="flex items-center bg-red-500 hover:bg-red-600 text-white">
                            <span className="text-xs px-2 py-1 rounded-full mr-2">
                              {payments.length}
                            </span>
                            查看审核
                          </Link>
                        </Button>
                      )}
                    </div>
                    <Button asChild>
                      <Link href="/admin/membership/create">手动开通会员</Link>
                    </Button>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  <div className="mt-8">
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
                      {loading ? (
                        Array.from({ length: 5 }).map((_, index) => (
                          <div key={index} className="px-4 py-3 border-b animate-pulse">
                            <div className="grid grid-cols-6 gap-4">
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                              <div className="flex gap-2">
                                <div className="h-8 w-16 bg-gray-200 rounded"></div>
                                <div className="h-8 w-16 bg-gray-200 rounded"></div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : memberships.length > 0 ? (
                        memberships.map((membership) => (
                          <div key={membership.id} className="px-4 py-3 border-b hover:bg-gray-50">
                            <div className="grid grid-cols-6 gap-4">
                              <div className="font-mono text-sm">{membership.user_id}</div>
                              <div>{membership.user_name}</div>
                              <div>{membership.membership_type === 'annual_vip' ? '年度VIP' : '周卡会员'}</div>
                              <div>{membership.start_date}</div>
                              <div>{membership.end_date}</div>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => handleEditMembership(membership)}>修改周期</Button>
                                <Button variant="ghost" size="sm" onClick={() => handleRenewMembership(membership)} disabled={isProcessingMembership === membership.id}>
                                  {isProcessingMembership === membership.id ? '处理中...' : '续费'}
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleCancelMembership(membership.id)} disabled={isProcessingMembership === membership.id}>
                                  {isProcessingMembership === membership.id ? '处理中...' : '取消'}
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
                            <p className="text-xs text-muted-foreground mt-0.5">每日截图记录</p>
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
                            <p className="text-xs text-muted-foreground mt-0.5">年卡专属文章</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="redeem">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">兑换码管理</h3>
                    <Button asChild>
                      <Link href="/admin/redeem">进入兑换码管理</Link>
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    生成、查看和管理会员兑换码。周卡有效期 7 天，年卡有效期 365 天。
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      {/* 图片放大预览 */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>支付凭证预览</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-4">
            <img
              src={selectedImage || ''}
              alt="支付凭证"
              className="max-h-[70vh] w-auto object-contain rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 修改会员周期弹窗 */}
      <Dialog open={editMembershipDialog.open} onOpenChange={(open) => setEditMembershipDialog({ open, membership: editMembershipDialog.membership })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改会员周期</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-2">开始日期</label>
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">结束日期</label>
              <input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditMembershipDialog({ open: false, membership: null })}>
                取消
              </Button>
              <Button onClick={handleSaveMembershipPeriod}>
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}