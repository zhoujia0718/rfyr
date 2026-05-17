/**
 * DELETE /api/admin/articles/[id]
 * 删除文章
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdmin } from "@/lib/server-admin-auth"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdmin(request)
  if (authError) return authError

  const { id } = await params
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { error } = await supabase.from("articles").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: "删除失败" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
