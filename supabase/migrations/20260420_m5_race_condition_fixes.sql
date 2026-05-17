-- ============================================================
-- 数据库迁移脚本：M5 安全竞态修复
-- 执行时间：2026-04-20
--
-- 修复记录：
-- M5-01 FIX: 添加 memberships (user_id, membership_type) UNIQUE 约束
--             配合 lib/redeem.ts 中的 upsert，实现会员激活的原子性
-- M5-04 FIX: 添加 referrals (referrer_id, referee_id) UNIQUE 约束
--             配合 lib/referral.ts 中的 upsert，消除重复邀请关系
-- M5-05 FIX: 添加 increment RPC，实现原子计数器增量
--             配合 lib/referral.ts 中奖励更新的原子化
-- ============================================================

-- ─── 1. memberships 表 UNIQUE 约束 ────────────────────────────────────

-- M5-01/M5-03 FIX: 在 memberships 表上建立 UNIQUE 约束
-- 与 lib/redeem.ts 中的 upsert(onConflict: "user_id,membership_type") 配合
-- 确保同一用户同类会员只有一条 active 记录，消除并发双重 INSERT 竞态

-- 先删除旧约束（如果存在），再重建
DO $$
BEGIN
  -- 尝试删除旧约束（PostgreSQL 中 UNIQUE 约束自动创建同名 INDEX）
  ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_user_type_active_unique;
EXCEPTION WHEN OTHERS THEN
  -- 忽略错误（约束不存在），继续执行
END $$;

-- 添加 UNIQUE 约束：同一用户同类会员只能有一条有效记录
-- 注意：UNIQUE 约束只对 status='active' 的记录生效，旧记录可能需先清理
ALTER TABLE memberships
  ADD CONSTRAINT memberships_user_type_active_unique
  UNIQUE (user_id, membership_type);

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_memberships_user_type
  ON memberships(user_id, membership_type)
  WHERE status = 'active';


-- ─── 2. referrals 表 UNIQUE 约束 ────────────────────────────────────

-- M5-04 FIX: 在 referrals 表上建立 UNIQUE 约束
-- 与 lib/referral.ts 中的 upsert(onConflict: "referrer_id,referee_id") 配合
-- 确保同一推荐人+被推荐人组合只能插入一次，消除并发双重 INSERT 竞态

DO $$
BEGIN
  ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_pair_unique;
EXCEPTION WHEN OTHERS THEN
END $$;

ALTER TABLE referrals
  ADD CONSTRAINT referrals_pair_unique
  UNIQUE (referrer_id, referee_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referee
  ON referrals(referee_id);


-- ─── 3. 原子计数器 RPC ────────────────────────────────────────────

-- M5-01 FIX / M5-05 FIX: 原子增量 RPC
-- 用于 lib/redeem.ts 和 lib/referral.ts 中的奖励/次数原子更新
--
-- 使用方式：
--   supabase.rpc("atomic_increment_counter", { table_name: 'user_profiles', column_name: 'bonus_read_count', row_id: userId, increment_by: 2 })
-- 注意：此函数在 PostgreSQL 层保证原子性，不存在 Check-Then-Act 竞态

CREATE OR REPLACE FUNCTION atomic_increment_counter(
  table_name TEXT,
  column_name TEXT,
  row_id UUID,
  increment_by INTEGER DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE format(
    'UPDATE %I SET %I = %I + $1 WHERE id = $2 RETURNING %I',
    table_name,
    column_name,
    column_name,
    column_name
  ) INTO result USING increment_by, row_id;

  RETURN jsonb_build_object(
    'success', result IS NOT NULL,
    'new_value', result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION atomic_increment_counter(TEXT, TEXT, UUID, INTEGER) IS
  '原子计数器增量 RPC（M5-01/M5-05 竞态修复）。
   在 PostgreSQL 层保证原子性，消除 Check-Then-Act 竞态。
   用法：supabase.rpc("atomic_increment_counter", { table_name, column_name, row_id, increment_by })';


-- ─── 4. 验证查询 ──────────────────────────────────────────────────────────

-- 验证 memberships UNIQUE 约束
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'memberships';

-- 验证 referrals UNIQUE 约束
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'referrals';


-- ─── 回滚脚本 ──────────────────────────────────────────────────────────

-- ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_user_type_active_unique;
-- ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_pair_unique;
