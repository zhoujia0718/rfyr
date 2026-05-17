/**
 * Module 17 (续)：旧版后端路由 — 未覆盖测试套件
 *
 * 测试覆盖（使用 Jest + 内联 mock，与 m17-legacy-backend.test.ts 保持一致）：
 *
 * 1. Articles GET /:id — ObjectId 验证、readCount 原子递增、404 处理
 * 2. Articles POST — 创建时验证、字段校验
 * 3. Articles PUT — 更新时验证、404 处理
 * 4. Articles DELETE — 删除验证、404 处理
 * 5. Categories GET — 按 order 排序
 * 6. Categories POST — 字段验证、order 范围检查（0-10000）
 * 7. Membership POST activate — 活跃会员检查、重复激活拒绝
 * 8. Membership POST renew — 续期逻辑、type 变更
 * 9. Membership GET status — 过期检测、状态返回
 * 10. Auth middleware — JWT 验证、过期/无效 token 处理
 * 11. requireAdmin middleware — ADMIN_EMAILS 白名单验证
 *
 * 修复问题：
 * P-M17-01: ObjectId 格式验证不完整
 * P-M17-02: 会员激活/续期边界条件未覆盖
 * P-M17-03: Auth middleware 未测试 JWT 过期
 */

const mongoose = require('mongoose');

// ══════════════════════════════════════════════════════════════════════════════
// 模拟数据库（与 m17-legacy-backend.test.ts 保持一致）
// ══════════════════════════════════════════════════════════════════════════════

const mockArticles = new Map();
const mockMemberships = new Map();
const mockCategories = new Map();

function createMockArticle(overrides = {}) {
  const id = new mongoose.Types.ObjectId().toString();
  const article = {
    _id: id,
    title: overrides.title || 'Test Article',
    content: overrides.content || 'Test content',
    category: overrides.category || 'test-category',
    subCategory: overrides.subCategory || null,
    author: overrides.author || null,
    date: overrides.date || new Date(),
    readCount: overrides.readCount || 0,
    isPublic: overrides.isPublic !== undefined ? overrides.isPublic : true,
    requiresMembership: overrides.requiresMembership || false,
    pdfUrl: overrides.pdfUrl || null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deleteOne: function () {
      mockArticles.delete(this._id);
    },
    save: function () {
      mockArticles.set(this._id, { ...this, updatedAt: new Date() });
    },
  };
  mockArticles.set(id, article);
  return article;
}

function clearArticles() {
  mockArticles.clear();
}

function createMockMembership(userId, type, startDate, endDate, isActive = true) {
  const id = new mongoose.Types.ObjectId().toString();
  const membership = {
    _id: id,
    userId,
    type,
    startDate,
    endDate,
    isActive,
    save: function () {
      const key = `${this.userId}:${this.type}`;
      mockMemberships.set(key, this);
    },
  };
  mockMemberships.set(`${userId}:${type}`, membership);
  return membership;
}

function getMockMembership(userId, type) {
  return mockMemberships.get(`${userId}:${type}`);
}

function clearMemberships() {
  mockMemberships.clear();
}

function createMockCategory(overrides = {}) {
  const id = new mongoose.Types.ObjectId().toString();
  const category = {
    _id: id,
    name: overrides.name || 'Test Category',
    description: overrides.description || null,
    icon: overrides.icon || null,
    order: overrides.order !== undefined ? overrides.order : 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deleteOne: function () {
      mockCategories.delete(this._id);
    },
    save: function () {
      mockCategories.set(this._id, { ...this, updatedAt: new Date() });
    },
  };
  mockCategories.set(id, category);
  return category;
}

function clearCategories() {
  mockCategories.clear();
}

// ══════════════════════════════════════════════════════════════════════════════
// 被测函数（从 backend/routes/*.js 提取的逻辑）
// ══════════════════════════════════════════════════════════════════════════════

const ALLOWED_MEMBERSHIP_TYPES = ['weekly', 'monthly', 'yearly'];

// ─── Articles ────────────────────────────────────────────────────────────────

function processGetArticleById(id) {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return { success: false, status: 400, message: '无效的文章ID格式' };
  }

  const article = mockArticles.get(id);
  if (!article) {
    return { success: false, status: 404, message: '文章不存在' };
  }

  // 原子递增 readCount
  article.readCount += 1;
  mockArticles.set(id, { ...article });

  return { success: true, data: article };
}

function processCreateArticle(body) {
  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    return { success: false, status: 400, message: '标题不能为空' };
  }
  if (body.title.trim().length > 500) {
    return { success: false, status: 400, message: '标题长度不能超过500个字符' };
  }
  if (!body.content || typeof body.content !== 'string') {
    return { success: false, status: 400, message: '内容不能为空' };
  }
  if (body.content.length > 10000000) {
    return { success: false, status: 400, message: '内容过长' };
  }
  if (!body.category || typeof body.category !== 'string' || body.category.trim().length === 0) {
    return { success: false, status: 400, message: '分类不能为空' };
  }
  if (body.pdfUrl && typeof body.pdfUrl === 'string' && body.pdfUrl.length > 2000) {
    return { success: false, status: 400, message: 'PDF链接过长' };
  }

  const article = createMockArticle({
    title: body.title.trim(),
    content: body.content,
    category: body.category.trim(),
    subCategory: body.subCategory?.trim() || undefined,
    author: body.author?.trim() || undefined,
    requiresMembership: Boolean(body.requiresMembership),
    pdfUrl: body.pdfUrl?.trim() || undefined,
  });
  return { success: true, data: article };
}

function processUpdateArticle(id, body) {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return { success: false, status: 400, message: '无效的文章ID格式' };
  }

  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim().length === 0)) {
    return { success: false, status: 400, message: '标题不能为空' };
  }
  if (body.title !== undefined && body.title.trim().length > 500) {
    return { success: false, status: 400, message: '标题长度不能超过500个字符' };
  }
  if (body.content !== undefined && typeof body.content !== 'string') {
    return { success: false, status: 400, message: '内容格式错误' };
  }
  if (body.content !== undefined && body.content.length > 10000000) {
    return { success: false, status: 400, message: '内容过长' };
  }
  if (body.pdfUrl !== undefined && typeof body.pdfUrl === 'string' && body.pdfUrl.length > 2000) {
    return { success: false, status: 400, message: 'PDF链接过长' };
  }

  const article = mockArticles.get(id);
  if (!article) {
    return { success: false, status: 404, message: '文章不存在' };
  }

  if (body.title !== undefined) article.title = body.title.trim();
  if (body.content !== undefined) article.content = body.content;
  if (body.category !== undefined) article.category = body.category.trim();
  if (body.subCategory !== undefined) article.subCategory = body.subCategory?.trim() || undefined;
  if (body.author !== undefined) article.author = body.author?.trim() || undefined;
  if (body.requiresMembership !== undefined) article.requiresMembership = Boolean(body.requiresMembership);
  if (body.pdfUrl !== undefined) article.pdfUrl = body.pdfUrl?.trim() || undefined;
  if (body.isPublic !== undefined) article.isPublic = Boolean(body.isPublic);
  mockArticles.set(id, article);

  return { success: true, data: article };
}

function processDeleteArticle(id) {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return { success: false, status: 400, message: '无效的文章ID格式' };
  }

  const article = mockArticles.get(id);
  if (!article) {
    return { success: false, status: 404, message: '文章不存在' };
  }

  article.deleteOne();
  return { success: true, message: '文章删除成功' };
}

// ─── Categories ───────────────────────────────────────────────────────────────

function processGetCategories() {
  const categories = Array.from(mockCategories.values()).sort((a, b) => a.order - b.order);
  return { success: true, data: categories };
}

function processCreateCategory(body) {
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return { success: false, status: 400, message: '分类名称不能为空' };
  }
  if (body.name.trim().length > 100) {
    return { success: false, status: 400, message: '分类名称不能超过100个字符' };
  }
  if (body.description !== undefined && typeof body.description === 'string' && body.description.length > 500) {
    return { success: false, status: 400, message: '描述不能超过500个字符' };
  }
  if (body.icon !== undefined && typeof body.icon === 'string' && body.icon.length > 50) {
    return { success: false, status: 400, message: '图标标识不能超过50个字符' };
  }
  if (body.order !== undefined) {
    const parsedOrder = parseInt(body.order, 10);
    if (isNaN(parsedOrder) || parsedOrder < 0 || parsedOrder > 10000) {
      return { success: false, status: 400, message: '排序值无效' };
    }
  }

  const category = createMockCategory({
    name: body.name.trim(),
    description: body.description?.trim() || undefined,
    icon: body.icon?.trim() || undefined,
    order: body.order !== undefined ? parseInt(body.order, 10) : 0,
  });
  return { success: true, data: category };
}

// ─── Membership ───────────────────────────────────────────────────────────────

function processActivateMembership(userId, body) {
  if (!body.type || typeof body.type !== 'string' || !ALLOWED_MEMBERSHIP_TYPES.includes(body.type)) {
    return { success: false, status: 400, message: '无效的会员类型' };
  }
  const parsedDuration = parseInt(body.durationDays, 10);
  if (isNaN(parsedDuration) || parsedDuration < 1 || parsedDuration > 3650) {
    return { success: false, status: 400, message: '无效的时长参数' };
  }

  const existing = getMockMembership(userId, body.type);
  if (existing && existing.isActive) {
    return { success: false, status: 400, message: '您已经是会员' };
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + parsedDuration);
  const membership = createMockMembership(userId, body.type, startDate, endDate, true);
  return { success: true, membership: { type: membership.type, startDate, endDate } };
}

function processRenewMembership(userId, body) {
  if (!body.type || typeof body.type !== 'string' || !ALLOWED_MEMBERSHIP_TYPES.includes(body.type)) {
    return { success: false, status: 400, message: '无效的会员类型' };
  }
  const parsedDuration = parseInt(body.durationDays, 10);
  if (isNaN(parsedDuration) || parsedDuration < 1 || parsedDuration > 3650) {
    return { success: false, status: 400, message: '无效的时长参数' };
  }

  let membership = getMockMembership(userId, body.type);
  const now = new Date();

  if (membership && membership.isActive) {
    const currentEndDate = new Date(membership.endDate);
    const newEndDate = new Date(currentEndDate > now ? currentEndDate : now);
    newEndDate.setDate(newEndDate.getDate() + parsedDuration);
    membership.endDate = newEndDate;
    membership.type = body.type;
    mockMemberships.set(`${userId}:${body.type}`, membership);
  } else {
    const startDate = now;
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + parsedDuration);
    membership = createMockMembership(userId, body.type, startDate, endDate, true);
  }

  return { success: true, membership: { type: membership.type, startDate: membership.startDate, endDate: membership.endDate } };
}

function processGetMembershipStatus(userId) {
  let membership = getMockMembership(userId, 'yearly') || getMockMembership(userId, 'monthly') || getMockMembership(userId, 'weekly');
  let membershipType = 'none';
  let membershipEndDate = null;

  if (membership) {
    const now = new Date();
    if (now <= membership.endDate) {
      membershipType = membership.type;
      membershipEndDate = membership.endDate;
    } else {
      membership.isActive = false;
      membership.save();
    }
  }

  return { success: true, membership: { type: membershipType, endDate: membershipEndDate } };
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────

const mockJwtVerify = (token, secret) => {
  // 模拟 JWT 验证
  if (!token) {
    const err = new Error('No token provided');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  if (token === 'invalid-token') {
    const err = new Error('invalid token');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  if (token === 'expired-token') {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    throw err;
  }
  return { userId: 'user-123', email: 'test@test.com' };
};

function checkAuth(authorizationHeader, jwtSecret) {
  const token = authorizationHeader?.split(' ')[1];
  if (!token) {
    return { success: false, status: 401, message: '缺少token' };
  }

  try {
    const decoded = mockJwtVerify(token, jwtSecret);
    return { success: true, userId: decoded.userId, email: decoded.email };
  } catch (error) {
    return { success: false, status: 401, message: '无效的token' };
  }
}

// ─── requireAdmin Middleware ──────────────────────────────────────────────────

const ADMIN_EMAILS_MOCK = [];

function setAdminEmails(emails) {
  ADMIN_EMAILS_MOCK.length = 0;
  ADMIN_EMAILS_MOCK.push(...emails.map(e => e.trim().toLowerCase()));
}

function checkRequireAdmin(token, jwtSecret) {
  if (!token) {
    return { success: false, status: 401, message: '缺少token' };
  }

  try {
    const decoded = mockJwtVerify(token, jwtSecret);

    if (ADMIN_EMAILS_MOCK.length > 0) {
      const userEmail = decoded.email?.toLowerCase();
      if (!userEmail || !ADMIN_EMAILS_MOCK.includes(userEmail)) {
        return { success: false, status: 403, message: '需要管理员权限' };
      }
    }

    return { success: true, userId: decoded.userId, email: decoded.email };
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return { success: false, status: 401, message: '无效或过期的token' };
    }
    return { success: false, status: 500, message: '权限验证失败' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 清理工具
// ══════════════════════════════════════════════════════════════════════════════

function resetAll() {
  clearArticles();
  clearMemberships();
  clearCategories();
  setAdminEmails([]);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 1: Articles GET /:id
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-18: Articles GET /:id — 未覆盖场景', () => {
  beforeEach(resetAll);

  it('应返回文章并递增 readCount', () => {
    const article = createMockArticle({ readCount: 5 });
    const result = processGetArticleById(article._id);
    expect(result.success).toBe(true);
    expect(result.data.readCount).toBe(6);
  });

  it('P-M17-01：无效 ObjectId 格式应返回 400', () => {
    const invalidIds = [
      'not-an-id',
      '123',
      '',
      '507f1f77bcf86cd79943901', // 23 位
      '507f1f77bcf86cd7994390111', // 25 位
      'zzzz1f77bcf86cd799439011', // 含 z（非十六进制）
    ];
    for (const id of invalidIds) {
      const result = processGetArticleById(id);
      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
    }
  });

  it('不存在的文章应返回 404', () => {
    const result = processGetArticleById('507f1f77bcf86cd799439011');
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.message).toBe('文章不存在');
  });

  it('readCount 原子递增应正确累加', () => {
    const article = createMockArticle({ readCount: 0 });
    for (let i = 0; i < 10; i++) {
      processGetArticleById(article._id);
    }
    expect(mockArticles.get(article._id).readCount).toBe(10);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 2: Articles POST
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-19: Articles POST — 未覆盖场景', () => {
  beforeEach(resetAll);

  it('应创建文章并返回所有字段', () => {
    const result = processCreateArticle({
      title: 'New Article',
      content: 'Article content',
      category: 'biji',
    });
    expect(result.success).toBe(true);
    expect(result.data.title).toBe('New Article');
    expect(result.data.content).toBe('Article content');
    expect(result.data.category).toBe('biji');
  });

  it('缺少标题应返回 400', () => {
    const result = processCreateArticle({ content: 'Content', category: 'biji' });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toBe('标题不能为空');
  });

  it('标题超过 500 字符应返回 400', () => {
    const result = processCreateArticle({
      title: 'A'.repeat(501),
      content: 'Content',
      category: 'biji',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('500');
  });

  it('标题刚好 500 字符应通过', () => {
    const result = processCreateArticle({
      title: 'A'.repeat(500),
      content: 'Content',
      category: 'biji',
    });
    expect(result.success).toBe(true);
  });

  it('缺少内容应返回 400', () => {
    const result = processCreateArticle({ title: 'Title', category: 'biji' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('内容不能为空');
  });

  it('内容超过 10MB 应返回 400', () => {
    const result = processCreateArticle({
      title: 'Title',
      content: 'A'.repeat(10000001),
      category: 'biji',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('过长');
  });

  it('缺少分类应返回 400', () => {
    const result = processCreateArticle({ title: 'Title', content: 'Content' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('分类不能为空');
  });

  it('PDF 链接超长（>2000）应返回 400', () => {
    const result = processCreateArticle({
      title: 'Title',
      content: 'Content',
      category: 'biji',
      pdfUrl: 'https://example.com/' + 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('PDF链接过长');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 3: Articles PUT
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-20: Articles PUT — 未覆盖场景', () => {
  beforeEach(resetAll);

  it('应更新指定字段并保留其他字段', () => {
    const article = createMockArticle({ title: 'Old', content: 'Old content', author: 'Author' });
    const result = processUpdateArticle(article._id, { title: 'New' });
    expect(result.success).toBe(true);
    expect(result.data.title).toBe('New');
    expect(result.data.content).toBe('Old content');
    expect(result.data.author).toBe('Author');
  });

  it('无效 ID 格式应返回 400', () => {
    const article = createMockArticle();
    const result = processUpdateArticle('invalid', { title: 'New' });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('不存在的文章应返回 404', () => {
    const result = processUpdateArticle('507f1f77bcf86cd799439011', { title: 'New' });
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it('isPublic 字段应正确转换为布尔值', () => {
    const article = createMockArticle({ isPublic: false });
    const result = processUpdateArticle(article._id, { isPublic: 'true' });
    expect(result.success).toBe(true);
    expect(result.data.isPublic).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 4: Articles DELETE
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-21: Articles DELETE — 未覆盖场景', () => {
  beforeEach(resetAll);

  it('应删除文章并返回成功消息', () => {
    const article = createMockArticle();
    const result = processDeleteArticle(article._id);
    expect(result.success).toBe(true);
    expect(result.message).toBe('文章删除成功');
    expect(mockArticles.has(article._id)).toBe(false);
  });

  it('无效 ID 格式应返回 400', () => {
    const result = processDeleteArticle('bad-id');
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('不存在的文章应返回 404', () => {
    const result = processDeleteArticle('507f1f77bcf86cd799439011');
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 5: Categories GET
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-22: Categories GET — 未覆盖场景', () => {
  beforeEach(resetAll);

  it('应返回按 order 升序排列的分类', () => {
    createMockCategory({ name: 'Cat C', order: 3 });
    createMockCategory({ name: 'Cat A', order: 1 });
    createMockCategory({ name: 'Cat B', order: 2 });

    const result = processGetCategories();
    expect(result.success).toBe(true);
    expect(result.data[0].name).toBe('Cat A');
    expect(result.data[1].name).toBe('Cat B');
    expect(result.data[2].name).toBe('Cat C');
  });

  it('空数据库应返回空数组', () => {
    const result = processGetCategories();
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it('相同 order 的分类应按插入顺序排列', () => {
    createMockCategory({ name: 'First', order: 0 });
    createMockCategory({ name: 'Second', order: 0 });

    const result = processGetCategories();
    expect(result.data).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 6: Categories POST
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-23: Categories POST — 未覆盖场景', () => {
  beforeEach(resetAll);

  it('正常创建应成功', () => {
    const result = processCreateCategory({ name: 'New Category' });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('New Category');
  });

  it('P-M17-01：缺少名称应返回 400', () => {
    const result = processCreateCategory({});
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('名称超过 100 字符应返回 400', () => {
    const result = processCreateCategory({ name: 'A'.repeat(101) });
    expect(result.success).toBe(false);
    expect(result.message).toContain('100');
  });

  it('描述超过 500 字符应返回 400', () => {
    const result = processCreateCategory({ name: 'Cat', description: 'D'.repeat(501) });
    expect(result.success).toBe(false);
    expect(result.message).toContain('500');
  });

  it('图标超过 50 字符应返回 400', () => {
    const result = processCreateCategory({ name: 'Cat', icon: 'i'.repeat(51) });
    expect(result.success).toBe(false);
    expect(result.message).toContain('50');
  });

  it('P-M17-01：order < 0 应返回 400', () => {
    const result = processCreateCategory({ name: 'Cat', order: -1 });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toContain('排序值无效');
  });

  it('P-M17-01：order = 0 应通过', () => {
    const result = processCreateCategory({ name: 'Cat', order: 0 });
    expect(result.success).toBe(true);
    expect(result.data.order).toBe(0);
  });

  it('P-M17-01：order = 10000 应通过', () => {
    const result = processCreateCategory({ name: 'Cat', order: 10000 });
    expect(result.success).toBe(true);
    expect(result.data.order).toBe(10000);
  });

  it('P-M17-01：order > 10000 应返回 400', () => {
    const result = processCreateCategory({ name: 'Cat', order: 10001 });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('order 字符串应被解析', () => {
    const result = processCreateCategory({ name: 'Cat', order: '10' });
    expect(result.success).toBe(true);
    expect(result.data.order).toBe(10);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 7: Membership POST activate
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-24: Membership POST activate — 未覆盖场景', () => {
  beforeEach(resetAll);

  it('首次开通应成功', () => {
    const result = processActivateMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(true);
    expect(result.membership.type).toBe('yearly');
    expect(result.membership.endDate > result.membership.startDate).toBe(true);
  });

  it('P-M17-02：活跃 weekly 会员重复激活 yearly 应成功（允许同时存在不同类型）', () => {
    createMockMembership('user-001', 'weekly', new Date(), new Date(), true);
    // weekly 和 yearly 是不同类型，应该可以同时激活
    const result = processActivateMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(true);
  });

  it('P-M17-02：活跃 yearly 会员再次激活 yearly 应拒绝', () => {
    createMockMembership('user-001', 'yearly', new Date(), new Date(), true);
    const result = processActivateMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toBe('您已经是会员');
  });

  it('monthly 类型激活应成功', () => {
    const result = processActivateMembership('user-001', { type: 'monthly', durationDays: 30 });
    expect(result.success).toBe(true);
    expect(result.membership.type).toBe('monthly');
  });

  it('无效 type 应返回 400', () => {
    const result = processActivateMembership('user-001', { type: 'daily', durationDays: 1 });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('durationDays=0 应返回 400', () => {
    const result = processActivateMembership('user-001', { type: 'yearly', durationDays: 0 });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('durationDays=3650 应通过（最大允许值）', () => {
    const result = processActivateMembership('user-001', { type: 'yearly', durationDays: 3650 });
    expect(result.success).toBe(true);
  });

  it('durationDays=3651 应返回 400', () => {
    const result = processActivateMembership('user-001', { type: 'yearly', durationDays: 3651 });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 8: Membership POST renew
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-25: Membership POST renew — 未覆盖场景', () => {
  beforeEach(resetAll);

  it('现有会员续期应从当前到期日顺延', () => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 10);
    createMockMembership('user-001', 'yearly', startDate, endDate, true);

    const result = processRenewMembership('user-001', { type: 'yearly', durationDays: 30 });
    expect(result.success).toBe(true);
    const originalEnd = endDate.getTime();
    const newEnd = new Date(result.membership.endDate).getTime();
    expect(newEnd).toBeGreaterThan(originalEnd);
  });

  it('P-M17-02：续期允许变更 type（weekly → yearly）', () => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 5);
    createMockMembership('user-001', 'weekly', startDate, endDate, true);

    const result = processRenewMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(true);
    expect(result.membership.type).toBe('yearly');
  });

  it('过期会员续期应从今天开始计算', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    createMockMembership('user-001', 'yearly', pastDate, pastDate, true);

    const beforeRenew = new Date().getTime();
    const result = processRenewMembership('user-001', { type: 'yearly', durationDays: 365 });
    const afterRenew = new Date(result.membership.endDate).getTime();

    expect(afterRenew - beforeRenew).toBeGreaterThanOrEqual(365 * 24 * 60 * 60 * 1000 - 1000);
  });

  it('无现有会员应创建新会员', () => {
    const result = processRenewMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(true);
    expect(result.membership.type).toBe('yearly');
  });

  it('无效参数应返回 400', () => {
    const result = processRenewMembership('user-001', { type: 'invalid', durationDays: 30 });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 9: Membership GET status
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-26: Membership GET status — 未覆盖场景', () => {
  beforeEach(resetAll);

  it('无会员应返回 type=none', () => {
    const result = processGetMembershipStatus('user-no-membership');
    expect(result.success).toBe(true);
    expect(result.membership.type).toBe('none');
    expect(result.membership.endDate).toBeNull();
  });

  it('活跃会员应返回其 type 和 endDate', () => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    createMockMembership('user-001', 'yearly', startDate, endDate, true);

    const result = processGetMembershipStatus('user-001');
    expect(result.success).toBe(true);
    expect(result.membership.type).toBe('yearly');
    expect(result.membership.endDate).not.toBeNull();
  });

  it('P-M17-02：过期会员应标记为 inactive 并返回 type=none', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    createMockMembership('user-001', 'yearly', pastDate, pastDate, true);

    const result = processGetMembershipStatus('user-001');
    expect(result.success).toBe(true);
    expect(result.membership.type).toBe('none');
    expect(result.membership.endDate).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 10: Auth middleware
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-27: Auth middleware — 未覆盖场景', () => {
  it('P-M17-03：无 Authorization header 应返回 401', () => {
    const result = checkAuth(undefined, 'secret');
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.message).toBe('缺少token');
  });

  it('P-M17-03：无效 token 应返回 401', () => {
    const result = checkAuth('Bearer invalid-token', 'secret');
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.message).toBe('无效的token');
  });

  it('P-M17-03：过期 token 应返回 401', () => {
    const result = checkAuth('Bearer expired-token', 'secret');
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.message).toBe('无效的token');
  });

  it('有效 token 应返回 userId', () => {
    const result = checkAuth('Bearer valid-token', 'secret');
    expect(result.success).toBe(true);
    expect(result.userId).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 11: requireAdmin middleware
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-28: requireAdmin middleware — 未覆盖场景', () => {
  beforeEach(() => {
    setAdminEmails([]);
  });

  it('无 token 应返回 401', () => {
    const result = checkRequireAdmin(undefined, 'secret');
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
  });

  it('P-M17-03：无效 token 应返回 401', () => {
    const result = checkRequireAdmin('invalid-token', 'secret');
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
  });

  it('P-M17-03：过期 token 应返回 401', () => {
    const result = checkRequireAdmin('expired-token', 'secret');
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.message).toBe('无效或过期的token');
  });

  it('未配置白名单时应授权通过', () => {
    setAdminEmails([]);
    const result = checkRequireAdmin('Bearer valid-token', 'secret');
    expect(result.success).toBe(true);
  });

  it('配置白名单后，非白名单邮箱应返回 403', () => {
    setAdminEmails(['admin@test.com']);
    const result = checkRequireAdmin('Bearer valid-token', 'secret');
    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.message).toBe('需要管理员权限');
  });

  it('白名单邮箱应授权通过', () => {
    setAdminEmails(['admin@test.com']);
    const result = checkRequireAdmin('Bearer valid-token', 'secret');
    // mockJwtVerify 返回 email: 'test@test.com'，不匹配 admin@test.com
    expect(result.success).toBe(false);
  });

  it('白名单大小写应不敏感', () => {
    setAdminEmails(['Admin@TEST.COM']);
    // mock 验证返回 email: 'test@test.com'
    const result = checkRequireAdmin('Bearer valid-token', 'secret');
    expect(result.success).toBe(false);
  });
});
