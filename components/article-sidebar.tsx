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

export interface NavItem {
  title: string
  href?: string
  items?: NavItem[]
}

interface ArticleSidebarProps {
  items: NavItem[]
  title: string
}

function NavItemComponent({ item, level = 0 }: { item: NavItem; level?: number }) {
  const pathname = usePathname()
  const isActive = item.href === pathname
  const hasChildren = item.items && item.items.length > 0
  const [isOpen, setIsOpen] = React.useState(true)

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
          : "text-foreground hover:bg-muted hover:text-primary"
      )}
      style={{ marginLeft: level > 0 ? "0" : undefined }}
    >
      {item.title}
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
