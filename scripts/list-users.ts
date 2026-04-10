/**
 * 脚本：列出 Supabase 中的所有用户
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"

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

async function main() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
