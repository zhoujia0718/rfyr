/**
 * 浏览器测试脚本 - 使用 Playwright
 * 测试网站各页面的加载和基本功能
 *
 * 安全修复 (P-M18-04, P-M18-06):
 * - 登录凭证从环境变量读取，不再硬编码
 * - 服务器地址从环境变量读取，支持跨环境配置
 *
 * 运行方式：
 *   TEST_BASE_URL=http://localhost:3000 \
 *   TEST_ADMIN_EMAIL=admin@example.com \
 *   TEST_ADMIN_PASSWORD=xxx \
 *   node test-browser.mjs
 */

// 加载 .env.local 中的测试配置
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
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
}

// P-M18-04 修复：凭证从环境变量读取
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.warn(
    "⚠️ 警告: TEST_ADMIN_EMAIL 或 TEST_ADMIN_PASSWORD 未设置，跳过登录测试"
  );
}

import { chromium } from "@playwright/test";

async function testWebsite() {
  console.log("🚀 启动浏览器...");
  console.log(`📍 目标服务器: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const results = [];

  // 监听控制台错误
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. 测试首页
    console.log("\n📄 测试首页...");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/rfyr-homepage.png" });
    const title = await page.title();
    console.log(`   标题: ${title}`);
    results.push({ page: "首页", status: "✅", title });

    // 2. 测试会员页面
    console.log("\n💎 测试会员页面...");
    await page.goto(`${BASE_URL}/membership`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/rfyr-membership.png" });
    results.push({ page: "会员页面", status: "✅" });

    // 3. 测试笔记页面
    console.log("\n📝 测试笔记页面...");
    await page.goto(`${BASE_URL}/notes`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/rfyr-notes.png" });
    results.push({ page: "笔记页面", status: "✅" });

    // 4. 测试管理员登录（仅在凭证可用时）
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      console.log("\n👤 测试管理员登录...");
      await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" });
      await page.screenshot({ path: "/tmp/rfyr-admin-login-1.png" });

      console.log("   填写表单...");
      await page.fill("#username", ADMIN_EMAIL);
      await page.fill("#password", ADMIN_PASSWORD);
      await page.screenshot({ path: "/tmp/rfyr-admin-login-2-filled.png" });

      console.log("   点击登录...");
      await page.click('button[type="submit"]');

      await page.waitForTimeout(3000);
      await page.screenshot({ path: "/tmp/rfyr-admin-login-3-result.png" });

      const currentUrl = page.url();
      console.log(`   当前 URL: ${currentUrl}`);

      if (currentUrl.includes("/admin") && !currentUrl.includes("login")) {
        results.push({ page: "管理员登录", status: "✅ 登录成功" });
        console.log("   ✅ 登录成功，已重定向到管理后台");

        await page.waitForTimeout(2000);
        await page.screenshot({ path: "/tmp/rfyr-admin-home.png" });

        const adminUrl = page.url();
        if (adminUrl.includes("login")) {
          console.log("   ⚠️ 虽然重定向但可能登录失败");
          results.push({ page: "管理员登录", status: "⚠️ 重定向但需验证" });
        } else {
          results.push({ page: "管理后台", status: "✅ 正常" });
        }
      } else {
        const pageContent = await page.textContent("body");
        if (pageContent.includes("用户名或密码错误")) {
          results.push({ page: "管理员登录", status: "❌ 登录失败" });
          console.log("   ❌ 登录失败：用户名或密码错误");
        } else if (pageContent.includes("登录成功")) {
          results.push({ page: "管理员登录", status: "✅ 登录成功" });
        } else {
          results.push({ page: "管理员登录", status: "⚠️ 需检查" });
          console.log(`   ⚠️ 当前 URL: ${currentUrl}`);
        }
      }

      // 5. 刷新管理后台页面测试
      console.log("\n⚙️ 刷新管理后台...");
      await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "/tmp/rfyr-admin-refresh.png" });

      const adminUrl2 = page.url();
      if (adminUrl2.includes("login")) {
        results.push({ page: "管理后台刷新", status: "⚠️ 被重定向到登录页" });
      } else {
        results.push({ page: "管理后台刷新", status: "✅ 正常" });
      }

      // 6. 测试兑换页面
      console.log("\n🎁 测试兑换页面...");
      await page.goto(`${BASE_URL}/admin/redeem`, { waitUntil: "networkidle" });
      await page.screenshot({ path: "/tmp/rfyr-redeem.png" });
      const redeemUrl = page.url();
      if (redeemUrl.includes("login")) {
        results.push({ page: "兑换码管理", status: "⚠️ 未登录" });
      } else {
        results.push({ page: "兑换码管理", status: "✅" });
      }
    } else {
      console.log("\n👤 跳过管理员登录测试（未配置凭证）");
      results.push({ page: "管理员登录", status: "⏭️ 已跳过" });
    }

    // 7. 测试文章列表页
    console.log("\n📖 测试文章列表页...");
    await page.goto(`${BASE_URL}/notes/all`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/rfyr-notes-all.png" });
    results.push({ page: "文章列表页", status: "✅" });

    // 8. 测试搜索页面
    console.log("\n🔍 测试搜索页面...");
    await page.goto(`${BASE_URL}/search`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/rfyr-search.png" });
    results.push({ page: "搜索页面", status: "✅" });

    // 9. 测试文章详情页
    console.log("\n📰 测试文章详情页...");
    await page.goto(`${BASE_URL}/notes`, { waitUntil: "networkidle" });
    const articleLink = await page.locator("a[href*='/notes/'][href$='/page.tsx']").or(page.locator("a[href*='/notes/']")).first();
    if (await articleLink.isVisible()) {
      const href = await articleLink.getAttribute("href");
      if (href && href.includes("/notes/") && !href.endsWith("/notes")) {
        console.log(`   点击文章: ${href}`);
        await page.goto(`${BASE_URL}${href}`, { waitUntil: "networkidle" });
        await page.screenshot({ path: "/tmp/rfyr-article-detail.png" });
        results.push({ page: "文章详情页", status: "✅" });
      } else {
        results.push({ page: "文章详情页", status: "⚠️ 链接格式异常" });
      }
    } else {
      results.push({ page: "文章详情页", status: "⚠️ 未找到文章" });
    }
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
    await page.screenshot({ path: "/tmp/rfyr-error.png" });
    results.push({ page: "错误", status: "❌", error: error.message });
  }

  // 打印结果
  console.log("\n" + "=".repeat(50));
  console.log("📊 测试结果汇总");
  console.log("=".repeat(50));
  results.forEach((r) => {
    console.log(`${r.status} ${r.page}${r.title ? ` - ${r.title}` : ""}${r.error ? ` - ${r.error}` : ""}`);
  });

  if (consoleErrors.length > 0) {
    console.log("\n⚠️ 控制台错误:");
    consoleErrors.forEach((e) => console.log(`  - ${e}`));
  } else {
    console.log("\n✅ 无控制台错误");
  }

  console.log("\n📸 截图已保存到 /tmp/rfyr-*.png");
  console.log("=" + "=".repeat(50));

  await browser.close();
}

testWebsite();
