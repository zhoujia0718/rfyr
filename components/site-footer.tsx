export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">日富一日</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        <div className="mb-6 text-center">
          <p className="text-lg font-medium text-primary">价值投机，看长做短</p>
          <p className="mt-2 text-sm text-muted-foreground">助你见证复利的奇迹</p>
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-x-8 gap-y-2">
          {[
            { label: "大佬合集", href: "/masters" },
            { label: "短线笔记", href: "/notes" },
            { label: "个股挖掘", href: "/stocks/all" },
            { label: "会员中心", href: "/membership" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} 日富一日</span>
          <span>·</span>
          <span>All rights reserved</span>
        </div>
      </div>
    </footer>
  )
}
