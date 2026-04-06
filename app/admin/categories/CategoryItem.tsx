'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/lib/articles'

interface CategoryItemProps {
  category: Category
  level: number
}

export default function CategoryItem({ category, level }: CategoryItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const handleDelete = async () => {
    if (confirm('确定要删除这个分类吗？')) {
      try {
        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('id', category.id)

        if (error) {
          console.error('Error deleting category:', error)
          alert('删除分类失败')
        } else {
          // 刷新页面
          window.location.reload()
        }
      } catch (error) {
        console.error('Error deleting category:', error)
        alert('删除分类失败')
      }
    }
  }

  const children = category.children || []

  return (
    <>
      <div 
        className="px-4 py-3 hover:bg-gray-50"
        style={{ paddingLeft: `${24 + level * 24}px` }}
      >
        <div className="grid grid-cols-4 gap-4 items-center">
          <div className="flex items-center gap-2">
            {children.length > 0 && (
              <button
                className="flex-shrink-0"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-label={isExpanded ? '收起' : '展开'}
              >
                <div className="h-4 w-4">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </button>
            )}
            {!children.length && <span className="w-5"></span>}
            <span>{category.icon} {category.name}</span>
          </div>
          <div>{category.description}</div>
          <div>{new Date().toISOString().split('T')[0]}</div>
          <div className="flex gap-2">
            <a 
              href={`/admin/categories/edit/${category.id}`}
              className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
            >
              编辑
            </a>
            <button
              className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100"
              onClick={handleDelete}
            >
              删除
            </button>
          </div>
        </div>
      </div>
      {isExpanded && children.length > 0 && (
        <div className="divide-y">
          {children.map((child) => (
            <CategoryItem key={child.id} category={child} level={level + 1} />
          ))}
        </div>
      )}
    </>
  )
}
