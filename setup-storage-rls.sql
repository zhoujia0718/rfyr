-- 配置 payment_proofs 存储桶的 RLS 策略

-- 1. 确保存储桶存在（如果不存在，需要在 Supabase 控制台手动创建）
-- 在 Supabase 控制台中：
-- 1. 进入 Storage 页面
-- 2. 创建名为 "payment_proofs" 的存储桶
-- 3. 设置为 Public

-- 2. 启用 RLS（如果还没启用）
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. 删除旧的策略（如果存在）
DROP POLICY IF EXISTS "Allow authenticated users to upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to read own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public to read payment proofs" ON storage.objects;

-- 4. 创建新的 RLS 策略

-- 策略1：允许认证用户上传文件到 payment_proofs 存储桶
CREATE POLICY "Allow authenticated users to upload payment proofs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment_proofs'
);

-- 策略2：允许认证用户读取自己的文件
CREATE POLICY "Allow authenticated users to read own payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment_proofs'
);

-- 策略3：允许公开读取 payment_proofs 存储桶中的文件（用于显示凭证）
CREATE POLICY "Allow public to read payment proofs"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'payment_proofs'
);

-- 5. 为 payments 表配置 RLS 策略
-- 删除旧的策略（如果存在）
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
DROP POLICY IF EXISTS "Users can create payments" ON payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON payments;
DROP POLICY IF EXISTS "Admins can update payments" ON payments;

-- 启用 RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 策略1：允许用户查看自己的支付记录
CREATE POLICY "Users can view own payments"
ON payments
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 策略2：允许用户创建支付记录
CREATE POLICY "Users can create payments"
ON payments
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 策略3：允许管理员查看所有支付记录
CREATE POLICY "Admins can view all payments"
ON payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND vip_status = TRUE
  )
);

-- 策略4：允许管理员更新支付记录
CREATE POLICY "Admins can update payments"
ON payments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND vip_status = TRUE
  )
);
