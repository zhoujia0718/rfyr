const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Membership = require('../models/Membership');
const jwt = require('jsonwebtoken');

// 微信登录
router.post('/wechat/login', async (req, res) => {
  try {
    const { openid, nickname, avatar } = req.body;

    // 查找或创建用户
    let user = await User.findOne({ openid });
    if (!user) {
      user = new User({ openid, nickname, avatar });
      await user.save();
    } else {
      // 更新用户信息
      user.nickname = nickname || user.nickname;
      user.avatar = avatar || user.avatar;
      await user.save();
    }

    // 生成JWT token
    const token = jwt.sign(
      { userId: user._id, openid: user.openid },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

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
      token,
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
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

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
