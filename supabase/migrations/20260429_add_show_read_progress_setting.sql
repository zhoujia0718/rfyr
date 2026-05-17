-- ============================================================
-- 添加已读进度展示开关
-- 执行时间：2026-04-29
--
-- 功能：管理员可控制是否在导航栏显示已读篇数进度条、
--       以及在侧边栏显示已读文章样式
--
-- 逻辑：
--   - 年卡用户：始终不显示（无限制，不需要）
--   - 非年卡用户：根据 show_read_progress 开关控制
--
-- 执行方法：Supabase Dashboard → SQL Editor → 粘贴运行
-- ============================================================

ALTER TABLE reading_settings
ADD COLUMN IF NOT EXISTS show_read_progress BOOLEAN DEFAULT FALSE;

-- 为现有全局配置行设置默认值
UPDATE reading_settings
SET show_read_progress = FALSE
WHERE id = 'global' AND show_read_progress IS NULL;

ALTER TABLE reading_settings
ALTER COLUMN show_read_progress SET DEFAULT FALSE;

DO $$
BEGIN
  RAISE NOTICE '✅ 已读进度展示开关已添加（show_read_progress，默认 false）';
END $$;
