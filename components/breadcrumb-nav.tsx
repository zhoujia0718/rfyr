import Link from "next/link"
import { ChevronRight } from "lucide-react"

interface BreadcrumbItem {
  title: string
  href?: string
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[]
}

export function BreadcrumbNav({ items }: BreadcrumbNavProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/" className="hover:text-foreground">
        首页
      </Link>
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4" />
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground">
              {item.title}
            </Link>
          ) : (
            <span className="text-foreground">{item.title}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
