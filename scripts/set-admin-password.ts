/**
 * 脚本：为 admin@example.com 设置/重置密码
 *
 * 使用方法：
 *   npx tsx scripts/set-admin-password.ts <新密码>
 *
 * 示例：
 *   npx tsx scripts/set-admin-password.ts MyNewPassword123
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"

// 手动加载 .env.local 中的变量
const envPath = resolve(process.cwd(), ".env.local")
const envContent = readFileSync(envPath, "utf-8")
for (const line of envContent.split("\n")) {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith("#")) {
    const [key, ...rest] = trimmed.split("=")
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join("=").trim()
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ADMIN_EMAIL = "zhoujia0718@163.com"

async function main() {
  const password = process.argv[2]
  if (!password) {
    console.error("请提供新密码作为参数：")
    console.error("  npx ts-node scripts/set-admin-password.ts <新密码>")
    process.exit(1)
  }

  if (password.length < 6) {
    console.error("密码长度至少需要 6 个字符")
    process.exit(1)
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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
