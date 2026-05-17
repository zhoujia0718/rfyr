import { NextRequest, NextResponse } from 'next/server'
import { debugSendConfirmationEmail } from '@/app/actions/auth'

/**
 * 调试接口：手动触发 Supabase 发送确认邮件，打印完整错误信息
 *
 * ⚠ 仅在以下条件同时满足时可用：
 *   1. NODE_ENV !== 'production'（开发/预发布环境）
 *   2. 或生产环境需提供正确的 EMAIL_DEBUG_SECRET 请求头
 *
 * 调用方式（本地开发）：
 *   POST /api/debug/email
 *   Body: { "email": "zhoujia0718@163.com" }
 *
 * 生产环境调用：
 *   POST /api/debug/email
 *   Headers: { "x-debug-secret": "<EMAIL_DEBUG_SECRET>" }
 *   Body: { "email": "..." }
 *
 * 返回完整的 Supabase 错误详情（message / status / code）
 */
export async function POST(request: NextRequest) {
  // 生产环境：必须提供正确的 secret
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.EMAIL_DEBUG_SECRET
    if (!secret || request.headers.get('x-debug-secret') !== secret) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, message: '请提供有效的 email 参数' }, { status: 400 })
    }

    const result = await debugSendConfirmationEmail(email)
    return NextResponse.json(result)
  } catch (err: any) {
    // 不返回 stack，避免泄露内部实现细节
    console.error("[debug/email] 异常:", err)
    return NextResponse.json({ success: false, message: err?.message || '未知错误' }, { status: 500 })
  }
}
