-- 为已存在的 pending_registrations 表添加 referrer_code 字段
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS referrer_code TEXT;
