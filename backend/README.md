# 后端服务说明

## 技术栈
- Node.js
- Express
- MongoDB
- JWT

## 功能
- 用户认证（微信登录）
- 会员管理
- 文章管理
- 分类管理

## 快速开始

### 1. 安装依赖
```bash
cd backend
npm install
```

### 2. 配置环境变量
编辑 `.env` 文件，设置以下环境变量：
```env
# 数据库连接信息
MONGODB_URI=mongodb://localhost:27017/investment-platform

# JWT密钥
JWT_SECRET=your-secret-key-here

# 服务器端口
PORT=3001

# 支付相关配置
PAYMENT_API_KEY=your-payment-api-key
PAYMENT_SECRET=your-payment-secret
```

### 3. 启动服务
```bash
npm start
```

服务将运行在 http://localhost:3001

## API 端点

### 认证相关
- `POST /api/auth/wechat/login` - 微信登录
- `GET /api/auth/verify` - 验证token

### 会员相关
- `POST /api/membership/activate` - 开通会员
- `POST /api/membership/renew` - 续费会员
- `GET /api/membership/status` - 获取会员状态

### 文章相关
- `GET /api/articles` - 获取文章列表
- `GET /api/articles/:id` - 获取文章详情
- `POST /api/articles` - 创建文章
- `PUT /api/articles/:id` - 更新文章
- `DELETE /api/articles/:id` - 删除文章

### 分类相关
- `GET /api/categories` - 获取分类列表
- `POST /api/categories` - 创建分类
- `PUT /api/categories/:id` - 更新分类
- `DELETE /api/categories/:id` - 删除分类

## 注意事项
- 确保 MongoDB 服务正在运行
- 首次运行时，系统会自动创建所需的数据库和集合
- 后台管理系统地址：http://localhost:3000/admin
