const express = require('express');
const router = express.Router();
const Membership = require('../models/Membership');
const jwt = require('jsonwebtoken');

// 验证token的中间件
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: '缺少token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: '无效的token' });
  }
};

// 开通会员
router.post('/activate', authenticate, async (req, res) => {
  try {
    const { type, durationDays } = req.body;

    // 检查是否已经有活跃会员
    const existingMembership = await Membership.findOne({ userId: req.userId, isActive: true });
    if (existingMembership) {
      return res.status(400).json({ success: false, message: '您已经是会员' });
    }

    // 创建新会员
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + durationDays);

    const membership = new Membership({
      userId: req.userId,
      type,
      startDate,
      endDate,
      isActive: true
    });

    await membership.save();

    res.json({
      success: true,
      membership: {
        type: membership.type,
        startDate: membership.startDate,
        endDate: membership.endDate
      }
    });
  } catch (error) {
    console.error('Activate membership error:', error);
    res.status(500).json({ success: false, message: '开通会员失败' });
  }
});

// 续费会员
router.post('/renew', authenticate, async (req, res) => {
  try {
    const { type, durationDays } = req.body;

    // 查找现有会员
    let membership = await Membership.findOne({ userId: req.userId, isActive: true });
    const now = new Date();

    if (membership) {
      // 续期
      const currentEndDate = new Date(membership.endDate);
      const newEndDate = new Date(currentEndDate > now ? currentEndDate : now);
      newEndDate.setDate(newEndDate.getDate() + durationDays);

      membership.type = type;
      membership.endDate = newEndDate;
      await membership.save();
    } else {
      // 新开通
      const startDate = now;
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + durationDays);

      membership = new Membership({
        userId: req.userId,
        type,
        startDate,
        endDate,
        isActive: true
      });
      await membership.save();
    }

    res.json({
      success: true,
      membership: {
        type: membership.type,
        startDate: membership.startDate,
        endDate: membership.endDate
      }
    });
  } catch (error) {
    console.error('Renew membership error:', error);
    res.status(500).json({ success: false, message: '续费失败' });
  }
});

// 获取会员状态
router.get('/status', authenticate, async (req, res) => {
  try {
    const membership = await Membership.findOne({ userId: req.userId, isActive: true });
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
      membership: {
        type: membershipType,
        endDate: membershipEndDate
      }
    });
  } catch (error) {
    console.error('Get membership status error:', error);
    res.status(500).json({ success: false, message: '获取会员状态失败' });
  }
});

module.exports = router;
