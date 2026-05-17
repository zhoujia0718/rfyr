-- ============================================================
-- 修复 referrals 表 RLS INSERT 策略
-- 执行时间：2026-04-27
--
-- 问题根因：
--   createReferral() 使用 service role key 调用 Supabase。
--   service role 下 auth.uid() = null，而 "Anyone can insert referrals"
--   策略的 WITH CHECK 要求 auth.uid() = referrer_id，导致条件永远不满足。
--   INSERT 被 RLS 静默拒绝，referrals 表无记录，奖励发放被跳过。
--
-- 修复：
--   删除旧的 "Anyone can insert referrals" 策略，
--   替换为仅允许 service role 插入的新策略。
-- ============================================================

-- 删除旧的（有缺陷的）INSERT 策略
DROP POLICY IF EXISTS "Anyone can insert referrals" ON referrals;

-- 新策略：仅服务角色可插入邀请关系
-- service role 下 auth.jwt()->>'role' = 'service_role' 成立，绕过 auth.uid() 检查
CREATE POLICY "Service role can insert referrals"
ON referrals FOR INSERT
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- 删除旧脚本中的同名策略（如果该脚本被执行过）
-- 这确保两边只各有一个 INSERT 策略
DROP POLICY IF EXISTS "Anyone can insert referrals" ON referrals;

COMMENT ON POLICY "Service role can insert referrals" ON referrals IS
  '仅允许 service role（服务端 createReferral）插入邀请关系，防止 RLS 误拦截。邀请关系的双方不能相同（由数据库层 UNIQUE 约束 referrals_pair_unique 保证）';
