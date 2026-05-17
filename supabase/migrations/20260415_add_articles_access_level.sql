-- ============================================================
-- 新增字段：文章权限级别
-- 执行时间：2026-04-15
--
-- access_level 含义：
--   free     = 所有人可访问（包括游客）
--   monthly  = 月卡或年卡用户可访问（默认）
--   yearly   = 仅年卡用户可访问
-- ============================================================

-- 给 articles 表添加权限级别字段
ALTER TABLE articles
ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'monthly'
CHECK (access_level IN ('free', 'monthly', 'yearly'));

-- 添加注释
COMMENT ON COLUMN articles.access_level IS '文章访问权限: free=免费, monthly=月卡可见, yearly=年卡专属';

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_articles_access_level
ON articles(access_level) WHERE access_level != 'free';

-- ============================================================
-- 可选：批量更新现有文章权限
-- 如果某些分类默认是年卡专属（如"每日复盘"），可以批量设置
-- ============================================================

-- 示例：将 is_review=true 的文章设为年卡专属
-- UPDATE articles SET access_level = 'yearly' WHERE is_review = true;

-- 示例：将特定分类设为年卡专属
-- UPDATE articles SET access_level = 'yearly' WHERE category = '每日复盘';

-- ============================================================
-- 回滚（如需回滚）
-- ============================================================
-- ALTER TABLE articles DROP COLUMN IF EXISTS access_level;
