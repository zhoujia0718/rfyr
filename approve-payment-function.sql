-- 创建原子化核销函数
CREATE OR REPLACE FUNCTION approve_payment(p_payment_id UUID, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 在一个事务中同时更新支付状态和用户 VIP 状态
  UPDATE payments
  SET status = 'approved'
  WHERE id = p_payment_id;

  UPDATE user_profiles
  SET vip_status = TRUE,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 创建拒绝支付函数
CREATE OR REPLACE FUNCTION reject_payment(p_payment_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 只更新支付状态，不影响用户 VIP 状态
  UPDATE payments
  SET status = 'rejected'
  WHERE id = p_payment_id;
END;
$$ LANGUAGE plpgsql;

-- 创建获取用户 VIP 状态的函数
CREATE OR REPLACE FUNCTION get_user_vip_status(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT vip_status FROM user_profiles WHERE id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
