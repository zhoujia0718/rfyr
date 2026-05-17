/**
 * 浏览器测试脚本 - 专门测试登录后访问文章
 *
 * 安全修复 (P-M18-04, P-M18-06):
 * - 登录凭证从环境变量读取，不再硬编码
 * - 服务器地址从环境变量读取
 *
 * 运行方式：
 *   TEST_BASE_URL=http://localhost:3000 \
 *   TEST_ADMIN_EMAIL=admin@example.com \
 *   TEST_ADMIN_PASSWORD=xxx \
 *   node test-login-article.mjs
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

async function testLoginAndArticleAccess() {
  console.log("🚀 启动浏览器...");
  console.log(`📍 目标服务器: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  try {
    // 1. 先清除任何旧的登录状态
    console.log("\n🧹 清除旧的登录状态...");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    // 2. 测试未登录状态访问文章
    console.log("\n📰 测试未登录状态访问文章...");
    await page.goto(`${BASE_URL}/notes`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "/tmp/rfyr-test-1-notes-initial.png" });

    // 点击第一篇文章
    const firstArticle = await page.locator("a[href*='/notes/']").first();
    if (await firstArticle.isVisible()) {
      const href = await firstArticle.getAttribute("href");
      console.log(`   点击文章: ${href}`);
      await firstArticle.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "/tmp/rfyr-test-2-article-unlogged.png" });

      // 检查是否显示需要登录
      const bodyText = await page.textContent("body");
      if (bodyText.includes("请先登录") || bodyText.includes("登录")) {
        results.push({ page: "未登录访问文章", status: "✅ 显示登录提示" });
        console.log("   ✅ 未登录时显示登录提示");
      } else {
        results.push({ page: "未登录访问文章", status: "⚠️ 未检测到登录提示" });
        console.log("   ⚠️ 未检测到登录提示");
      }
    }

    // 3. 管理员登录（仅在凭证可用时）
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      console.log("\n🔐 管理员登录...");
      await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" });
      await page.fill("#username", ADMIN_EMAIL);
      await page.fill("#password", ADMIN_PASSWORD);
      await page.screenshot({ path: "/tmp/rfyr-test-3-login-form.png" });

      console.log("   点击登录...");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "/tmp/rfyr-test-4-login-result.png" });

      const loginUrl = page.url();
      console.log(`   当前 URL: ${loginUrl}`);

      if (loginUrl.includes("/admin") && !loginUrl.includes("login")) {
        results.push({ page: "管理员登录", status: "✅ 登录成功" });
        console.log("   ✅ 登录成功");

        // 检查 localStorage 中的 custom_auth
        const customAuth = await page.evaluate(
          () => localStorage.getItem("custom_auth")
        );
        console.log(
          `   custom_auth: ${customAuth ? "存在" : "不存在"}`
        );
        if (customAuth) {
          const auth = JSON.parse(customAuth);
          console.log(
            `   session.access_token: ${auth.session?.access_token ? "存在" : "不存在"}`
          );
        }
      } else {
        results.push({ page: "管理员登录", status: "❌ 登录失败" });
        console.log("   ❌ 登录失败");
      }

      // 4. 测试登录后访问文章
      console.log("\n📖 测试登录后访问文章...");
      await page.goto(`${BASE_URL}/notes`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: "/tmp/rfyr-test-5-notes-logged.png" });

      const articleAfterLogin = await page.locator("a[href*='/notes/']").first();
      if (await articleAfterLogin.isVisible()) {
        const href = await articleAfterLogin.getAttribute("href");
        console.log(`   点击文章: ${href}`);
        await articleAfterLogin.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: "/tmp/rfyr-test-6-article-logged.png" });

        const articleBody = await page.textContent("body");
        if (
          articleBody.includes("请先登录") ||
          articleBody.includes("登录后才能阅读")
        ) {
          results.push({ page: "登录后访问文章", status: "❌ 仍要求登录" });
          console.log("   ❌ 登录后仍显示登录提示 - 修复失败!");
        } else {
          results.push({ page: "登录后访问文章", status: "✅ 文章正常显示" });
          console.log("   ✅ 文章正常显示");
        }
      }
    } else {
      console.log("\n🔐 跳过登录测试（未配置凭证）");
      results.push({ page: "管理员登录", status: "⏭️ 已跳过" });
    }

    // 5. 测试会员页面
    console.log("\n💎 测试会员页面...");
    await page.goto(`${BASE_URL}/membership`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "/tmp/rfyr-test-7-membership.png" });

    const memberBody = await page.textContent("body");
    if (
      memberBody.includes("月度VIP") ||
      memberBody.includes("年度VIP") ||
      memberBody.includes("月卡")
    ) {
      results.push({ page: "会员页面", status: "✅ 正常显示" });
    } else {
      results.push({ page: "会员页面", status: "⚠️ 需要检查" });
    }
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
    await page.screenshot({ path: "/tmp/rfyr-test-error.png" });
    results.push({ page: "错误", status: "❌", error: error.message });
  }

  // 打印结果
  console.log("\n" + "=".repeat(50));
  console.log("📊 测试结果汇总");
  console.log("=".repeat(50));
  results.forEach((r) => {
    console.log(
      `${r.status} ${r.page}${r.error ? ` - ${r.error}` : ""}`
    );
  });
  console.log("=" + "=".repeat(50));

  console.log("\n📸 截图已保存到 /tmp/rfyr-test-*.png");

  await browser.close();
}

testLoginAndArticleAccess();
