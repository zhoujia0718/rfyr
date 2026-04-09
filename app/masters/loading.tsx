"use client"
import { Skeleton } from "@/components/ui/skeleton"

/** 顶栏/底栏由 app/masters/layout 提供，此处勿重复渲染 */
export default function Loading() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto max-w-4xl w-full px-4 py-12 space-y-6">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </main>
  )
}