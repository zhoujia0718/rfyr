/**
 * 脚本：列出 Supabase 中的所有用户
 *
 * 运行方式：
 *   npx tsx scripts/list-users.ts
 *
 * 安全修复 (P-M18-02):
 * - 使用统一的 loadEnv() 替代手动的 .env.local 解析
 * - 自动检测项目根目录
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnv, getRequired, isProduction } from "./lib/env"

// 加载环境变量
loadEnv()

async function main() {
  // P-M18-11 修复：生产环境保护（但允许读取操作）
  if (isProduction()) {
    console.warn("⚠️ 警告: 在生产环境中执行...")
  }

  const supabaseAdmin = createClient(
    getRequired('NEXT_PUBLIC_SUPABASE_URL'),
    getRequired('SUPABASE_SERVICE_ROLE_KEY')
  )

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers()

  if (error) {
    console.error("查询失败:", error.message)
    process.exit(1)
  }

  console.log(`共 ${users.users.length} 个用户：\n`)
  for (const u of users.users) {
    console.log(`  邮箱: ${u.email}`)
    console.log(`  ID:   ${u.id}`)
    console.log(`  创建: ${u.created_at}`)
    console.log("  ---")
  }
}

main()
