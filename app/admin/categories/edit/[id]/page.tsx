"use client"

import * as React from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Category } from "@/lib/articles"
import { toast } from "sonner"

export default function EditCategoryPage() {
  const router = useRouter()
  const params = useParams()
  const categoryId = params.id as string

  const [category, setCategory] = React.useState<Category | null>(null)
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const [formData, setFormData] = React.useState({
    name: "",
    icon: "",
    description: "",
    href: "",
    parentId: ""
  })

  // 加载分类数据
  React.useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)

        // 获取分类详情
        const { data: categoryData, error: categoryError } = await supabase
          .from('categories')
          .select('*')
          .eq('id', categoryId)
          .single()

        if (categoryError) {
          console.error('Error fetching category:', categoryError)
          toast.error('获取分类详情失败')
        } else {
          setCategory(categoryData)
          setFormData({
            name: categoryData.name,
            icon: categoryData.icon,
            description: categoryData.description,
            href: categoryData.href,
            parentId: categoryData.parent_id || "none"
          })
        }

        // 获取分类列表（用于选择父分类）
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('*')
          .order('created_at', { ascending: true })

        if (categoriesError) {
          console.error('Error fetching categories:', categoriesError)
          toast.error('获取分类列表失败')
        } else {
          // 构建树形结构
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
        }
      } catch (error) {
        console.error('Error loading data:', error)
        toast.error('加载数据失败')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [categoryId])

  // 保存分类
  const handleSaveCategory = async () => {
    try {
      setSaving(true)

      const { error } = await supabase
        .from('categories')
        .update({
          name: formData.name,
          icon: formData.icon,
          description: formData.description,
          href: formData.href,
          parent_id: formData.parentId === "none" ? null : formData.parentId
        })
        .eq('id', categoryId)

      if (error) {
        console.error('Error updating category:', error)
        toast.error('更新分类失败')
      } else {
        toast.success('更新分类成功')
        router.push('/admin')
      }
    } catch (error) {
      console.error('Error saving category:', error)
      toast.error('保存分类失败')
    } finally {
      setSaving(false)
    }
  }

  // 渲染分类选项（用于选择父分类）
  const renderCategoryOptions = (categories: Category[], prefix = '') => {
    return categories.map(category => (
      <React.Fragment key={category.id}>
        {category.id !== categoryId && (
          <SelectItem value={category.id}>{prefix}{category.icon} {category.name}</SelectItem>
        )}
        {category.children && category.children.length > 0 && (
          renderCategoryOptions(category.children, prefix + '  ')
        )}
      </React.Fragment>
    ))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (!category) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">分类不存在</p>
          <Button onClick={() => router.push('/admin')}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            返回管理中心
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push('/admin')}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            返回管理中心
          </Button>
          <h1 className="text-xl font-bold">编辑分类</h1>
          <div></div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>编辑分类</CardTitle>
            <CardDescription>修改分类信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">分类名称</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="输入分类名称"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">图标</label>
                <Input
                  value={formData.icon}
                  onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                  placeholder="输入分类图标（emoji）"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">描述</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="输入分类描述"
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">链接</label>
                <Input
                  value={formData.href}
                  onChange={(e) => setFormData(prev => ({ ...prev, href: e.target.value }))}
                  placeholder="输入分类链接"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">父分类</label>
                <Select
                  value={formData.parentId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, parentId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择父分类（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无（顶级分类）</SelectItem>
                    {renderCategoryOptions(categories)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
          <div className="p-6 border-t flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => router.push('/admin')}
            >
              取消
            </Button>
            <Button 
              onClick={handleSaveCategory}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  )
}
