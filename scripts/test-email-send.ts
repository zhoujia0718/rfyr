/**
 * 邮件发送调试脚本
 * 运行方式（项目根目录下）：
 *   npx ts-node --project tsconfig.json scripts/test-email-send.ts <邮箱>
 *
 * 示例：
 *   npx ts-node --project tsconfig.json scripts/test-email-send.ts zhoujia0718@163.com
 *
 * 安全修复 (P-M18-02):
 * - 使用统一的 loadEnv() 替代手动的 .env.local 解析
 * - 自动检测项目根目录，支持跨环境执行
 * - NODE_ENV=production 时输出警告
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnv, getRequired, isProduction } from './lib/env'

// 加载环境变量（自动检测项目根目录）
loadEnv()

const SUPABASE_URL = getRequired('NEXT_PUBLIC_SUPABASE_URL', '请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = getRequired('SUPABASE_SERVICE_ROLE_KEY', '请在 .env.local 中配置 SUPABASE_SERVICE_ROLE_KEY')

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // P-M18-11 修复：生产环境保护
  if (isProduction()) {
    console.error("❌ 禁止在生产环境中执行此脚本！")
    console.error("   如需在生产环境执行，请先设置 NODE_ENV=development")
    process.exit(1)
  }

  // 支持传入邮箱参数，否则使用随机测试邮箱
  let email = process.argv[2]
  if (!email) {
    email = `test_${Date.now()}@testdebug.com`
    console.log('未指定邮箱，使用随机测试邮箱:', email)
  }

  console.log(`\n📧 测试向 ${email} 发送确认邮件\n`)
  console.log('Supabase URL:', SUPABASE_URL)
  console.log('SMTP Sender Email:', process.env.RESEND_SENDER_EMAIL)
  console.log('---\n')

  const tempPassword = `debug_${Date.now()}`

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: false,
  })

  if (error) {
    console.error('❌ 创建用户失败（Supabase 返回）：')
    console.error('  message:', error.message)
    console.error('  status:', error.status)
    console.error('  code:', error.code)
    console.error('  完整对象:', JSON.stringify(error, null, 2))
    process.exit(1)
  } else {
    console.log('✅ 用户创建成功:', { id: data.user!.id, email: data.user!.email })
    console.log('   如果 Supabase 发送确认邮件失败，请去 Supabase Dashboard 查看 SMTP Logs')
  }
}

main().catch((err) => {
  console.error('脚本异常:', err)
  process.exit(1)
})
