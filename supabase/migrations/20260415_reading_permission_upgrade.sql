-- ============================================================
-- 数据库迁移脚本：阅读权限系统升级
-- 执行时间：2026-04-15
--
-- 主要变更：
-- 1. 周卡 → 月卡（vip_tier = 'weekly' → 'monthly'）
-- 2. 新增阅读奖励字段（bonus_read_count, bonus_daily_count）
-- 3. 兑换码表支持月卡类型（RFYR-MONTH-XXXXXX）
-- ============================================================

-- ─── 1. user_profiles 表：新增阅读奖励字段 ────────────────────────────────

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS bonus_read_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bonus_daily_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_free_used BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS monthly_purchase_count INTEGER DEFAULT 0;

-- 注释说明
COMMENT ON COLUMN user_profiles.bonus_read_count IS '普通用户邀请奖励：增加免费阅读总次数';
COMMENT ON COLUMN user_profiles.bonus_daily_count IS '月卡用户邀请奖励：增加每日阅读次数';
COMMENT ON COLUMN user_profiles.monthly_free_used IS '是否已使用免费月卡';
COMMENT ON COLUMN user_profiles.monthly_purchase_count IS '月卡购买次数（含免费）';

-- ─── 2. 更新现有用户数据 ──────────────────────────────────────────────

-- 将 weekly_vip 改为 monthly_vip（memberships 表）
UPDATE memberships
SET membership_type = 'monthly_vip'
WHERE membership_type = 'weekly_vip';

-- 将 vip_tier = 'weekly' 改为 'monthly'（users 表）
UPDATE users
SET vip_tier = 'monthly'
WHERE vip_tier = 'weekly';

-- ─── 3. memberships 表：新增 monthly_vip 类型 ─────────────────────────

-- membership_type 枚举已支持，新增无需 ALTER
-- 如需限制插入值，可创建触发器或检查约束（可选）

-- ─── 4. redeem_codes 表：支持月卡类型 ───────────────────────────────

-- membership_type 枚举已支持，新增无需 ALTER
-- 注意：旧版数据库可能使用 'weekly' 类型，需要确保兼容性

-- ─── 5. 创建索引（优化查询性能）─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_profiles_bonus
ON user_profiles(id, bonus_read_count, bonus_daily_count);

CREATE INDEX IF NOT EXISTS idx_memberships_monthly
ON memberships(user_id, membership_type, status)
WHERE membership_type = 'monthly_vip';

CREATE INDEX IF NOT EXISTS idx_redeem_codes_monthly_type
ON redeem_codes(type, status)
WHERE type = 'monthly';

-- ─── 验证查询 ─────────────────────────────────────────────────────────

-- 检查 user_profiles 字段是否添加成功
-- SELECT bonus_read_count, bonus_daily_count, monthly_free_used FROM user_profiles LIMIT 1;

-- 检查 memberships 数据是否已迁移
-- SELECT DISTINCT membership_type FROM memberships;

-- 检查 users 数据是否已迁移
-- SELECT DISTINCT vip_tier FROM users WHERE vip_tier IS NOT NULL;

-- ─── 回滚脚本（如需回滚）───────────────────────────────────────────────

-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS bonus_read_count;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS bonus_daily_count;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS monthly_free_used;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS monthly_purchase_count;

-- UPDATE memberships SET membership_type = 'weekly_vip' WHERE membership_type = 'monthly_vip';
-- UPDATE users SET vip_tier = 'weekly' WHERE vip_tier = 'monthly';