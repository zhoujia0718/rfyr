"use client"

import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

interface TreeViewProps {
  children: React.ReactNode
  className?: string
  defaultValue?: string[]
}

interface TreeViewItemProps {
  children: React.ReactNode
  className?: string
  value: string
}

interface TreeViewTriggerProps {
  children: React.ReactNode
  className?: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  isOpen?: boolean
  showChevron?: boolean
}

interface TreeViewContentProps {
  children: React.ReactNode
  className?: string
}

const TreeView = React.forwardRef<HTMLDivElement, TreeViewProps>(({ children, className, defaultValue = [] }, ref) => {
  const [openItems, setOpenItems] = React.useState<string[]>(defaultValue)

  const toggleItem = (value: string) => {
    setOpenItems(prev => {
      if (prev.includes(value)) {
        return prev.filter(item => item !== value)
      } else {
        return [...prev, value]
      }
    })
  }

  // 递归处理所有子元素，包括嵌套的TreeViewItem
  const processChild = (child: React.ReactNode): React.ReactNode => {
    if (React.isValidElement<React.ComponentProps<typeof TreeViewItem>>(child) && (child.type as any).displayName === "TreeViewItem") {
      // 处理TreeViewItem的子元素
      const processedChildren: React.ReactNode = React.Children.map(child.props.children, processChild)
      // 克隆TreeViewItem并传递属性和处理后的子元素
      return React.cloneElement(child, { 
        openItems, 
        toggleItem,
        children: processedChildren 
      })
    }
    return child
  }

  return (
    <div ref={ref} className={cn("overflow-hidden", className)}>
      {React.Children.map(children, processChild)}
    </div>
  )
})
TreeView.displayName = "TreeView"

const TreeViewItem = React.forwardRef<HTMLDivElement, TreeViewItemProps & { openItems?: string[]; toggleItem?: (value: string) => void }>(({ children, className, value, openItems = [], toggleItem }, ref) => {
  const isOpen = openItems.includes(value)

  // 检查是否有TreeViewContent子组件
  let hasContent = false
  React.Children.map(children, child => {
    if (React.isValidElement(child) && (child.type as any).displayName === "TreeViewContent") {
      hasContent = true
    }
    return child
  })

  return (
    <div ref={ref} className={cn("flex flex-col", className)}>
      {React.Children.map(children, child => {
        if (React.isValidElement<React.ComponentProps<typeof TreeViewTrigger>>(child) && (child.type as any).displayName === "TreeViewTrigger") {
          // 检查是否有用户自定义的onClick事件
          const userOnClick = (child.props as any).onClick
          
          // 创建一个新的onClick处理函数，先执行用户的onClick，然后执行展开/折叠
          const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            // 先执行用户的onClick事件
            if (userOnClick) {
              userOnClick(e)
            }
            // 如果没有阻止默认行为，并且有内容，则执行展开/折叠
            if (!e.defaultPrevented && hasContent) {
              toggleItem?.(value)
            }
          }
          
          return React.cloneElement(child, { 
            onClick: handleClick,
            isOpen
          })
        }
        if (React.isValidElement(child) && (child.type as any).displayName === "TreeViewContent") {
          return isOpen ? child : null
        }
        // 对于其他子元素（如按钮），直接返回，不做任何处理
        return child
      })}
    </div>
  )
})
TreeViewItem.displayName = "TreeViewItem"

const TreeViewTrigger = React.forwardRef<HTMLButtonElement, TreeViewTriggerProps & { isOpen?: boolean }>(({ children, className, onClick, isOpen = false, showChevron = true }, ref) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // 执行onClick事件（可能是用户自定义的，也可能是TreeViewItem传递的）
    if (onClick) {
      onClick(e)
    }
  }

  return (
    <button
      ref={ref}
      className={cn(
        "flex h-8 items-center rounded-md px-2 text-sm font-medium transition-colors hover:bg-accent focus:bg-accent focus:outline-none",
        className
      )}
      onClick={handleClick}
    >
      {showChevron && (
        <div className="mr-2 h-4 w-4 flex-shrink-0">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      )}
      {children}
    </button>
  )
})
TreeViewTrigger.displayName = "TreeViewTrigger"

const TreeViewContent = React.forwardRef<HTMLDivElement, TreeViewContentProps>(({ children, className }, ref) => {
  return (
    <div ref={ref} className={cn("ml-4 border-l border-border pl-4", className)}>
      {children}
    </div>
  )
})
TreeViewContent.displayName = "TreeViewContent"

export { TreeView, TreeViewItem, TreeViewTrigger, TreeViewContent }
