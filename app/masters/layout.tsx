import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

/**
 * 顶栏/底栏挂在此 layout，侧栏内切换 slug 时保持挂载，配合 Next.js Link 客户端导航、无整页刷新。
 */
export default function MastersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  )
}
