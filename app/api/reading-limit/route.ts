/**
 * GET  /api/reading-limit  — 查询当前已读篇数
 * POST /api/reading-limit  — 记录一次已读（body: { articleId: string }）
 *
 * 认证方式与 /api/membership/status 一致：
 *   - X-User-Id header 优先
 *   - Bearer token 次之
 *
 * 注意：游客（未登录）不返回任何数据，前端 fallback 到 localStorage。
 */
import { NextRequest, NextResponse } from "next/server"
import { getReadingLimitData, recordVisit, resolveUserIdFromRequest } from "@/lib/reading-limit"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const userId = await resolveUserIdFromRequest(request as unknown as Request)

  if (!userId) {
    return NextResponse.json({ readCount: 0, readIds: [] })
  }

  const data = await getReadingLimitData(userId)
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const userId = await resolveUserIdFromRequest(request as unknown as Request)

  if (!userId) {
    return NextResponse.json({ success: false, message: "未登录" }, { status: 401 })
  }

  let body: { articleId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: "无效请求体" }, { status: 400 })
  }

  const { articleId } = body
  if (!articleId || typeof articleId !== "string") {
    return NextResponse.json({ success: false, message: "缺少 articleId" }, { status: 400 })
  }

  const data = await recordVisit(userId, articleId)
  return NextResponse.json({ success: true, ...data })
}
