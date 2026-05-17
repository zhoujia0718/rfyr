-- ============================================================
-- 数据库迁移：会员到期提醒 + 游客追踪优化 + reading_settings 多行支持
-- 执行时间：2026-04-20
--
-- P10: 添加会员到期提醒提醒表
-- P6: 优化游客追踪（添加 fingerprint 列，保留 IP+UA hash 作为 fallback）
-- P5: reading_settings 改为可配置化（允许多用户配置）
-- ============================================================

-- ─── 1. 添加游客追踪指纹字段 ─────────────────────────────────────

-- 为 guest_reads 表添加 fingerprint 列
ALTER TABLE guest_reads
ADD COLUMN IF NOT EXISTS fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_guest_reads_fingerprint ON guest_reads(fingerprint)
WHERE fingerprint IS NOT NULL;

COMMENT ON COLUMN guest_reads.fingerprint IS '浏览器指纹（用于更稳定的游客追踪）';

-- ─── 2. 会员到期提醒表 ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS membership_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reminder_type TEXT NOT NULL,    -- 'expiring_3days' / 'expired'
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, reminder_type)  -- 每种提醒只发一次
);

COMMENT ON TABLE membership_reminders IS '会员到期提醒记录表（防重复发送）';
COMMENT ON COLUMN membership_reminders.user_id TO '关联用户';
COMMENT ON COLUMN membership_reminders.reminder_type TO '提醒类型：expiring_3days（3天内到期）/ expired（已到期）';

-- 索引
CREATE INDEX IF NOT EXISTS idx_reminders_user ON membership_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_sent ON membership_reminders(sent_at) WHERE sent_at IS NULL;

-- RLS
ALTER TABLE membership_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access" ON membership_reminders FOR ALL USING (true) WITH CHECK (true);

-- ─── 3. 会员到期提醒 API ──────────────────────────────────────

/**
 * 检查用户是否需要在N天内到期提醒。
 * 用于：登录时显示横幅提醒。
 *
 * 用法：SELECT * FROM check_expiring_members('3 days'::interval);
 */
CREATE OR REPLACE FUNCTION check_expiring_members(days_before_expire INTERVAL)
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  username TEXT,
  tier TEXT,
  end_date DATE,
  days_remaining BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.username,
    m.membership_type,
    m.end_date::date,
    (m.end_date::date - CURRENT_DATE) as days_remaining
  FROM users u
  JOIN memberships m ON m.user_id = u.id
  LEFT JOIN membership_reminders r ON r.user_id = u.id AND r.reminder_type = 'expiring_3days'
  WHERE
    m.status = 'active'
    AND m.end_date > NOW()
    AND m.end_date <= NOW() + days_before_expire
    AND r.id IS NULL  -- 未发送过提醒
  ORDER BY m.end_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 4. reading_settings 多行支持（用户个性化配置）───────────────

-- 允许多用户配置（将 id 列改为可配置）
-- 原有 'global' 行保留作为系统默认
ALTER TABLE reading_settings
ALTER COLUMN id DROP DEFAULT;  -- 移除默认值

-- 添加 user_id 列（null = 全局配置）
ALTER TABLE reading_settings
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reading_settings_user ON reading_settings(user_id)
WHERE user_id IS NOT NULL;

-- RLS：允许用户读写自己的配置
CREATE POLICY "Allow users read own settings" ON reading_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Allow users update own settings" ON reading_settings
  FOR UPDATE
  USING (user_id = current_setting('request.user_id', true)::UUID);

COMMENT ON COLUMN reading_settings.user_id IS '关联用户ID，null表示全局配置';

-- ─── 5. 迁移脚本：确保 reading_settings 全局行存在 ─────────────

INSERT INTO reading_settings (id, guest_read_limit, monthly_daily_limit, referral_bonus_count)
VALUES ('global', 3, 8, 2)
ON CONFLICT (id) DO NOTHING;

-- ─── 回滚脚本 ──────────────────────────────────────────────────

-- DROP INDEX IF EXISTS idx_reminders_sent;
-- DROP INDEX IF EXISTS idx_reminders_user;
-- DROP TABLE IF EXISTS membership_reminders;
-- ALTER TABLE guest_reads DROP COLUMN IF EXISTS fingerprint;
-- ALTER TABLE reading_settings DROP COLUMN IF EXISTS user_id;
