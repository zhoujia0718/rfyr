/**
 * 管理员权限中间件
 * 检查请求是否来自管理员用户
 */
const jwt = require('jsonwebtoken');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: '缺少token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 如果配置了 ADMIN_EMAILS，检查用户邮箱是否在白名单中
    if (ADMIN_EMAILS.length > 0) {
      const userEmail = decoded.email?.toLowerCase();
      if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
        return res.status(403).json({ success: false, message: '需要管理员权限' });
      }
    }

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: '无效或过期的token' });
    }
    console.error('Admin auth error:', error);
    res.status(500).json({ success: false, message: '权限验证失败' });
  }
};

module.exports = { requireAdmin, ADMIN_EMAILS };
