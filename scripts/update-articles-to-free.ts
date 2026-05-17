/**
 * 脚本：将所有月卡权限（monthly）的文章更新为免费权限（free）
 *
 * 运行方式：
 *   npx tsx scripts/update-articles-to-free.ts
 *
 * 说明：
 *   此操作不可逆，请在执行前确认。脚本会先统计受影响文章数量，
 *   需要手动确认后才执行更新。
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnv, getRequired } from "./lib/env"

// 强制从 .env.production 加载环境变量
loadEnv({ path: ".env.production" })

async function main() {
  const supabaseUrl = getRequired("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseServiceKey = getRequired("SUPABASE_SERVICE_ROLE_KEY")

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Step 1: 统计月卡文章数量
  const { count: monthlyCount, error: countError } = await supabase
    .from("articles")
    .select("*", { count: "exact", head: true })
    .eq("access_level", "monthly")

  if (countError) {
    console.error("查询月卡文章数量失败:", countError.message)
    process.exit(1)
  }

  console.log(`\n当前共有 ${monthlyCount} 篇月卡权限（monthly）的文章`)
  console.log("即将将这些文章全部更新为免费权限（free）\n")

  if (monthlyCount === 0) {
    console.log("没有需要更新的月卡文章，退出。")
    process.exit(0)
  }

  // Step 2: 确认提示
  const readline = await import("readline")
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question("确认执行更新？（输入 YES 确认，其他任意键取消）: ", resolve)
  })
  rl.close()

  if (answer.trim() !== "YES") {
    console.log("已取消操作。")
    process.exit(0)
  }

  // Step 3: 执行更新
  console.log("\n正在更新...")
  const { data: updateResult, error: updateError } = await supabase
    .from("articles")
    .update({ access_level: "free" })
    .eq("access_level", "monthly")
    .select("id, title, access_level")

  if (updateError) {
    console.error("更新失败:", updateError.message)
    process.exit(1)
  }

  console.log(`\n更新成功！共更新了 ${updateResult?.length ?? 0} 篇文章：\n`)
  for (const article of updateResult ?? []) {
    console.log(`  - ${article.title} (${article.id})`)
  }
}

main().catch((err) => {
  console.error("脚本执行出错:", err)
  process.exit(1)
})
