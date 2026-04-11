/**
 * 邮件发送调试脚本
 * 运行方式（项目根目录下）：
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/test-email-send.ts <邮箱>
 *
 * 示例：
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/test-email-send.ts zhoujia0718@163.com
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// 手动加载 .env.local（兼容 ESM）
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const val = trimmed.slice(eqIdx + 1).trim()
  if (key && val && !process.env[key]) process.env[key] = val
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
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
