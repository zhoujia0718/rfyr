-- ============================================================
-- 修复 redeem_codes CHECK 约束，添加 'monthly' 类型
-- 执行时间：2026-04-29
--
-- 问题：redeem_codes 表的 CHECK 约束只有 ('weekly', 'yearly')，
--       代码使用 'monthly'，导致 INSERT 被拦截，兑换码无法写入数据库。
--       查询时找不到 → "兑换码无效"
--
-- 修复：将 CHECK 约束改为 ('monthly', 'yearly')，与代码保持一致
-- ============================================================

-- Step 1: 清理已存在但类型无效的旧记录（可选，如有 'weekly' 记录）
-- 先检查是否有 weekly 类型的旧记录
-- SELECT DISTINCT type FROM redeem_codes;

-- 如果有 weekly 记录且已无实际使用场景，可选择删除：
-- DELETE FROM redeem_codes WHERE type = 'weekly';

-- Step 2: 删除旧的 CHECK 约束（PostgreSQL UNIQUE 约束会同时创建同名索引）
DO $$
BEGIN
  -- 尝试删除约束（PostgreSQL 中 CHECK 约束没有自动创建的索引）
  ALTER TABLE redeem_codes DROP CONSTRAINT IF EXISTS redeem_codes_type_check;
EXCEPTION WHEN OTHERS THEN
  -- 忽略错误（约束可能不存在或名称不同）
  RAISE NOTICE 'Could not drop constraint: %', SQLERRM;
END $$;

-- 重新添加包含 'monthly' 的 CHECK 约束
ALTER TABLE redeem_codes
  ADD CONSTRAINT redeem_codes_type_check
  CHECK (type IN ('monthly', 'yearly'));

-- 验证修复
DO $$
DECLARE
  constraint_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO constraint_def
  FROM pg_constraint
  WHERE conname = 'redeem_codes_type_check'
    AND conrelid = 'redeem_codes'::regclass;

  RAISE NOTICE 'redeem_codes CHECK constraint is now: %', constraint_def;
END $$;

-- ============================================================
-- 完成确认
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ redeem_codes CHECK 约束修复完成！';
  RAISE NOTICE '   type 现在支持: monthly, yearly';
  RAISE NOTICE '';
  RAISE NOTICE '   注意：需要重新生成兑换码，旧码可能因 CHECK 约束无法写入。';
END $$;
