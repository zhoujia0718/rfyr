-- ============================================================
-- 给 user_profiles 表添加邀请奖励字段
-- 执行时间：2026-04-17
--
-- bonus_read_count: 终身额外阅读次数（非会员邀请奖励）
-- bonus_daily_count: 每日额外阅读次数（会员邀请奖励）
-- ============================================================

-- 添加 bonus_read_count 字段（非会员的终身奖励次数）
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS bonus_read_count INTEGER DEFAULT 0;

-- 添加 bonus_daily_count 字段（月卡的每日奖励次数）
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS bonus_daily_count INTEGER DEFAULT 0;

-- 为已有用户初始化字段值（如果已有记录的话）
UPDATE user_profiles
SET bonus_read_count = COALESCE(bonus_read_count, 0),
    bonus_daily_count = COALESCE(bonus_daily_count, 0)
WHERE bonus_read_count IS NULL OR bonus_daily_count IS NULL;

-- 注释说明
COMMENT ON COLUMN user_profiles.bonus_read_count IS '邀请奖励的终身额外阅读次数（给非会员的邀请人）';
COMMENT ON COLUMN user_profiles.bonus_daily_count IS '邀请奖励的每日额外阅读次数（给会员的邀请人）';
