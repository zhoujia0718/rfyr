'use server'

import { supabase } from '@/lib/supabase'
import React from 'react'

// 分类类型定义
export interface Category {
  id: string
  name: string
  icon: string
  description: string
  href: string
  parent_id: string | null
  children: Category[]
  created_at: string
  updated_at: string
}

// 构建树形结构
function buildTree(items: any[], parentId: string | null = null): Category[] {
  return items
    .filter(item => item.parent_id === parentId)
    .map(item => ({
      id: item.id,
      name: item.name,
      icon: item.icon,
      description: item.description,
      href: item.href,
      parent_id: item.parent_id,
      children: buildTree(items, item.id),
      created_at: item.created_at,
      updated_at: item.updated_at
    }))
}

// 分类数据获取函数
export async function getCategories() {
  try {
    const { data: categoriesData, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
      return []
    }

    return buildTree(categoriesData || [])
  } catch (error) {
    console.error('Error getting categories:', error)
    return []
  }
}

// 主组件
export default async function CategoriesPage() {
  const categories = await getCategories()

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">分类列表</h3>
        <a 
          href="/admin/categories/create" 
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          添加分类
        </a>
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
        <div className="divide-y">
          {categories.length > 0 ? (
            categories.map((category) => (
              <CategoryItem key={category.id} category={category} level={0} />
            ))
          ) : (
            <div className="px-4 py-12 text-center text-muted-foreground">
              暂无分类数据
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 导入客户端组件
import CategoryItem from './CategoryItem'
