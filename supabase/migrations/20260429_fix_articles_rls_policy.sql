-- ============================================================
-- Fix: Add RLS policies for articles table
-- 执行时间：2026-04-29
-- 问题：articles 表启用了 RLS 但没有定义任何策略，导致所有查询返回 403
-- 解决：添加公开读取策略（文章内容默认公开）和服务端全权访问策略
-- ============================================================

-- 确保 RLS 已启用
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 策略 1：允许匿名用户 SELECT（文章列表和详情读取）
-- 行为：所有人都可以读取 articles 表的所有字段
-- 说明：若日后需要限制某些文章，可通过 access_level 字段在应用层过滤
-- ============================================================
CREATE POLICY "Allow anon select articles"
    ON articles
    FOR SELECT
    TO anon
    USING (true);

-- ============================================================
-- 策略 2：允许认证用户 SELECT
-- ============================================================
CREATE POLICY "Allow authenticated select articles"
    ON articles
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================
-- 策略 3：仅允许 service_role 增删改（服务端管理操作）
-- 前端通过 API Route 间接调用，服务端使用 SUPABASE_SERVICE_ROLE_KEY
-- ============================================================
CREATE POLICY "Allow service role all articles"
    ON articles
    FOR ALL
    TO authenticated
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Fix: Add RLS policies for categories table
-- 执行时间：2026-04-29
-- 问题：categories 表启用了 RLS 但没有定义任何策略，导致分类数据读取返回 403
-- 解决：添加公开读取策略和服务端全权访问策略
-- ============================================================

-- 确保 RLS 已启用
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 策略 1：允许匿名用户 SELECT（分类树读取）
-- ============================================================
CREATE POLICY "Allow anon select categories"
    ON categories
    FOR SELECT
    TO anon
    USING (true);

-- ============================================================
-- 策略 2：允许认证用户 SELECT
-- ============================================================
CREATE POLICY "Allow authenticated select categories"
    ON categories
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================
-- 策略 3：仅允许 service_role 全权操作（服务端管理操作）
-- ============================================================
CREATE POLICY "Allow service role all categories"
    ON categories
    FOR ALL
    TO authenticated
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
