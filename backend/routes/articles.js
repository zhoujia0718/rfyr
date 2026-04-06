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

// 获取文章详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }

    // 增加阅读量
    article.readCount += 1;
    await article.save();

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

    const article = new Article({
      title,
      content,
      category,
      subCategory,
      author,
      requiresMembership,
      pdfUrl
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

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }

    // 更新文章
    article.title = title || article.title;
    article.content = content || article.content;
    article.category = category || article.category;
    article.subCategory = subCategory || article.subCategory;
    article.author = author || article.author;
    article.requiresMembership = requiresMembership !== undefined ? requiresMembership : article.requiresMembership;
    article.pdfUrl = pdfUrl || article.pdfUrl;
    article.isPublic = isPublic !== undefined ? isPublic : article.isPublic;

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
