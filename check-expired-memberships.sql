-- 创建检查过期会员的函数
CREATE OR REPLACE FUNCTION check_expired_memberships()
RETURNS VOID AS $$
DECLARE
  expired_membership RECORD;
BEGIN
  -- 查找所有已过期的会员记录
  FOR expired_membership IN
    SELECT user_id
    FROM memberships
    WHERE end_date < CURRENT_DATE
  LOOP
    -- 更新用户的 vip_status 为 false
    UPDATE user_profiles
    SET vip_status = FALSE,
        updated_at = NOW()
    WHERE id = expired_membership.user_id;
    
    -- 可选：更新会员记录状态为 expired
    UPDATE memberships
    SET status = 'expired'
    WHERE user_id = expired_membership.user_id
    AND end_date < CURRENT_DATE;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 创建定时触发器
-- 注意：在 Supabase 中，你需要通过控制台或 CLI 来设置定时任务
-- 这里我们创建函数，然后你可以在 Supabase 控制台中设置每小时执行一次

-- 测试函数
SELECT check_expired_memberships();