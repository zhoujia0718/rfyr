const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
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

// 获取文章列表
router.get('/', async (req, res) => {
  try {
    const { category, page = 1, limit = 10 } = req.query;
    const query = {
      isPublic: true
    };

    if (category) {
      query.category = category;
    }

    const total = await Article.countDocuments(query);
    const articles = await Article.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: articles,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get articles error:', error);
    res.status(500).json({ success: false, message: '获取文章列表失败' });
  }
});

// 获取文章详情（公开接口，无需认证）
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 参数验证：检查是否为有效的 MongoDB ObjectId 格式
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: '无效的文章ID格式' });
    }

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }

    // 使用 findOneAndUpdate 原子操作增加阅读量，避免竞态条件
    await Article.findOneAndUpdate(
      { _id: id },
      { $inc: { readCount: 1 } }
    );

    res.json({
      success: true,
      data: article
    });
  } catch (error) {
    console.error('Get article error:', error);
    res.status(500).json({ success: false, message: '获取文章详情失败' });
  }
});

// 创建文章（需要认证）
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, content, category, subCategory, author, requiresMembership, pdfUrl } = req.body;

    // 输入验证
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, message: '标题不能为空' });
    }
    if (title.trim().length > 500) {
      return res.status(400).json({ success: false, message: '标题长度不能超过500个字符' });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, message: '内容不能为空' });
    }
    if (content.length > 10000000) { // 10MB 文本限制
      return res.status(400).json({ success: false, message: '内容过长' });
    }
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({ success: false, message: '分类不能为空' });
    }
    if (pdfUrl && typeof pdfUrl === 'string' && pdfUrl.length > 2000) {
      return res.status(400).json({ success: false, message: 'PDF链接过长' });
    }

    const article = new Article({
      title: title.trim(),
      content: content,
      category: category.trim(),
      subCategory: subCategory?.trim() || undefined,
      author: author?.trim() || undefined,
      requiresMembership: Boolean(requiresMembership),
      pdfUrl: pdfUrl?.trim() || undefined
    });

    await article.save();

    res.json({
      success: true,
      data: article
    });
  } catch (error) {
    console.error('Create article error:', error);
    res.status(500).json({ success: false, message: '创建文章失败' });
  }
});

// 更新文章（需要认证）
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category, subCategory, author, requiresMembership, pdfUrl, isPublic } = req.body;

    // 参数验证
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: '无效的文章ID格式' });
    }

    // 输入验证
    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return res.status(400).json({ success: false, message: '标题不能为空' });
    }
    if (title !== undefined && title.trim().length > 500) {
      return res.status(400).json({ success: false, message: '标题长度不能超过500个字符' });
    }
    if (content !== undefined && typeof content !== 'string') {
      return res.status(400).json({ success: false, message: '内容格式错误' });
    }
    if (content !== undefined && content.length > 10000000) {
      return res.status(400).json({ success: false, message: '内容过长' });
    }
    if (pdfUrl !== undefined && typeof pdfUrl === 'string' && pdfUrl.length > 2000) {
      return res.status(400).json({ success: false, message: 'PDF链接过长' });
    }

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }

    // 更新文章（仅更新提供的字段）
    if (title !== undefined) article.title = title.trim();
    if (content !== undefined) article.content = content;
    if (category !== undefined) article.category = category.trim();
    if (subCategory !== undefined) article.subCategory = subCategory?.trim() || undefined;
    if (author !== undefined) article.author = author?.trim() || undefined;
    if (requiresMembership !== undefined) article.requiresMembership = Boolean(requiresMembership);
    if (pdfUrl !== undefined) article.pdfUrl = pdfUrl?.trim() || undefined;
    if (isPublic !== undefined) article.isPublic = Boolean(isPublic);

    await article.save();

    res.json({
      success: true,
      data: article
    });
  } catch (error) {
    console.error('Update article error:', error);
    res.status(500).json({ success: false, message: '更新文章失败' });
  }
});

// 删除文章（需要认证）
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // 参数验证
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: '无效的文章ID格式' });
    }

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }

    await article.deleteOne();

    res.json({
      success: true,
      message: '文章删除成功'
    });
  } catch (error) {
    console.error('Delete article error:', error);
    res.status(500).json({ success: false, message: '删除文章失败' });
  }
});

module.exports = router;
