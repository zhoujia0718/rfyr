"use client"

import { useEffect } from "react"
import { captureReferrerFromUrl } from "@/lib/referral-client"

/**
 * 包裹在根布局中，自动捕获 URL 中的 ref 参数
 */
export function ReferralCapture({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    captureReferrerFromUrl()
  }, [])

  return <>{children}</>
}
