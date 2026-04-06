"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Category } from "@/lib/articles"
import { toast } from "sonner"

export default function CreateCategoryPage() {
  const [formData, setFormData] = React.useState({
    name: "",
    icon: "",
    description: "",
    href: "",
    parentId: "none"
  })
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)

  // 加载分类列表
  React.useEffect(() => {
    const loadCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('created_at', { ascending: true })
        
        if (error) {
          console.error('Error fetching categories:', error)
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
          
          setCategories(buildTree(data || []))
        }
      } catch (error) {
        console.error('Error loading categories:', error)
        toast.error('加载分类列表失败')
      } finally {
        setLoading(false)
      }
    }

    loadCategories()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setSubmitting(true)
      
      const { error } = await supabase
        .from('categories')
        .insert({
          name: formData.name,
          icon: formData.icon,
          description: formData.description,
          href: formData.href,
          parent_id: formData.parentId === "none" ? null : formData.parentId
        })
      
      if (error) {
        console.error('Error creating category:', error)
        toast.error('创建分类失败')
      } else {
        toast.success('创建分类成功')
        window.location.href = '/admin'
      }
    } catch (error) {
      console.error('Error creating category:', error)
      toast.error('创建分类失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 渲染分类选项（用于选择父分类）
  const renderCategoryOptions = (categories: Category[], prefix = '') => {
    return categories.map(category => (
      <React.Fragment key={category.id}>
        <SelectItem value={category.id}>{prefix}{category.icon} {category.name}</SelectItem>
        {category.children && category.children.length > 0 && (
          renderCategoryOptions(category.children, prefix + '  ')
        )}
      </React.Fragment>
    ))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center">
          <Link href="/admin" className="flex items-center gap-2 text-primary hover:text-primary/80">
            <ArrowLeft className="h-5 w-5" />
            <span>返回管理中心</span>
          </Link>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>添加分类</CardTitle>
            <CardDescription>创建新的文章分类</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">分类名称</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="输入分类名称"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="icon">图标</Label>
                <Input
                  id="icon"
                  name="icon"
                  value={formData.icon}
                  onChange={handleChange}
                  placeholder="输入分类图标（emoji）"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">分类描述</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="输入分类描述"
                  rows={3}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="href">链接</Label>
                <Input
                  id="href"
                  name="href"
                  value={formData.href}
                  onChange={handleChange}
                  placeholder="输入分类链接"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parentId">父分类</Label>
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

              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={submitting}>
                  {submitting ? '创建中...' : '创建分类'}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => window.location.href = '/admin'} disabled={submitting}>
                  取消
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}