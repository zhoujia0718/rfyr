-- ============================================================
-- 数据库迁移脚本：会员操作审计日志表 + 会员激活 RPC
-- 执行时间：2026-04-20
--
-- 修复记录：
-- P8: 添加 membership_audit_log 表，记录所有会员状态变更
-- P1: 添加 activate_membership RPC，确保数据一致性
-- P2: 使用标准会员类型（monthly/yearly），兼容旧命名
-- ============================================================

-- ─── 1. 创建审计日志表 ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS membership_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID,                                   -- 操作管理员 ID（null=用户自己操作）
  target_user_id UUID NOT NULL,                    -- 被操作的用户 ID
  action TEXT NOT NULL,                             -- 操作类型：activate / renew / cancel / upgrade / downgrade
  old_value TEXT,                                  -- 变更前值（membership_type 或 vip_tier）
  new_value TEXT,                                  -- 变更后值
  metadata JSONB DEFAULT '{}',                      -- 额外信息：planType, orderId, days, 激活方式等
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE membership_audit_log IS '会员操作审计日志表';
COMMENT ON COLUMN membership_audit_log.admin_id IS '操作管理员ID，null表示用户自己操作';
COMMENT ON COLUMN membership_audit_log.target_user_id IS '被操作用户ID';
COMMENT ON COLUMN membership_audit_log.action IS '操作类型：activate/renew/cancel/upgrade/downgrade';
COMMENT ON COLUMN membership_audit_log.old_value IS '变更前的会员类型';
COMMENT ON COLUMN membership_audit_log.new_value IS '变更后的会员类型';

-- RLS 策略
ALTER TABLE membership_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON membership_audit_log
  FOR ALL USING (true) WITH CHECK (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_audit_target_user ON membership_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON membership_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON membership_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON membership_audit_log(action);

-- ─── 2. 会员类型标准化映射函数 ─────────────────────────────────────

/**
 * 将任意 membership_type 字符串规范化为标准类型。
 * 兼容旧命名：monthly_vip → monthly, annual_vip → yearly
 */
CREATE OR REPLACE FUNCTION normalize_membership_type(raw_type TEXT)
RETURNS TEXT AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF raw_type IS NULL OR raw_type = '' OR raw_type = 'none' THEN
    RETURN 'none';
  END IF;

  -- 移除下划线，统一小写
  normalized = lower(replace(raw_type, '_', ''));

  -- 永久会员
  IF normalized = 'permanent' THEN
    RETURN 'permanent';
  END IF;

  -- 年度会员（yearly 或 annual）
  IF normalized ~ 'year' OR normalized ~ 'annual' THEN
    RETURN 'yearly';
  END IF;

  -- 月度会员
  IF normalized ~ 'month' THEN
    RETURN 'monthly';
  END IF;

  RETURN 'none';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── 3. 会员激活 RPC 函数 ─────────────────────────────────────────

/**
 * 原子化会员激活/续期。
 * 包含所有必要的数据变更 + 审计日志。
 *
 * 参数：
 *   p_user_id       - 用户 ID
 *   p_plan_type     - 会员类型：monthly / yearly
 *   p_order_id      - 订单号（可选）
 *   p_days          - 有效期天数
 *   p_is_manual     - 是否手动激活（true=管理员操作）
 *
 * 返回值：
 *   { success: true, tier, start_date, end_date }
 */
CREATE OR REPLACE FUNCTION activate_membership(
  p_user_id UUID,
  p_plan_type TEXT,
  p_order_id TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 30,
  p_is_manual BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_existing_end TIMESTAMPTZ;
  v_final_end TIMESTAMPTZ;
  v_old_type TEXT;
  v_new_type TEXT;
  v_result JSONB;
BEGIN
  -- 标准化会员类型
  v_new_type = normalize_membership_type(p_plan_type);
  IF v_new_type = 'none' THEN
    RAISE EXCEPTION '无效的会员类型: %', p_plan_type;
  END IF;

  -- 计算日期
  v_start_date = NOW();
  v_end_date = v_start_date + (p_days || ' days')::INTERVAL;

  -- 查询现有有效会员
  SELECT end_date, membership_type INTO v_existing_end, v_old_type
  FROM memberships
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  -- 续期：从现有到期日延长
  IF v_existing_end IS NOT NULL AND v_existing_end > NOW() THEN
    v_final_end = v_existing_end + (p_days || ' days')::INTERVAL;
  ELSE
    v_final_end = v_end_date;
  END IF;

  -- 开启事务
  BEGIN
    -- 停用旧会员记录
    UPDATE memberships
    SET status = 'expired'
    WHERE user_id = p_user_id AND status = 'active';

    -- 写入新会员记录
    INSERT INTO memberships (user_id, membership_type, status, start_date, end_date, order_id, source)
    VALUES (
      p_user_id,
      v_new_type,
      'active',
      v_start_date,
      v_final_end,
      p_order_id,
      CASE WHEN p_is_manual THEN 'admin_manual' ELSE 'payment' END
    );

    -- 更新 users.vip_tier
    UPDATE users
    SET vip_tier = v_new_type
    WHERE id = p_user_id;

    -- 同步 user_profiles.vip_status
    UPDATE user_profiles
    SET vip_status = TRUE, updated_at = NOW()
    WHERE id = p_user_id;

    -- 写入审计日志
    INSERT INTO membership_audit_log (admin_id, target_user_id, action, old_value, new_value, metadata)
    VALUES (
      NULL,
      p_user_id,
      CASE WHEN v_old_type IS NULL THEN 'activate' ELSE 'renew' END,
      v_old_type,
      v_new_type,
      jsonb_build_object(
        'planType', p_plan_type,
        'orderId', p_order_id,
        'days', p_days,
        'startDate', v_start_date,
        'endDate', v_final_end,
        'manual', p_is_manual,
        'activatedBy', 'self'
      )
    );

    v_result = jsonb_build_object(
      'success', TRUE,
      'tier', v_new_type,
      'startDate', v_start_date,
      'endDate', v_final_end
    );

  EXCEPTION WHEN OTHERS THEN
    -- 事务回滚
    RAISE;
  END;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. 会员取消 RPC 函数 ───────────────────────────────────────────

/**
 * 原子化取消会员。
 */
CREATE OR REPLACE FUNCTION cancel_membership(
  p_user_id UUID,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_old_type TEXT;
  v_membership_id UUID;
BEGIN
  -- 查询现有会员
  SELECT id, membership_type INTO v_membership_id, v_old_type
  FROM memberships
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', '无有效会员记录');
  END IF;

  -- 事务
  BEGIN
    -- 更新用户状态
    UPDATE user_profiles
    SET vip_status = FALSE, updated_at = NOW()
    WHERE id = p_user_id;

    UPDATE users
    SET vip_tier = 'none'
    WHERE id = p_user_id;

    -- 删除会员记录（或标记为 cancelled）
    DELETE FROM memberships WHERE id = v_membership_id;

    -- 审计日志
    INSERT INTO membership_audit_log (admin_id, target_user_id, action, old_value, new_value, metadata)
    VALUES (
      p_admin_id,
      p_user_id,
      'cancel',
      v_old_type,
      'none',
      jsonb_build_object('cancelledBy', CASE WHEN p_admin_id IS NULL THEN 'self' ELSE 'admin' END)
    );

  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;

  RETURN jsonb_build_object('success', TRUE);
END;
$$ LANGUAGE plpgsql;

-- ─── 5. 数据清洗：修复旧命名 ─────────────────────────────────────────

-- 将 memberships 表中的旧命名批量更新为标准命名
UPDATE memberships
SET membership_type = 'monthly'
WHERE normalize_membership_type(membership_type) = 'monthly'
  AND membership_type != 'monthly';

UPDATE memberships
SET membership_type = 'yearly'
WHERE normalize_membership_type(membership_type) = 'yearly'
  AND membership_type NOT IN ('yearly', 'annual_vip', 'yearly_vip');

-- 验证查询
-- SELECT membership_type, normalize_membership_type(membership_type) as normalized, count(*)
-- FROM memberships GROUP BY membership_type, normalized;

-- ─── 回滚脚本 ─────────────────────────────────────────────────────────

-- DROP FUNCTION IF EXISTS cancel_membership(UUID);
-- DROP FUNCTION IF EXISTS activate_membership(UUID, TEXT, TEXT, INTEGER, BOOLEAN);
-- DROP FUNCTION IF EXISTS normalize_membership_type(TEXT);
-- DROP TABLE IF EXISTS membership_audit_log;
