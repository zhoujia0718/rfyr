/**
 * 脚本：为指定用户重置密码
 *
 * 使用方法：
 *   ADMIN_EMAIL=zhoujia0718@163.com npx tsx scripts/set-admin-password.ts <新密码>
 *
 * 示例：
 *   ADMIN_EMAIL=admin@custom.com npx tsx scripts/set-admin-password.ts MyNewPassword123
 *
 * 安全修复 (P-M18-03):
 * - 管理员邮箱从环境变量 ADMIN_EMAIL 读取，不再硬编码
 * - 使用统一的 loadEnv() 替代手动的 .env.local 解析
 * - NODE_ENV=production 时输出警告
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnv, getRequired, getOptional, isProduction } from "./lib/env"

// 加载环境变量（自动检测项目根目录）
loadEnv()

const SUPABASE_URL = getRequired('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = getRequired('SUPABASE_SERVICE_ROLE_KEY')
// P-M18-03 修复：管理员邮箱从环境变量读取，不再硬编码
const ADMIN_EMAIL = getRequired('ADMIN_EMAIL', '请设置 ADMIN_EMAIL 环境变量，指定要修改密码的管理员邮箱')

async function main() {
  const password = process.argv[2]
  if (!password) {
    console.error("请提供新密码作为参数：")
    console.error("  ADMIN_EMAIL=xxx npx tsx scripts/set-admin-password.ts <新密码>")
    process.exit(1)
  }

  if (password.length < 6) {
    console.error("密码长度至少需要 6 个字符")
    process.exit(1)
  }

  // P-M18-11 修复：生产环境保护
  if (isProduction()) {
    console.error("❌ 禁止在生产环境中执行此脚本！")
    console.error("   如需在生产环境执行，请先设置 NODE_ENV=development")
    process.exit(1)
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 列出所有用户，找到 admin@example.com 的 user_id
  const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers()

  if (listError) {
    console.error("查询用户列表失败:", listError.message)
    process.exit(1)
  }

  const adminUser = users.users.find((u) => u.email === ADMIN_EMAIL)
  if (!adminUser) {
    console.error(`未找到用户: ${ADMIN_EMAIL}`)
    console.error("请先在 Supabase 后台创建该用户")
    process.exit(1)
  }

  // 用 user_id 更新密码
  const { data, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(adminUser.id, {
    password,
  })

  if (updateError) {
    console.error("设置密码失败:", updateError.message)
    process.exit(1)
  }

  console.log(`密码设置成功！`)
  console.log(`用户: ${ADMIN_EMAIL}`)
  console.log(`新密码: ${password}`)
  console.log(`用户ID: ${adminUser.id}`)
  console.log(`\n现在可以在 /admin/login 使用该账号登录了`)
}

main().catch((err) => {
  console.error("脚本执行出错:", err)
  process.exit(1)
})
