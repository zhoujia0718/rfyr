import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY

// 仅在 API Key 配置后才初始化 Resend（避免构建阶段就报错）
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

if (!resend) {
  console.warn('[Email] RESEND_API_KEY 未配置，邮件发送功能不可用')
}

const FROM_EMAIL = process.env.RESEND_SENDER_EMAIL || 'RFYRobot <onboarding@resend.dev>'
const APP_NAME = 'RFYRobot'
const VERIFY_EXPIRE_MINUTES = 10

/**
 * 发送注册验证码邮件
 */
export async function sendVerificationEmail({
  to,
  username,
  code,
}: {
  to: string
  username: string
  code: string
}) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 20px; }
    .container { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .logo { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 24px; text-align: center; }
    .title { font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 8px; }
    .desc { font-size: 14px; color: #6b7280; margin-bottom: 24px; line-height: 1.6; }
    .code-box { background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .code { font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 8px; font-family: monospace; }
    .expire { font-size: 12px; color: #9ca3af; margin-top: 8px; }
    .warning { font-size: 12px; color: #ef4444; background: #fef2f2; border-radius: 6px; padding: 12px; margin-top: 16px; }
    .footer { font-size: 12px; color: #9ca3af; text-align: center; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">${APP_NAME}</div>
    <div class="title">邮箱验证</div>
    <div class="desc">
      您好，<strong>${username}</strong>：<br/>
      您正在注册 ${APP_NAME} 账号，请使用以下验证码完成验证。
    </div>
    <div class="code-box">
      <div class="code">${code}</div>
      <div class="expire">有效期 ${VERIFY_EXPIRE_MINUTES} 分钟</div>
    </div>
    <div class="warning">
      ⚠️ 请勿将验证码告知他人，RFYRobot 工作人员不会索要您的验证码。
    </div>
    <div class="footer">此邮件由系统自动发送，请勿回复。</div>
  </div>
</body>
</html>
`

  if (!resend) {
    console.error('[Email] Resend 未初始化，请检查 RESEND_API_KEY 环境变量')
    throw new Error('邮件服务未配置')
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `【${APP_NAME}】您的注册验证码：${code}`,
    html,
  })

  if (error) {
    console.error('发送邮件失败:', error)
    throw new Error(`发送邮件失败: ${error.message}`)
  }

  return data
}
