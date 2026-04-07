"use client"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b">
        <div className="mx-auto max-w-7xl px-4 lg:px-8 h-16 flex items-center gap-4">
          <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
          <div className="flex-1" />
          <div className="h-9 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <main className="flex-1 mx-auto max-w-6xl w-full px-4 py-12 space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="border rounded-xl p-6 bg-white">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-12 w-12 rounded-lg bg-gray-100 animate-pulse" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-4 w-3/4" />)}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}