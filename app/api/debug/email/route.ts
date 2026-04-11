import { NextRequest, NextResponse } from 'next/server'
import { debugSendConfirmationEmail } from '@/app/actions/auth'

/**
 * 调试接口：手动触发 Supabase 发送确认邮件，打印完整错误信息
 *
 * 调用方式（本地开发）：
 *   POST /api/debug/email
 *   Body: { "email": "zhoujia0718@163.com" }
 *
 * 返回完整的 Supabase 错误详情（message / status / code）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, message: '请提供有效的 email 参数' }, { status: 400 })
    }

    const result = await debugSendConfirmationEmail(email)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || '未知错误', stack: err?.stack }, { status: 500 })
  }
}
