-- ============================================================
-- 修复 memberships 表缺失列 + UNIQUE 约束
-- 执行时间：2026-04-29
--
-- 问题：redeem 兑换年卡时报错
--   "Could not find the 'source' column of 'memberships' in the schema cache"
--
-- 修复：
--   1. memberships 表添加 source 列（允许 NULL，保持向后兼容）
--   2. memberships 表添加 (user_id, membership_type) UNIQUE 约束
--   3. memberships 表添加 source CHECK 约束
--
-- 执行方法：Supabase Dashboard → SQL Editor → 粘贴运行
-- ============================================================

-- 1. 添加 source 列（IF NOT EXISTS 防止重复添加报错）
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS source TEXT;

-- 添加 CHECK 约束（允许 NULL 和空值）
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_source_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_source_check
  CHECK (source IS NULL OR source IN ('purchase', 'redeem', 'free_task', 'admin_manual', 'payment'));

-- 2. 添加 (user_id, membership_type) UNIQUE 约束
-- 先删除旧约束（如果存在），再重建
DO $$
BEGIN
  ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_user_type_active_unique;
EXCEPTION WHEN OTHERS THEN
  -- 忽略错误（约束不存在），继续执行
END $$;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_user_type_active_unique
  UNIQUE (user_id, membership_type);

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_memberships_user_type
  ON memberships(user_id, membership_type)
  WHERE status = 'active';

-- 3. 验证
DO $$
BEGIN
  RAISE NOTICE '修复完成！';
  RAISE NOTICE '  memberships.source 列: 已添加（允许 NULL）';
  RAISE NOTICE '  memberships UNIQUE 约束: 已创建';
END $$;
