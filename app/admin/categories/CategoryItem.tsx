'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Category } from '@/lib/articles'

interface CategoryItemProps {
  category: Category
  level: number
  onDeleted?: (id: string) => void
  onRefresh?: () => void
}

export default function CategoryItem({ category, level, onDeleted, onRefresh }: CategoryItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/admin/categories/${category.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        toast.success('删除分类成功')
        setDeleteDialogOpen(false)
        onDeleted?.(category.id)
        onRefresh?.()
      } else {
        toast.error('删除分类失败')
      }
    } catch {
      toast.error('删除分类失败')
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
            {!children.length && <span className="w-5" />}
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
              onClick={() => setDeleteDialogOpen(true)}
            >
              删除
            </button>
          </div>
        </div>
      </div>
      {isExpanded && children.length > 0 && (
        <div className="divide-y">
          {children.map((child) => (
            <CategoryItem
              key={child.id}
              category={child}
              level={level + 1}
              onDeleted={onDeleted}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除分类</DialogTitle>
            <DialogDescription>
              确定要删除「{category.name}」吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
