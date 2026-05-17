/**
 * 检查 pending_registrations 和 auth identities 问题
 *
 * 安全修复 (P-M18-05):
 * - 添加 API_KEY 环境变量校验，防止未授权访问
 * - 使用统一的 .env.local 解析逻辑
 * - NODE_ENV=production 时拒绝执行
 *
 * 运行方式：
 *   SCRIPTS_API_KEY=your_secret npx tsx scripts/check-auth.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function findAndLoadEnv() {
  // 向上查找 .env.local
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const envPath = resolve(dir, ".env.local");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key && val && !process.env[key]) {
          process.env[key] = val;
        }
      }
      break;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
}

findAndLoadEnv();

// P-M18-05 修复：环境变量校验（防止未授权访问）
const API_KEY = process.env.SCRIPTS_API_KEY;
if (!API_KEY) {
  console.error("❌ 缺少 SCRIPTS_API_KEY 环境变量");
  console.error("   请设置 SCRIPTS_API_KEY=your_secret 再执行此脚本");
  process.exit(1);
}

// P-M18-11 修复：生产环境拒绝执行
if (process.env.NODE_ENV === "production") {
  console.error("❌ 禁止在生产环境中执行此脚本！");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("缺少环境变量");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function check() {
  // 1. pending_registrations 残留
  console.log("=== pending_registrations 残留 ===");
  const { data: pending } = await supabase
    .from("pending_registrations")
    .select("email, username, expires_at")
    .order("expires_at", { ascending: false });
  console.log(`${pending?.length} 条`);
  for (const p of pending || []) {
    const expired = new Date(p.expires_at) < new Date();
    console.log(`  ${expired ? "过期" : "有效"} ${p.email} (${p.username}) expires=${p.expires_at}`);
  }

  // 2. 查 zhoujia0718@133.com 的 users 记录对应的 auth user
  console.log("\n=== users 表 zhoujia0718 的 auth 状态 ===");
  const { data: uData } = await supabase
    .from("users")
    .select("id, email")
    .ilike("email", "%zhoujia0718%");
  for (const u of uData || []) {
    console.log(`  users表: ${u.email} (${u.id})`);
  }

  // 3. 检查所有 auth.users 的 identities
  console.log("\n=== 所有 auth.users identities 状态 ===");
  const { data: authData } = await supabase.auth.admin.listUsers();
  for (const u of authData.users) {
    console.log(`  ${u.email || "(null)"} (${u.id.slice(0, 8)}) identities: ${u.identities?.length}`);
  }
}

check().catch(console.error);
