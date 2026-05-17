-- 创建每日复盘/严选逻辑权限表
-- 在 Supabase SQL Editor 中执行此文件

CREATE TABLE IF NOT EXISTS review_access (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_type TEXT       NOT NULL CHECK (permission_type IN ('monthly', 'quarterly')),
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_review_access_user_id    ON review_access (user_id);
CREATE INDEX IF NOT EXISTS idx_review_access_expires_at ON review_access (expires_at);

-- 启用 RLS（所有读写均通过 service_role key 进行，普通用户无法直接访问）
ALTER TABLE review_access ENABLE ROW LEVEL SECURITY;
