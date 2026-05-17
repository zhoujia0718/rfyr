-- 给 pending_registrations 表添加 code_version 列，用于解决验证码竞态问题
-- 场景：用户快速重新发送验证码后，旧验证码提交会被误判为"错误"
-- 修复：每次重新发送时递增 version，提交时必须匹配当前 version 才有效
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS code_version INTEGER NOT NULL DEFAULT 1;
