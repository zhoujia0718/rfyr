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

    const category = new Category({
      name,
      description,
      icon,
      order
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

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: '分类不存在' });
    }

    // 更新分类
    category.name = name || category.name;
    category.description = description || category.description;
    category.icon = icon || category.icon;
    category.order = order !== undefined ? order : category.order;

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
