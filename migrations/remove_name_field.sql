-- 迁移脚本：移除users表中的name字段，保留username字段

-- 步骤1：更新特殊用户的username字段，确保它们有合适的用户名
UPDATE users 
SET username = '管理员' 
WHERE id = '00000000-0000-0000-0000-000000000002';

UPDATE users 
SET username = '普通用户' 
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 步骤2：移除name字段
ALTER TABLE users DROP COLUMN name;