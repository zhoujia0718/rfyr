-- ============================================================
-- 数据库迁移脚本：每日邀请奖励重置机制
-- 执行时间：2026-04-18
--
-- 问题：bonus_daily_count 只增不减，无法按天重置
-- 解决：
--   1. 新增 bonus_daily_reset_date 字段，记录上次重置日期（北京时间）
--   2. 每次 createReferral 时，判断是否需要重置（不是今天则归零再 +N）
--   3. 数据库存的是"今日奖励值"，等于 今日邀请数 × referral_bonus_count
-- ============================================================

-- 新增字段：上次重置日期（北京时间 yyyy-mm-dd）
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS bonus_daily_reset_date DATE DEFAULT '1970-01-01';

COMMENT ON COLUMN user_profiles.bonus_daily_reset_date IS '每日邀请奖励重置日期（北京时间），用于判断是否需要重置 bonus_daily_count';

-- 为已有用户初始化重置日期（今天之前即可，自然触发下次重置）
UPDATE user_profiles
SET bonus_daily_reset_date = '1970-01-01'
WHERE bonus_daily_reset_date IS NULL;

-- ─── 回滚 ────────────────────────────────────────────────────
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS bonus_daily_reset_date;
