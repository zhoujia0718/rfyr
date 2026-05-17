"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useReadingLimit } from "@/hooks/use-reading-limit"
import { useReadingSettings } from "@/hooks/use-reading-settings"

export interface NavItem {
  title: string
  href?: string
  items?: NavItem[]
  accessLevel?: 'free' | 'monthly' | 'yearly'
  /** 数据库 id，用于匹配已读状态 */
  articleId?: string
  /** short_id / slug，用于匹配已读状态 */
  articleShortId?: string
  /** 文章在列表中的索引（用于 paywall 按篇数计上限，非显示用） */
  articleIndex?: number
}

interface ArticleSidebarProps {
  items: NavItem[]
  title: string
  /** 保留向后兼容（已废弃，sidebar 直接从 context 读取） */
  skipQuotaCheck?: boolean
  readIds?: string[]
  todayReadIds?: string[]
  isMonthly?: boolean
  showReadStyles?: boolean
}

function NavItemComponent({ item, level = 0 }: {
  item: NavItem
  level?: number
}) {
  const pathname = usePathname()
  const isActive = item.href === pathname
  const hasChildren = item.items && item.items.length > 0
  const [isOpen, setIsOpen] = React.useState(true)

  // ── 直接从 context 读取已读数据 ──
  const { readIds, todayReadIds, isMonthly, isYearly } = useReadingLimit()
  const { show_read_progress } = useReadingSettings()
  const showReadStyles = isYearly ? show_read_progress : true

  // Extract article ID from href (e.g., "/notes/abc123" -> "abc123")
  const articleId = item.href ? item.href.split("/").pop() || "" : ""

  // 免费用户：用累积已读列表（终身限额）
  // 月卡用户：用当日已读列表（每日限额）
  // 年卡用户 + 管理员关闭：不标记已读样式
  const idsToCheck = isMonthly ? todayReadIds : readIds
  const isRead = showReadStyles && idsToCheck.length > 0 && (
    idsToCheck.includes(articleId) ||
    idsToCheck.includes(item.articleId || "") ||
    idsToCheck.includes(item.articleShortId || "")
  )

  if (hasChildren) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center justify-between rounded-lg py-2.5 text-sm font-medium transition-all duration-150",
            isActive
              ? "bg-accent font-semibold text-primary"
              : "text-foreground hover:bg-muted"
          )}
          style={{ paddingLeft: level === 0 ? "20px" : "32px", paddingRight: "12px" }}
        >
          <span>{item.title}</span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn("border-l-2 border-border pl-3", level === 0 ? "ml-5" : "ml-3")}>
            {item.items!.map((child, index) => (
              <NavItemComponent key={index} item={child} level={level + 1} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <Link
      href={item.href || "#"}
      className={cn(
        "block rounded-lg px-4 py-2.5 text-sm transition-all duration-150",
        isActive
          ? "bg-accent font-semibold text-primary shadow-sm"
          : isRead
          ? "bg-blue-50 border border-blue-100"
          : "text-foreground hover:bg-muted hover:text-primary"
      )}
      style={{ marginLeft: level > 0 ? "0" : undefined }}
    >
      <span className="inline line-clamp-2">
        {item.title}
        {item.accessLevel && item.accessLevel !== 'free' && (
          <span
            className="ml-1 text-[10px] font-medium align-baseline"
            style={item.accessLevel === 'yearly'
              ? { color: '#D97706', opacity: 0.6 }
              : { color: '#F87171', opacity: 0.6 }}
          >
            {item.accessLevel === 'yearly' ? '年卡' : '月卡'}
          </span>
        )}
      </span>
    </Link>
  )
}

export function ArticleSidebar({ items, title }: ArticleSidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4">
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-primary-foreground shadow-sm">
          <svg className="h-4 w-4 shrink-0 opacity-95" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h8M4 18h5" />
          </svg>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>

        <nav className="space-y-1">
          {items.map((item, index) => (
            <NavItemComponent key={index} item={item} />
          ))}
        </nav>
      </div>
    </aside>
  )
}
