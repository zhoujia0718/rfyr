const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
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

// 获取分类列表
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ order: 1 });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: '获取分类列表失败' });
  }
});

// 创建分类（需要认证）
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, icon, order } = req.body;

    // 输入验证
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, message: '分类名称不能为空' });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ success: false, message: '分类名称不能超过100个字符' });
    }
    if (description !== undefined && typeof description === 'string' && description.length > 500) {
      return res.status(400).json({ success: false, message: '描述不能超过500个字符' });
    }
    if (icon !== undefined && typeof icon === 'string' && icon.length > 50) {
      return res.status(400).json({ success: false, message: '图标标识不能超过50个字符' });
    }
    if (order !== undefined) {
      const parsedOrder = parseInt(order, 10);
      if (isNaN(parsedOrder) || parsedOrder < 0 || parsedOrder > 10000) {
        return res.status(400).json({ success: false, message: '排序值无效' });
      }
    }

    const category = new Category({
      name: name.trim(),
      description: description?.trim() || undefined,
      icon: icon?.trim() || undefined,
      order: order !== undefined ? parseInt(order, 10) : 0
    });

    await category.save();

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, message: '创建分类失败' });
  }
});

// 更新分类（需要认证）
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, order } = req.body;

    // 参数验证
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: '无效的分类ID格式' });
    }
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return res.status(400).json({ success: false, message: '分类名称不能为空' });
    }
    if (name !== undefined && name.trim().length > 100) {
      return res.status(400).json({ success: false, message: '分类名称不能超过100个字符' });
    }
    if (description !== undefined && typeof description === 'string' && description.length > 500) {
      return res.status(400).json({ success: false, message: '描述不能超过500个字符' });
    }
    if (icon !== undefined && typeof icon === 'string' && icon.length > 50) {
      return res.status(400).json({ success: false, message: '图标标识不能超过50个字符' });
    }
    if (order !== undefined) {
      const parsedOrder = parseInt(order, 10);
      if (isNaN(parsedOrder) || parsedOrder < 0 || parsedOrder > 10000) {
        return res.status(400).json({ success: false, message: '排序值无效' });
      }
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: '分类不存在' });
    }

    // 更新分类
    if (name !== undefined) category.name = name.trim();
    if (description !== undefined) category.description = description?.trim() || undefined;
    if (icon !== undefined) category.icon = icon?.trim() || undefined;
    if (order !== undefined) category.order = parseInt(order, 10);

    await category.save();

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ success: false, message: '更新分类失败' });
  }
});

// 删除分类（需要认证）
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // 参数验证
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: '无效的分类ID格式' });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: '分类不存在' });
    }

    await category.deleteOne();

    res.json({
      success: true,
      message: '分类删除成功'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, message: '删除分类失败' });
  }
});

module.exports = router;
