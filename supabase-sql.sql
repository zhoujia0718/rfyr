-- 创建categories表
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  description TEXT,
  href TEXT,
  parent_id UUID REFERENCES categories(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION update_categories_updated_at();

-- 插入模拟分类数据
INSERT INTO categories (id, name, icon, description, href, parent_id)
VALUES
  ('00000000-0000-0000-0000-000000000001', '投资日历', '📅', '投资重要事件和财报日历', '/calendar', NULL),
  ('00000000-0000-0000-0000-000000000002', '大佬合集', '👤', '汇聚投资大师智慧', '/masters', NULL),
  ('00000000-0000-0000-0000-000000000003', '短线笔记', '📝', '短线交易策略和技巧', '/notes', NULL),
  ('00000000-0000-0000-0000-000000000004', '个股挖掘', '📈', '潜力个股深度分析', '/stocks', NULL);

-- 创建articles表
CREATE TABLE IF NOT EXISTS articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  author TEXT NOT NULL,
  publishdate DATE NOT NULL,
  readingcount INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_articles_updated_at
BEFORE UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_articles_updated_at();

-- 插入模拟文章数据
INSERT INTO articles (id, title, content, category, author, publishdate, readingcount)
VALUES
  ('00000000-0000-0000-0000-000000000001', '2024年投资日历', '2024年重要投资事件和财报发布时间...', '投资日历', 'admin', '2024-01-01', 100),
  ('00000000-0000-0000-0000-000000000002', '巴菲特投资策略', '巴菲特的价值投资理念和实践...', '大佬合集', 'admin', '2024-01-02', 200),
  ('00000000-0000-0000-0000-000000000003', '短线交易技巧', '短线交易的技术分析和风险控制...', '短线笔记', 'admin', '2024-01-03', 150),
  ('00000000-0000-0000-0000-000000000004', '潜力个股分析', '2024年值得关注的潜力个股...', '个股挖掘', 'admin', '2024-01-04', 180);

-- 创建users表
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_users_updated_at();

-- 插入模拟用户数据
INSERT INTO users (id, email, name, avatar)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@example.com', '管理员', 'https://avatars.githubusercontent.com/u/1'),
  ('00000000-0000-0000-0000-000000000002', 'user@example.com', '普通用户', 'https://avatars.githubusercontent.com/u/2');

-- 创建memberships表
CREATE TABLE IF NOT EXISTS memberships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  membership_type TEXT NOT NULL, -- weekly_free, annual_vip
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL, -- active, expired
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_memberships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_memberships_updated_at
BEFORE UPDATE ON memberships
FOR EACH ROW
EXECUTE FUNCTION update_memberships_updated_at();

-- 插入模拟会员数据
INSERT INTO memberships (id, user_id, membership_type, start_date, end_date, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'annual_vip', '2024-01-01', '2025-01-01', 'active'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'weekly_free', '2024-01-01', '2024-01-08', 'active');
