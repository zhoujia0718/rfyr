/**
 * 根因八修复：测试覆盖范围追踪文档
 *
 * 目的：建立和维护一个活文档，记录每个模块的测试覆盖状态。
 *
 * 命名规范：
 * - `tests/TEST-COVERAGE-INDEX.md` — 覆盖范围索引
 * - `tests/lib/{module}.import.test.ts` — 直接 import 源码的测试
 * - `tests/bug-{category}-{id}.test.ts` — 针对特定 bug 的错误注入测试
 * - `tests/e2e/{flow}.test.ts` — 端到端集成测试
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 测试覆盖范围索引
// ═══════════════════════════════════════════════════════════════════════════════
//
// 更新规则：
// 1. 新增功能：必须同时添加测试文件，并在本索引中注册
// 2. 发现 bug：添加对应的错误注入测试
// 3. 重构代码：运行现有测试确保不破坏
// 4. 每个 PR 必须包含对相关模块测试的更新
//
// 覆盖等级：
// - FULL: 核心逻辑 + 边界条件 + 错误路径 均已覆盖
// - PARTIAL: 仅覆盖 happy path
// - NONE: 无测试覆盖
// - BROKEN: 有测试但测试本身有 bug（如内联代码不同步）
//
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ## 模块一：内容管理（articles, categories）
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `lib/articles.ts` | `m1-articles.test.ts` (内联), `m1-articles-uncov.test.ts` (内联), `lib-articles-import.test.ts` (import) | PARTIAL→FULL | ✅ 正在从内联迁移到 import |
 * | `lib/category-utils.ts` | `m1-articles.test.ts` (内联) | PARTIAL | ⚠️ 需要迁移到 import |
 * | `lib/short-id.ts` | `m1-articles.test.ts` | FULL | ✅ |
 * | `app/api/articles/route.ts` | `m1-articles-api.test.ts` | PARTIAL | ⚠️ 缺少错误路径 |
 * | `app/masters/[slug]/page.tsx` | NONE | NONE | 🔴 BUG-PAGE-01 未覆盖 |
 * | `app/notes/[slug]/page.tsx` | NONE | NONE | 🔴 大量 any 类型 |
 * | `app/stocks/[slug]/page.tsx` | NONE | NONE | 🔴 |
 *
 * ## 模块二：会员系统（membership）
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `lib/membership.ts` | `m6-lib-membership.test.ts` | PARTIAL | ⚠️ |
 * | `lib/member-tiers.ts` | `m3-referral.test.ts` | FULL | ✅ |
 * | `lib/quota-calculator.ts` | `m16-quota-calculator.test.ts` | PARTIAL | ⚠️ |
 * | `lib/reading-settings.ts` | `m13-reading-settings.test.ts`, `m13-reading-settings-api.test.ts` | PARTIAL | ⚠️ |
 * | `app/api/membership/activate/route.ts` | NONE | NONE | 🔴 BUG-API-06 未覆盖 |
 * | `app/api/membership/status/route.ts` | `m15-membership-status-api.test.ts` | PARTIAL | ⚠️ |
 * | `app/membership/page.tsx` | `m15-membership-page.test.ts` | PARTIAL | ⚠️ |
 *
 * ## 模块三：推荐与兑换（referral, redeem）
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `lib/referral.ts` | `m3-referral.test.ts` | FULL | ✅ |
 * | `lib/referral-client.ts` | `m3-referral.test.ts` | FULL | ✅ |
 * | `lib/redeem.ts` | `m3-redeem.test.ts` | FULL | ✅ |
 * | `app/api/referral/create-codes/route.ts` | `m5-referral-create-codes-api.test.ts` | PARTIAL | ⚠️ |
 * | `app/api/referral/code/route.ts` | `m5-referral-code-api.test.ts` | PARTIAL | ⚠️ |
 * | `app/api/referral/validate/route.ts` | `m5-referral-validate-api.test.ts` | PARTIAL | ⚠️ |
 * | `app/api/referral/info/route.ts` | NONE | NONE | 🔴 |
 * | `app/api/referral/stats/route.ts` | `m15-referral-stats-api.test.ts` | PARTIAL | ⚠️ |
 * | `app/api/redeem/route.ts` | `m4-uncov.test.ts` | PARTIAL | ⚠️ |
 * | `app/admin/redeem/page.tsx` | NONE | NONE | 🔴 |
 *
 * ## 模块四：阅读限制（reading-limit）
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `lib/reading-limit.ts` | `m4-reading-limit-api.test.ts` | PARTIAL | ⚠️ |
 * | `app/api/reading-limit/route.ts` | `m4-reading-limit-api.test.ts` | PARTIAL | ⚠️ |
 * | `app/api/guest-reading/route.ts` | `m4-guest-reading-api.test.ts` | PARTIAL | 🔴 BUG-API-12 未覆盖 |
 * | `hooks/use-daily-quota-check.ts` | `m16-daily-quota-check.test.ts` | PARTIAL | ⚠️ |
 *
 * ## 模块五：认证授权（auth）
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `lib/server-auth-user.ts` | `m11-server-admin-auth.test.ts` | PARTIAL | ⚠️ |
 * | `lib/server-admin-auth.ts` | `m11-server-admin-auth.test.ts` | PARTIAL | ⚠️ |
 * | `lib/payments.ts` | `m6-payments.test.ts` | BROKEN | 🔴 BUG-LIB-02 未覆盖 |
 * | `app/actions/auth.ts` | NONE | NONE | 🔴 |
 * | `app/api/admin/login/route.ts` | NONE | NONE | 🔴 BUG-API-01/02 未覆盖 |
 *
 * ## 模块六：支付与兑换
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `components/payment-dialog.tsx` | `m6-payment-dialog.test.ts` | PARTIAL | 🔴 BUG-comp-07 未覆盖 |
 * | `components/redeem-dialog.tsx` | `m6-redeem-dialog.test.ts` | PARTIAL | 🔴 |
 * | `components/paywall.tsx` | `m7-paywall.test.ts` | PARTIAL | 🔴 BUG-comp-06 未覆盖 |
 *
 * ## 模块七：工具库
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `lib/utils.ts` | `m7-utils.test.ts` | FULL | ✅ |
 * | `lib/datetime.ts` | `m7-datetime.test.ts` | PARTIAL | 🔴 BUG-LIB-08 未覆盖 |
 * | `lib/html-sanitizer.ts` | `m11-html-sanitizer.test.ts`, `m11-html-sanitizer-dom.test.ts` | FULL | ✅ |
 * | `lib/review-html.ts` | `m7-review-html.test.ts` | PARTIAL | ⚠️ |
 * | `lib/supabase.ts` | `m13-supabase.test.ts` | PARTIAL | ⚠️ |
 * | `lib/app-user-id.ts` | NONE | NONE | 🔴 |
 * | `lib/portfolio.ts` | `m8-portfolio.test.ts` | PARTIAL | 🔴 BUG-LIB-11 未覆盖 |
 * | `lib/guest-tracking.ts` | `m13-guest-tracking.test.ts` | PARTIAL | ⚠️ |
 * | `lib/storage-utils.ts` | NONE | NONE | 🔴 |
 * | `lib/upload-utils.ts` | `m7-upload-utils.test.ts` | PARTIAL | ⚠️ |
 *
 * ## 模块八：Portfolio 页面
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `app/portfolio/page.tsx` | `m8-portfolio-page.test.ts` | PARTIAL | 🔴 BUG-PAGE-06 未覆盖 |
 * | `app/portfolio/[slug]/page.tsx` | NONE | NONE | 🔴 |
 * | `components/portfolio/portfolio-timeline.tsx` | NONE | NONE | 🔴 |
 * | `components/portfolio/portfolio-calendar.tsx` | NONE | NONE | 🔴 |
 *
 * ## 模块九：搜索
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `app/search/page.tsx` | `m9-search.test.ts` | PARTIAL | 🔴 BUG-PAGE-08 未覆盖 |
 * | `lib/search.ts` | NONE | NONE | 🔴 |
 *
 * ## 模块十：邮件
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `lib/email.ts` | `m10-email.test.ts` | PARTIAL | 🔴 |
 *
 * ## 模块十一：HTML 处理
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `lib/review-html.ts` | `m7-review-html.test.ts` | PARTIAL | ⚠️ |
 * | `lib/article-html.ts` | NONE | NONE | 🔴 |
 *
 * ## 模块十二：代理和安全
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `app/api/fetch-external-image/route.ts` | `m12-fetch-external-image.test.ts` | PARTIAL | ⚠️ |
 * | `lib/security.ts` | `m7-security.test.ts` | FULL | ✅ |
 * | `app/api/admin/storage-upload/route.ts` | NONE | NONE | 🔴 |
 * | `app/api/admin/storage-file/route.ts` | NONE | NONE | 🔴 |
 *
 * ## 模块十三：Reading Settings
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `app/api/reading-settings/route.ts` | `m13-reading-settings-api.test.ts` | PARTIAL | 🔴 BUG-PAGE-23 未覆盖 |
 * | `lib/reading-settings.ts` | `m13-reading-settings.test.ts` | PARTIAL | 🔴 |
 *
 * ## 模块十四：Admin 后台
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `app/admin/articles/page.tsx` | `m14-admin-articles-api.test.ts` | NONE | 🔴 BUG-PAGE-05 未覆盖 |
 * | `app/admin/membership/operations/route.ts` | `m14-admin-membership-operations.test.ts` | PARTIAL | 🔴 BUG-API-17 未覆盖 |
 * | `app/admin/membership/route.ts` | `m14-admin-membership-api.test.ts` | PARTIAL | ⚠️ |
 * | `app/admin/dashboard/route.ts` | `m14-admin-dashboard.test.ts` | PARTIAL | 🔴 BUG-API-08 未覆盖 |
 * | `app/admin/users/create/page.tsx` | NONE | NONE | 🔴 BUG-PAGE-02 假实现 |
 * | `app/admin/categories/page.tsx` | NONE | NONE | 🔴 BUG-PAGE-03/17 未覆盖 |
 * | `app/admin/categories/CategoryItem.tsx` | NONE | NONE | 🔴 BUG-PAGE-22 未覆盖 |
 * | `app/admin/simple-editor/page.tsx` | NONE | NONE | 🔴 BUG-PAGE-18 测试代码遗留 |
 *
 * ## 模块十五：页面集成
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `app/masters/page.tsx` | `m15-masters-all-page.test.ts` | NONE | 🔴 BUG-PAGE-04 未覆盖 |
 * | `app/masters/all/page.tsx` | NONE | NONE | 🔴 |
 * | `app/notes/page.tsx` | NONE | NONE | 🔴 |
 * | `app/notes/all/page.tsx` | NONE | NONE | 🔴 |
 * | `app/stocks/page.tsx` | NONE | NONE | ✅ 正确使用 Suspense |
 * | `app/stocks/all/page.tsx` | NONE | NONE | ✅ |
 *
 * ## 模块十六：Hooks 和组件
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `hooks/use-article-reader.ts` | `m16-article-reader.test.ts` | PARTIAL | 🔴 BUG-hooks-05 |
 * | `hooks/use-toast.ts` | NONE | NONE | 🔴 BUG-hooks-01 未覆盖 |
 * | `hooks/use-mobile.ts` | NONE | NONE | 🔴 BUG-hooks-02 未覆盖 |
 * | `hooks/use-reading-settings.ts` | NONE | NONE | 🔴 BUG-hooks-03 未覆盖 |
 * | `components/membership-provider.tsx` | `m6-membership-provider.test.ts` | PARTIAL | 🔴 BUG-comp-01 |
 * | `components/site-header.tsx` | NONE | NONE | 🔴 BUG-comp-03 |
 * | `components/article-sidebar.tsx` | NONE | NONE | 🔴 BUG-comp-10 |
 * | `components/article-layout.tsx` | `m7-article-layout.test.ts` | PARTIAL | 🔴 |
 * | `components/wechat-guide-overlay.tsx` | NONE | NONE | 🔴 BUG-comp-12 |
 * | `components/auth/login-form.tsx` | NONE | NONE | 🔴 BUG-comp-16 未覆盖 |
 * | `components/admin/AdminDashboard.tsx` | NONE | NONE | 🔴 BUG-comp-14 未覆盖 |
 * | `components/layout/Header.tsx` | NONE | NONE | 🔴 BUG-comp-19 mock 数据 |
 *
 * ## 模块十七：后端 Express API
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `backend/routes/articles.js` | NONE | NONE | 🔴 BUG-backend-02/11 未覆盖 |
 * | `backend/routes/auth.js` | NONE | NONE | 🔴 BUG-backend-04/05 未覆盖 |
 * | `backend/routes/categories.js` | NONE | NONE | 🔴 BUG-backend-06 未覆盖 |
 * | `backend/routes/membership.js` | NONE | NONE | 🔴 BUG-backend-07/08 未覆盖 |
 * | `backend/tests/m17-uncov.test.js` | NONE | NONE | 🔴 |
 *
 * ## 模块十八：脚本和工具
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `scripts/` | `m18-uncov.test.ts` | PARTIAL | ⚠️ |
 * | `lib/storage-utils.ts` (cleanupExpiredStorage) | NONE | NONE | 🔴 注释说未实现 |
 *
 * ## 模块十九：错误处理
 * | 文件/模块 | 测试文件 | 覆盖等级 | 状态 |
 * |---------|---------|---------|------|
 * | `app/error.tsx` | `m11-error-boundary.test.tsx` | PARTIAL | ⚠️ |
 * | `lib/errors.ts` | `m7-errors.test.ts` | PARTIAL | ⚠️ |
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 关键发现：最需要优先补充测试的模块
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 🔴 CRITICAL（直接导致功能失效）：
 *
 * 1. `app/admin/login/route.ts` — BUG-API-01/02 速率限制
 *    建议：添加速率限制的集成测试，模拟 Supabase 延迟/错误
 *
 * 2. `app/membership/activate/route.ts` — BUG-API-06 RPC null 处理
 *    建议：添加 RPC 返回 {data:null, error:null} 的测试场景
 *
 * 3. `app/admin/users/create/page.tsx` — BUG-PAGE-02 假实现
 *    建议：完全重写 handleSubmit，连接真实 API
 *
 * 4. `app/masters/[slug]/page.tsx` — BUG-PAGE-01 死代码
 *    建议：调用 buildArticlePage 或删除未使用的函数
 *
 * 5. `lib/payments.ts` — BUG-LIB-02 浏览器客户端调用 RPC
 *    建议：改为使用 supabase-admin.ts
 *
 * 🟡 HIGH（逻辑错误或数据问题）：
 *
 * 6. `app/admin/membership/operations/route.ts` — BUG-API-17 SQL 失败不报错
 * 7. `app/api/guest-reading/route.ts` — BUG-API-12 TOCTOU 竞态
 * 8. `app/portfolio/page.tsx` — BUG-PAGE-06 直接修改 state 数组
 * 9. `app/admin/articles/page.tsx` — BUG-PAGE-05 window.location.reload
 * 10. `lib/referral.ts` — BUG-LIB-07 并发重置日期竞态
 * 11. `lib/redeem.ts` — BUG-LIB-04 非原子操作
 *
 * ⚠️ 需要迁移到直接 import 的测试：
 * - `m1-articles.test.ts` → `lib-articles-import.test.ts`
 * - `m3-referral.test.ts` → 需要保留（内联了 mock 逻辑）
 * - `m3-redeem.test.ts` → 需要保留（内联了 mock 逻辑）
 */
