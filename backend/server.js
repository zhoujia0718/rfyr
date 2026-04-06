const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 初始化Express应用
const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 连接数据库
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('数据库连接成功'))
.catch(error => console.error('数据库连接失败:', error));

// 导入路由
const authRoutes = require('./routes/auth');
const membershipRoutes = require('./routes/membership');
const articleRoutes = require('./routes/articles');
const categoryRoutes = require('./routes/categories');

// 注册路由
app.use('/api/auth', authRoutes);
app.use('/api/membership', membershipRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/categories', categoryRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: '服务运行正常' });
});

// 启动服务器
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
