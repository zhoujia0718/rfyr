"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

export type ClientNavLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
}

/**
 * SPA 导航用原生 <a> + router.push，避免 next/link 在 React 19 下 ref/水合不一致。
 */
export const ClientNavLink = React.forwardRef<HTMLAnchorElement, ClientNavLinkProps>(
  function ClientNavLink({ href, onClick, onMouseEnter, children, ...rest }, ref) {
    const router = useRouter()

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e)
      if (e.defaultPrevented) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (e.button !== 0) return
      e.preventDefault()
      router.push(href)
    }

    const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
      onMouseEnter?.(e)
      try {
        router.prefetch(href)
      } catch {
        /* ignore */
      }
    }

    return (
      <a ref={ref} href={href} onClick={handleClick} onMouseEnter={handleMouseEnter} {...rest}>
        {children}
      </a>
    )
  }
)
