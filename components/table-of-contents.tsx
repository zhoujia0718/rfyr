"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TocItem {
  id: string
  title: string
  level: number
}

interface TableOfContentsProps {
  items: TocItem[]
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = React.useState<string>("")

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: "-100px 0px -80% 0px" }
    )

    items.forEach((item) => {
      const element = document.getElementById(item.id)
      if (element) {
        observer.observe(element)
      }
    })

    return () => observer.disconnect()
  }, [items])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const top = element.offsetTop - 100
      window.scrollTo({ top, behavior: "smooth" })
    }
  }

  if (items.length === 0) return null

  return (
    <aside className="hidden w-56 shrink-0 xl:block">
      <div className="sticky top-20 p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">目录</h3>
        <nav className="space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className={cn(
                "block w-full text-left text-sm transition-colors hover:text-primary",
                item.level === 3 && "pl-4",
                activeId === item.id
                  ? "font-medium text-primary"
                  : "text-muted-foreground"
              )}
            >
              {item.title}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  )
}
