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
          className="flex w-full items-center justify-between rounded-md py-2 text-sm font-medium transition-colors hover:bg-accent"
          style={{ paddingLeft: '24px' }}
        >
          <span>{item.title}</span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div style={{ marginLeft: '24px', borderLeft: '1px solid #e5e7eb' }}>
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
        "block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
        isActive
          ? "bg-accent font-medium"
          : "hover:text-foreground"
      )}
      style={{ paddingLeft: '24px' }}
    >
      {item.title}
    </Link>
  )
}

export function ArticleSidebar({ items, title }: ArticleSidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4">
        <h2 className="mb-4 px-3 text-lg font-semibold text-foreground">{title}</h2>
        <nav className="space-y-1">
          {items.map((item, index) => (
            <NavItemComponent key={index} item={item} />
          ))}
        </nav>
      </div>
    </aside>
  )
}
