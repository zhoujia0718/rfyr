const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Membership = require('../models/Membership');
const jwt = require('jsonwebtoken');

// 验证token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: '缺少token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    // 检查会员状态
    const membership = await Membership.findOne({ userId: user._id, isActive: true });
    let membershipType = 'none';
    let membershipEndDate = null;

    if (membership) {
      const now = new Date();
      if (now <= membership.endDate) {
        membershipType = membership.type;
        membershipEndDate = membership.endDate;
      } else {
        // 会员已过期
        membership.isActive = false;
        await membership.save();
      }
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        nickname: user.nickname,
        avatar: user.avatar
      },
      membership: {
        type: membershipType,
        endDate: membershipEndDate
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(401).json({ success: false, message: '无效的token' });
  }
});

module.exports = router;
