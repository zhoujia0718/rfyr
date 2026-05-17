-- ============================================================
-- 数据库迁移脚本：阅读限制配置系统
-- 执行时间：2026-04-16
--
-- 主要变更：
-- 1. 创建 reading_settings 表存储阅读限制配置
-- 2. 插入默认配置值
-- ============================================================

-- ─── 1. 创建 reading_settings 表 ────────────────────────────────

CREATE TABLE IF NOT EXISTS reading_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',  -- 使用 'global' 作为主键，便于只有一个配置
  guest_read_limit INTEGER DEFAULT 3,             -- 游客阅读上限（篇）
  monthly_daily_limit INTEGER DEFAULT 8,        -- 月卡用户每日阅读上限（篇）
  referral_bonus_count INTEGER DEFAULT 2,         -- 邀请奖励阅读次数（每次邀请）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 注释说明
COMMENT ON TABLE reading_settings IS '阅读限制配置表';
COMMENT ON COLUMN reading_settings.guest_read_limit IS '未登录用户阅读上限（篇）';
COMMENT ON COLUMN reading_settings.monthly_daily_limit IS '月卡用户每日阅读上限（篇）';
COMMENT ON COLUMN reading_settings.referral_bonus_count IS '每邀请一位用户增加的阅读次数';

-- ─── 2. 插入默认配置 ──────────────────────────────────────────

INSERT INTO reading_settings (id, guest_read_limit, monthly_daily_limit, referral_bonus_count)
VALUES ('global', 3, 8, 2)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. 创建更新触发器 ────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_reading_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reading_settings_updated ON reading_settings;

CREATE TRIGGER trigger_reading_settings_updated
  BEFORE UPDATE ON reading_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_reading_settings_timestamp();

-- ─── 4. RLS 策略 ──────────────────────────────────────────────

ALTER TABLE reading_settings ENABLE ROW LEVEL SECURITY;

-- 允许 service role 完全访问
CREATE POLICY "Allow service role full access to reading_settings" ON reading_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 允许任何人读取（前端需要显示配置）
CREATE POLICY "Allow public read reading_settings" ON reading_settings
  FOR SELECT
  USING (true);

-- ─── 验证查询 ─────────────────────────────────────────────────

-- SELECT * FROM reading_settings;

-- ─── 回滚脚本 ────────────────────────────────────────────────

-- DROP TRIGGER IF EXISTS trigger_reading_settings_updated ON reading_settings;
-- DROP FUNCTION IF EXISTS update_reading_settings_timestamp();
-- DROP TABLE IF EXISTS reading_settings;
