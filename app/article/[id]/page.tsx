"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"

const CATEGORY_PATHS: Record<string, string> = {
  "个股挖掘": "stocks",
  "短线笔记": "notes",
  "短线学习笔记": "notes",
  "大佬合集": "masters",
}

export default function ArticleRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const articleId = typeof params.id === "string" ? params.id : ""

  React.useEffect(() => {
    if (!articleId) {
      router.replace("/")
      return
    }

    const redirect = async () => {
      // 只查询分类字段，不拉取内容
      let row: { category: string; short_id: string | null } | null = null

      const { data: byId } = await supabase
        .from("articles")
        .select("category, short_id")
        .eq("id", articleId)
        .maybeSingle()
      row = byId

      if (!row) {
        const { data: byShortId } = await supabase
          .from("articles")
          .select("category, short_id")
          .eq("short_id", articleId)
          .maybeSingle()
        row = byShortId
      }

      if (!row) {
        router.replace("/")
        return
      }

      const section = CATEGORY_PATHS[row.category]
      const slug = row.short_id || articleId
      if (section) {
        router.replace(`/${section}/${slug}`)
      } else {
        router.replace("/")
      }
    }

    void redirect()
  }, [articleId, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}
