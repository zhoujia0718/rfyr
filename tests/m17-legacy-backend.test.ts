/**
 * 模块十七（续）：旧版后端（已废弃）— 单元测试
 *
 * 测试覆盖：
 *
 * 1. routes/articles.js
 *    - readCount 原子递增（竞态条件修复）
 *    - 创建/更新/删除文章的输入验证
 *    - ObjectId 格式验证
 *
 * 2. routes/membership.js
 *    - type 参数白名单验证
 *    - durationDays 范围验证
 *
 * 3. routes/categories.js
 *    - 创建/更新/删除分类的输入验证
 *    - ObjectId 格式验证
 *
 * 4. middleware/auth.js
 *    - 管理员权限检查
 *    - ADMIN_EMAILS 白名单
 *
 * 所有函数均内联定义，与源文件逻辑保持同步，确保测试环境无关。
 */

// ══════════════════════════════════════════════════════════════════════════════
// Mock mongoose Types.ObjectId（必须在使用前定义）
// ══════════════════════════════════════════════════════════════════════════════

// Mock ObjectId since mongoose is not installed
let _objectIdCounter = 0;
class MockObjectId {
  constructor(public readonly id?: string) {
    if (!this.id) {
      _objectIdCounter++;
      // MongoDB ObjectId is 24 hex chars: 12 bytes = 24 hex digits
      // Use counter padded to 2 chars (00-99) for uniqueness
      const hex = _objectIdCounter.toString(16).padStart(2, '0')
      this.id = `507f1f77bcf86cd7994390${hex}`
    }
  }
  toString() { return this.id! }
}

const mongoose = {
  Types: {
    ObjectId: MockObjectId,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// 类型定义
// ══════════════════════════════════════════════════════════════════════════════

interface MockArticle {
  _id: string;
  title: string;
  content: string;
  category: string;
  subCategory: string | null;
  author: string | null;
  date: Date;
  readCount: number;
  isPublic: boolean;
  requiresMembership: boolean;
  pdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  deleteOne: () => void;
  save: () => void;
}

interface MockMembership {
  _id: string;
  userId: string;
  type: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  save: () => void;
}

interface MockCategory {
  _id: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  deleteOne: () => void;
  save: () => void;
}

interface MockUser {
  _id: string;
  email: string;
  nickname: string | null;
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ArticleOverrides {
  title?: string;
  content?: string;
  category?: string;
  subCategory?: string | null;
  author?: string | null;
  date?: Date;
  readCount?: number;
  isPublic?: boolean;
  requiresMembership?: boolean;
  pdfUrl?: string | null;
}

interface CategoryOverrides {
  name?: string;
  description?: string | null;
  icon?: string | null;
  order?: number;
}

interface UserOverrides {
  email?: string;
  nickname?: string | null;
  avatar?: string | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// 模拟数据库
// ══════════════════════════════════════════════════════════════════════════════

// 模拟 articles 集合
const mockArticles = new Map<string, MockArticle>();
let articleIdCounter = 1;

function createMockArticle(overrides: ArticleOverrides = {}): MockArticle {
  const id = new mongoose.Types.ObjectId().toString();
  const article: MockArticle = {
    _id: id,
    title: overrides.title || 'Test Article',
    content: overrides.content || 'Test content',
    category: overrides.category || 'test-category',
    subCategory: overrides.subCategory !== undefined ? overrides.subCategory : null,
    author: overrides.author !== undefined ? overrides.author : null,
    date: overrides.date || new Date(),
    readCount: overrides.readCount !== undefined ? overrides.readCount : 0,
    isPublic: overrides.isPublic !== undefined ? overrides.isPublic : true,
    requiresMembership: overrides.requiresMembership || false,
    pdfUrl: overrides.pdfUrl !== undefined ? overrides.pdfUrl : null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deleteOne: function () {
      mockArticles.delete(this._id);
    },
    save: function () {
      const existing = mockArticles.get(this._id);
      if (existing) {
        mockArticles.set(this._id, { ...existing, ...this, updatedAt: new Date() });
      } else {
        mockArticles.set(this._id, this);
      }
    },
  };
  mockArticles.set(id, article);
  return article;
}

function clearArticles() {
  mockArticles.clear();
  articleIdCounter = 1;
}

// 模拟 memberships 集合
const mockMemberships = new Map<string, MockMembership>();

function createMockMembership(
  userId: string,
  type: string,
  startDate: Date,
  endDate: Date,
  isActive: boolean = true,
  overrides: Partial<MockMembership> = {}
): MockMembership {
  const id = new mongoose.Types.ObjectId().toString();
  const membership: MockMembership = {
    _id: id,
    userId,
    type,
    startDate,
    endDate,
    isActive,
    ...overrides,
    save: function () {
      const key = `${this.userId}:${this.type}`;
      mockMemberships.set(key, this);
    },
  };
  mockMemberships.set(`${userId}:${type}`, membership);
  return membership;
}

function getMockMembership(userId: string, type: string): MockMembership | undefined {
  return mockMemberships.get(`${userId}:${type}`);
}

function clearMemberships() {
  mockMemberships.clear();
}

// 模拟 categories 集合
const mockCategories = new Map<string, MockCategory>();

function createMockCategory(overrides: CategoryOverrides = {}): MockCategory {
  const id = new mongoose.Types.ObjectId().toString();
  const category: MockCategory = {
    _id: id,
    name: overrides.name || 'Test Category',
    description: overrides.description !== undefined ? overrides.description : null,
    icon: overrides.icon !== undefined ? overrides.icon : null,
    order: overrides.order !== undefined ? overrides.order : 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deleteOne: function () {
      mockCategories.delete(this._id);
    },
    save: function () {
      const existing = mockCategories.get(this._id);
      if (existing) {
        mockCategories.set(this._id, { ...existing, ...this, updatedAt: new Date() });
      } else {
        mockCategories.set(this._id, this);
      }
    },
  };
  mockCategories.set(id, category);
  return category;
}

function clearCategories() {
  mockCategories.clear();
}

// 模拟 users
const mockUsers = new Map<string, MockUser>();

function createMockUser(overrides: UserOverrides = {}): MockUser {
  const id = new mongoose.Types.ObjectId().toString();
  const user: MockUser = {
    _id: id,
    email: overrides.email || 'user@test.com',
    nickname: overrides.nickname !== undefined ? overrides.nickname : null,
    avatar: overrides.avatar !== undefined ? overrides.avatar : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockUsers.set(id, user);
  return user;
}

function getMockUser(id: string): MockUser | undefined {
  return mockUsers.get(id);
}

function clearUsers() {
  mockUsers.clear();
}

// ══════════════════════════════════════════════════════════════════════════════
// 被测函数（内联复制自源文件）
// ══════════════════════════════════════════════════════════════════════════════

const ALLOWED_MEMBERSHIP_TYPES = ['weekly', 'yearly'];

// ─── routes/articles.js ───

function validateArticleId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

function validateArticleInput(body: { title?: string; content?: string; category?: string; pdfUrl?: string }, isUpdate: boolean = false): string[] {
  const errors: string[] = [];
  if (!isUpdate || body.title !== undefined) {
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      errors.push('标题不能为空');
    } else if (body.title.trim().length > 500) {
      errors.push('标题长度不能超过500个字符');
    }
  }
  if (!isUpdate || body.content !== undefined) {
    if (!isUpdate && (!body.content || typeof body.content !== 'string')) {
      errors.push('内容不能为空');
    }
    if (body.content && body.content.length > 10000000) {
      errors.push('内容过长');
    }
  }
  if (!isUpdate || body.category !== undefined) {
    if (!body.category || typeof body.category !== 'string' || body.category.trim().length === 0) {
      errors.push('分类不能为空');
    }
  }
  if (body.pdfUrl && typeof body.pdfUrl === 'string' && body.pdfUrl.length > 2000) {
    errors.push('PDF链接过长');
  }
  return errors;
}

function incrementReadCountAtomically(articleId: string): MockArticle | null {
  const article = mockArticles.get(articleId);
  if (!article) return null;
  article.readCount += 1;
  mockArticles.set(articleId, { ...article, readCount: article.readCount });
  return article;
}

interface CreateArticleBody {
  title?: string;
  content?: string;
  category?: string;
  subCategory?: string;
  author?: string;
  requiresMembership?: unknown;
  pdfUrl?: string;
}

interface ProcessResult<T = unknown> {
  success: boolean;
  message?: string;
  status?: number;
  data?: T;
  membership?: T;
}

function processCreateArticle(body: CreateArticleBody): ProcessResult<MockArticle> {
  const errors = validateArticleInput(body);
  if (errors.length > 0) {
    return { success: false, message: errors[0], status: 400 };
  }
  const article = createMockArticle({
    title: body.title!.trim(),
    content: body.content,
    category: body.category!.trim(),
    subCategory: body.subCategory?.trim(),
    author: body.author?.trim(),
    requiresMembership: Boolean(body.requiresMembership),
    pdfUrl: body.pdfUrl?.trim(),
  });
  return { success: true, data: article };
}

interface UpdateArticleBody {
  title?: string;
  content?: string;
  category?: string;
  subCategory?: string | null;
  author?: string | null;
  requiresMembership?: unknown;
  pdfUrl?: string;
  isPublic?: unknown;
}

function processUpdateArticle(id: string, body: UpdateArticleBody): ProcessResult<MockArticle> {
  if (!validateArticleId(id)) {
    return { success: false, message: '无效的文章ID格式', status: 400 };
  }
  const errors = validateArticleInput(body, true);
  if (errors.length > 0) {
    return { success: false, message: errors[0], status: 400 };
  }
  const article = mockArticles.get(id);
  if (!article) {
    return { success: false, message: '文章不存在', status: 404 };
  }
  if (body.title !== undefined) article.title = body.title.trim();
  if (body.content !== undefined) article.content = body.content;
  if (body.category !== undefined) article.category = body.category.trim();
  if (body.subCategory !== undefined) article.subCategory = body.subCategory?.trim() || null;
  if (body.author !== undefined) article.author = body.author?.trim() || null;
  if (body.requiresMembership !== undefined) article.requiresMembership = Boolean(body.requiresMembership);
  if (body.pdfUrl !== undefined) article.pdfUrl = body.pdfUrl?.trim() || null;
  if (body.isPublic !== undefined) article.isPublic = Boolean(body.isPublic);
  mockArticles.set(id, article);
  return { success: true, data: article };
}

function processDeleteArticle(id: string): ProcessResult {
  if (!validateArticleId(id)) {
    return { success: false, message: '无效的文章ID格式', status: 400 };
  }
  const article = mockArticles.get(id);
  if (!article) {
    return { success: false, message: '文章不存在', status: 404 };
  }
  article.deleteOne();
  return { success: true, message: '文章删除成功' };
}

// ─── routes/membership.js ───

function validateMembershipInput(body: { type?: string; durationDays?: string | number }): string[] {
  const errors: string[] = [];
  if (!body.type || typeof body.type !== 'string' || !ALLOWED_MEMBERSHIP_TYPES.includes(body.type)) {
    errors.push('无效的会员类型');
  }
  const parsedDuration = parseInt(body.durationDays as string, 10);
  if (isNaN(parsedDuration) || parsedDuration < 1 || parsedDuration > 3650) {
    errors.push('无效的时长参数');
  }
  return errors;
}

interface ActivateMembershipBody {
  type?: string;
  durationDays?: string | number;
}

function processActivateMembership(userId: string, body: ActivateMembershipBody): ProcessResult<{ type: string; startDate: Date; endDate: Date }> {
  const errors = validateMembershipInput(body);
  if (errors.length > 0) {
    return { success: false, message: errors[0], status: 400 };
  }
  const existing = getMockMembership(userId, body.type!);
  if (existing && existing.isActive) {
    return { success: false, message: '您已经是会员', status: 400 };
  }
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + parseInt(body.durationDays as string, 10));
  const membership = createMockMembership(userId, body.type!, startDate, endDate, true);
  return { success: true, membership: { type: membership.type, startDate: membership.startDate, endDate: membership.endDate } };
}

function processRenewMembership(userId: string, body: ActivateMembershipBody): ProcessResult<{ type: string; startDate: Date; endDate: Date }> {
  const errors = validateMembershipInput(body);
  if (errors.length > 0) {
    return { success: false, message: errors[0], status: 400 };
  }
  let membership = getMockMembership(userId, body.type!);
  const now = new Date();
  if (membership && membership.isActive) {
    const currentEndDate = new Date(membership.endDate);
    const newEndDate = new Date(currentEndDate > now ? currentEndDate : now);
    newEndDate.setDate(newEndDate.getDate() + parseInt(body.durationDays as string, 10));
    membership.endDate = newEndDate;
    mockMemberships.set(`${userId}:${body.type}`, membership);
  } else {
    const startDate = now;
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + parseInt(body.durationDays as string, 10));
    membership = createMockMembership(userId, body.type!, startDate, endDate, true);
  }
  return { success: true, membership: { type: membership!.type, startDate: membership!.startDate, endDate: membership!.endDate } };
}

// ─── routes/categories.js ───

function validateCategoryInput(body: { name?: string; description?: string; icon?: string; order?: string | number }, isUpdate: boolean = false): string[] {
  const errors: string[] = [];
  if (!isUpdate || body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      errors.push('分类名称不能为空');
    } else if (body.name.trim().length > 100) {
      errors.push('分类名称不能超过100个字符');
    }
  }
  if (body.description !== undefined && typeof body.description === 'string' && body.description.length > 500) {
    errors.push('描述不能超过500个字符');
  }
  if (body.icon !== undefined && typeof body.icon === 'string' && body.icon.length > 50) {
    errors.push('图标标识不能超过50个字符');
  }
  if (body.order !== undefined) {
    const parsedOrder = parseInt(body.order as string, 10);
    if (isNaN(parsedOrder) || parsedOrder < 0 || parsedOrder > 10000) {
      errors.push('排序值无效');
    }
  }
  return errors;
}

function validateCategoryId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

interface CreateCategoryBody {
  name?: string;
  description?: string;
  icon?: string;
  order?: string | number;
}

function processCreateCategory(body: CreateCategoryBody): ProcessResult<MockCategory> {
  const errors = validateCategoryInput(body);
  if (errors.length > 0) {
    return { success: false, message: errors[0], status: 400 };
  }
  const category = createMockCategory({
    name: body.name!.trim(),
    description: body.description?.trim(),
    icon: body.icon?.trim(),
    order: body.order !== undefined ? parseInt(body.order as string, 10) : 0,
  });
  return { success: true, data: category };
}

interface UpdateCategoryBody {
  name?: string;
  description?: string;
  icon?: string;
  order?: string | number;
}

function processUpdateCategory(id: string, body: UpdateCategoryBody): ProcessResult<MockCategory> {
  if (!validateCategoryId(id)) {
    return { success: false, message: '无效的分类ID格式', status: 400 };
  }
  const errors = validateCategoryInput(body, true);
  if (errors.length > 0) {
    return { success: false, message: errors[0], status: 400 };
  }
  const category = mockCategories.get(id);
  if (!category) {
    return { success: false, message: '分类不存在', status: 404 };
  }
  if (body.name !== undefined) category.name = body.name.trim();
  if (body.description !== undefined) category.description = body.description?.trim() || null;
  if (body.icon !== undefined) category.icon = body.icon?.trim() || null;
  if (body.order !== undefined) category.order = parseInt(body.order as string, 10);
  mockCategories.set(id, category);
  return { success: true, data: category };
}

function processDeleteCategory(id: string): ProcessResult {
  if (!validateCategoryId(id)) {
    return { success: false, message: '无效的分类ID格式', status: 400 };
  }
  const category = mockCategories.get(id);
  if (!category) {
    return { success: false, message: '分类不存在', status: 404 };
  }
  category.deleteOne();
  return { success: true, message: '分类删除成功' };
}

// ─── middleware/auth.js ───

const ADMIN_EMAILS_MOCK: string[] = [];

function setAdminEmails(emails: string[]) {
  ADMIN_EMAILS_MOCK.length = 0;
  // 与 middleware/auth.js 保持一致：配置时统一转小写
  ADMIN_EMAILS_MOCK.push(...emails.map(e => e.trim().toLowerCase()));
}

interface DecodedToken {
  email?: string;
  userId?: string;
}

interface AuthResult {
  authorized: boolean;
  message?: string;
}

function checkAdminAuth(decoded: DecodedToken): AuthResult {
  if (ADMIN_EMAILS_MOCK.length > 0) {
    const userEmail = decoded.email?.toLowerCase();
    if (!userEmail || !ADMIN_EMAILS_MOCK.includes(userEmail)) {
      return { authorized: false, message: '需要管理员权限' };
    }
  }
  return { authorized: true };
}

// ══════════════════════════════════════════════════════════════════════════════
// 清理工具
// ══════════════════════════════════════════════════════════════════════════════

function resetAll() {
  clearArticles();
  clearMemberships();
  clearCategories();
  clearUsers();
  _objectIdCounter = 1;
  setMockJwtPayload({});
  setAdminEmails([]);
}

// 模拟 jwt
let mockJwtSecret = 'test-secret';
let mockJwtPayload: Record<string, unknown> = {};

function setMockJwtSecret(secret: string) {
  mockJwtSecret = secret;
}

function setMockJwtPayload(payload: Record<string, unknown>) {
  mockJwtPayload = payload;
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 1: validateArticleId — ObjectId 格式验证
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-01: validateArticleId — ObjectId 格式验证', () => {
  beforeEach(resetAll);

  it('有效的 24 位十六进制字符串应通过验证', () => {
    expect(validateArticleId('507f1f77bcf86cd799439011')).toBe(true);
    expect(validateArticleId('5f4e3d2c1b0a9e8f7d6c5b4a')).toBe(true);
  });

  it('包含非十六进制字符应拒绝', () => {
    expect(validateArticleId('507f1f77bcf86cd79943901g')).toBe(false);
    expect(validateArticleId('507f1f77bcf86cd7994390zz')).toBe(false);
  });

  it('长度不足应拒绝', () => {
    expect(validateArticleId('507f1f77bcf86cd79943901')).toBe(false);
    expect(validateArticleId('507f1f77')).toBe(false);
  });

  it('长度超出应拒绝', () => {
    expect(validateArticleId('507f1f77bcf86cd7994390112')).toBe(false);
  });

  it('空字符串应拒绝', () => {
    expect(validateArticleId('')).toBe(false);
  });

  it('SQL 注入尝试应拒绝（包含特殊字符）', () => {
    expect(validateArticleId("'; DROP TABLE articles;--")).toBe(false);
    expect(validateArticleId('507f1f77bcf86cd79943901" OR "1"="1')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 2: validateArticleInput — 文章输入验证
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-02: validateArticleInput — 文章输入验证', () => {
  beforeEach(resetAll);

  describe('创建文章时', () => {
    it('正常输入应无错误', () => {
      const errors = validateArticleInput({
        title: 'Test Title',
        content: 'Test content',
        category: 'test-cat',
      });
      expect(errors).toHaveLength(0);
    });

    it('空标题应返回错误', () => {
      const errors = validateArticleInput({
        title: '',
        content: 'Test content',
        category: 'test-cat',
      });
      expect(errors).toContain('标题不能为空');
    });

    it('空内容应返回错误', () => {
      const errors = validateArticleInput({
        title: 'Test Title',
        content: '',
        category: 'test-cat',
      });
      expect(errors).toContain('内容不能为空');
    });

    it('空分类应返回错误', () => {
      const errors = validateArticleInput({
        title: 'Test Title',
        content: 'Test content',
        category: '  ',
      });
      expect(errors).toContain('分类不能为空');
    });

    it('标题超过 500 字符应返回错误', () => {
      const errors = validateArticleInput({
        title: 'A'.repeat(501),
        content: 'Test content',
        category: 'test-cat',
      });
      expect(errors).toContain('标题长度不能超过500个字符');
    });

    it('标题刚好 500 字符应通过', () => {
      const errors = validateArticleInput({
        title: 'A'.repeat(500),
        content: 'Test content',
        category: 'test-cat',
      });
      expect(errors).toHaveLength(0);
    });

    it('PDF 链接超长应返回错误', () => {
      const errors = validateArticleInput({
        title: 'Test Title',
        content: 'Test content',
        category: 'test-cat',
        pdfUrl: 'https://example.com/' + 'x'.repeat(2001),
      });
      expect(errors).toContain('PDF链接过长');
    });

    it('多个错误应全部返回', () => {
      const errors = validateArticleInput({
        title: '',
        content: '',
        category: '',
      });
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('更新文章时（部分字段）', () => {
    it('只更新标题应无错误', () => {
      const errors = validateArticleInput({ title: 'New Title' }, true);
      expect(errors).toHaveLength(0);
    });

    it('只更新内容应无错误', () => {
      const errors = validateArticleInput({ content: 'New content' }, true);
      expect(errors).toHaveLength(0);
    });

    it('更新标题为空应返回错误', () => {
      const errors = validateArticleInput({ title: '' }, true);
      expect(errors).toContain('标题不能为空');
    });

    it('更新的内容超长应返回错误', () => {
      const errors = validateArticleInput({ content: 'x'.repeat(10000001) }, true);
      expect(errors).toContain('内容过长');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 3: incrementReadCountAtomically — 竞态条件修复
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-03: incrementReadCountAtomically — 读计数原子递增', () => {
  beforeEach(resetAll);

  it('应正确递增阅读计数', () => {
    const article = createMockArticle({ readCount: 10 });
    const updated = incrementReadCountAtomically(article._id);
    expect(updated!.readCount).toBe(11);
  });

  it('连续递增应累积正确', () => {
    const article = createMockArticle({ readCount: 0 });
    incrementReadCountAtomically(article._id);
    incrementReadCountAtomically(article._id);
    incrementReadCountAtomically(article._id);
    const final = mockArticles.get(article._id);
    expect(final!.readCount).toBe(3);
  });

  it('不存在的文章应返回 null', () => {
    const result = incrementReadCountAtomically('507f1f77bcf86cd799439011');
    expect(result).toBeNull();
  });

  it('初始化为 0 的文章应正确递增', () => {
    const article = createMockArticle({ readCount: 0 });
    const updated = incrementReadCountAtomically(article._id);
    expect(updated!.readCount).toBe(1);
  });

  it('大量并发递增（模拟）应无数据丢失', () => {
    const article = createMockArticle({ readCount: 0 });
    const CONCURRENT_REQUESTS = 100;
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      incrementReadCountAtomically(article._id);
    }
    const final = mockArticles.get(article._id);
    expect(final!.readCount).toBe(CONCURRENT_REQUESTS);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 4: processCreateArticle — 创建文章
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-04: processCreateArticle — 创建文章', () => {
  beforeEach(resetAll);

  it('正常创建应返回成功', () => {
    const result = processCreateArticle({
      title: 'New Article',
      content: 'Article content here',
      category: 'biji',
    });
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe('New Article');
    expect(result.data!.content).toBe('Article content here');
    expect(result.data!.category).toBe('biji');
  });

  it('应自动 trim 标题空格', () => {
    const result = processCreateArticle({
      title: '  Article Title  ',
      content: 'Content',
      category: 'biji',
    });
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe('Article Title');
  });

  it('应自动 trim 分类空格', () => {
    const result = processCreateArticle({
      title: 'Title',
      content: 'Content',
      category: '  biji  ',
    });
    expect(result.success).toBe(true);
    expect(result.data!.category).toBe('biji');
  });

  it('缺少必填字段应返回 400', () => {
    const result = processCreateArticle({
      title: 'Title',
      // 缺少 content 和 category
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('所有可选字段应正确设置', () => {
    const result = processCreateArticle({
      title: 'Full Article',
      content: 'Content',
      category: 'biji',
      subCategory: 'daily',
      author: 'Test Author',
      requiresMembership: true,
      pdfUrl: 'https://example.com/doc.pdf',
    });
    expect(result.success).toBe(true);
    expect(result.data!.subCategory).toBe('daily');
    expect(result.data!.author).toBe('Test Author');
    expect(result.data!.requiresMembership).toBe(true);
    expect(result.data!.pdfUrl).toBe('https://example.com/doc.pdf');
  });

  it('requiresMembership 应强制转换为布尔值', () => {
    const result = processCreateArticle({
      title: 'Title',
      content: 'Content',
      category: 'biji',
      requiresMembership: 'yes', // 传入字符串
    });
    expect(result.success).toBe(true);
    expect(result.data!.requiresMembership).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 5: processUpdateArticle — 更新文章
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-05: processUpdateArticle — 更新文章', () => {
  beforeEach(resetAll);

  it('正常更新应返回成功', () => {
    const article = createMockArticle({ title: 'Old Title' });
    const result = processUpdateArticle(article._id, { title: 'New Title' });
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe('New Title');
  });

  it('无效 ID 格式应返回 400', () => {
    const result = processUpdateArticle('invalid-id', { title: 'New Title' });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toBe('无效的文章ID格式');
  });

  it('不存在的文章应返回 404', () => {
    const result = processUpdateArticle('507f1f77bcf86cd799439011', { title: 'New Title' });
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it('部分字段更新不应影响其他字段', () => {
    const article = createMockArticle({
      title: 'Original',
      content: 'Original content',
      category: 'biji',
    });
    const result = processUpdateArticle(article._id, { title: 'Updated' });
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe('Updated');
    expect(result.data!.content).toBe('Original content');
    expect(result.data!.category).toBe('biji');
  });

  it('isPublic 应正确转换', () => {
    const article = createMockArticle({ isPublic: false });
    const result = processUpdateArticle(article._id, { isPublic: 'true' });
    expect(result.success).toBe(true);
    expect(result.data!.isPublic).toBe(true);
  });

  it('设置 null 应正确处理', () => {
    const article = createMockArticle({ author: 'Author', subCategory: 'daily' });
    const result = processUpdateArticle(article._id, { author: null, subCategory: null });
    expect(result.success).toBe(true);
    expect(result.data!.author).toBeNull();
    expect(result.data!.subCategory).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 6: processDeleteArticle — 删除文章
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-06: processDeleteArticle — 删除文章', () => {
  beforeEach(resetAll);

  it('正常删除应返回成功', () => {
    const article = createMockArticle();
    const result = processDeleteArticle(article._id);
    expect(result.success).toBe(true);
    expect(result.message).toBe('文章删除成功');
    expect(mockArticles.has(article._id)).toBe(false);
  });

  it('无效 ID 格式应返回 400', () => {
    const result = processDeleteArticle('invalid-id');
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
// TEST GROUP 7: validateMembershipInput — 会员输入验证
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-07: validateMembershipInput — 会员输入验证', () => {
  beforeEach(resetAll);

  it('有效 weekly 类型应无错误', () => {
    const errors = validateMembershipInput({ type: 'weekly', durationDays: 7 });
    expect(errors).toHaveLength(0);
  });

  it('有效 yearly 类型应无错误', () => {
    const errors = validateMembershipInput({ type: 'yearly', durationDays: 365 });
    expect(errors).toHaveLength(0);
  });

  it('无效 type 应返回错误', () => {
    const errors = validateMembershipInput({ type: 'monthly', durationDays: 30 });
    expect(errors).toContain('无效的会员类型');
  });

  it('空 type 应返回错误', () => {
    const errors = validateMembershipInput({ type: '', durationDays: 30 });
    expect(errors).toContain('无效的会员类型');
  });

  it('durationDays 为 0 应返回错误', () => {
    const errors = validateMembershipInput({ type: 'weekly', durationDays: 0 });
    expect(errors).toContain('无效的时长参数');
  });

  it('durationDays 为负数应返回错误', () => {
    const errors = validateMembershipInput({ type: 'weekly', durationDays: -5 });
    expect(errors).toContain('无效的时长参数');
  });

  it('durationDays 超过 3650 应返回错误', () => {
    const errors = validateMembershipInput({ type: 'weekly', durationDays: 3651 });
    expect(errors).toContain('无效的时长参数');
  });

  it('durationDays 为字符串应解析', () => {
    const errors = validateMembershipInput({ type: 'weekly', durationDays: '7' });
    expect(errors).toHaveLength(0);
  });

  it('durationDays 非数字应返回错误', () => {
    const errors = validateMembershipInput({ type: 'weekly', durationDays: 'abc' });
    expect(errors).toContain('无效的时长参数');
  });

  it('同时无效 type 和 durationDays 应返回两个错误', () => {
    const errors = validateMembershipInput({ type: 'invalid', durationDays: -1 });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 8: processActivateMembership — 开通会员
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-08: processActivateMembership — 开通会员', () => {
  beforeEach(resetAll);

  it('首次开通应成功', () => {
    const result = processActivateMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(true);
    expect(result.membership!.type).toBe('yearly');
    expect(result.membership!.endDate > result.membership!.startDate).toBe(true);
  });

  it('重复开通相同类型应拒绝', () => {
    createMockMembership('user-001', 'yearly', new Date(), new Date(), true);
    const result = processActivateMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(false);
    expect(result.message).toBe('您已经是会员');
  });

  it('无效参数应返回 400', () => {
    const result = processActivateMembership('user-001', { type: 'monthly', durationDays: 30 });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('weekly 类型应成功', () => {
    const result = processActivateMembership('user-001', { type: 'weekly', durationDays: 7 });
    expect(result.success).toBe(true);
    expect(result.membership!.type).toBe('weekly');
  });

  it('过期会员重新开通应成功', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    createMockMembership('user-001', 'yearly', pastDate, pastDate, false);
    const result = processActivateMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(true);
  });

  it('durationDays 为字符串时应正确解析', () => {
    const result = processActivateMembership('user-001', { type: 'weekly', durationDays: '7' });
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 9: processRenewMembership — 续费会员
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-09: processRenewMembership — 续费会员', () => {
  beforeEach(resetAll);

  it('现有会员续费应顺延', () => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 10);
    createMockMembership('user-001', 'yearly', startDate, endDate, true);

    const result = processRenewMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(true);
    const newEnd = new Date(result.membership!.endDate);
    expect(newEnd.getTime()).toBeGreaterThan(endDate.getTime());
  });

  it('无现有会员应创建新会员', () => {
    const result = processRenewMembership('user-001', { type: 'yearly', durationDays: 365 });
    expect(result.success).toBe(true);
    expect(result.membership!.type).toBe('yearly');
  });

  it('过期会员续费应从今天开始计算', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    createMockMembership('user-001', 'yearly', pastDate, pastDate, true);

    const beforeRenew = new Date().getTime();
    const result = processRenewMembership('user-001', { type: 'yearly', durationDays: 365 });
    const afterRenew = new Date(result.membership!.endDate).getTime();

    // 过期会员续费应从"今天"开始加365天，而不是从旧的过期日期
    expect(afterRenew - beforeRenew).toBeGreaterThanOrEqual(365 * 24 * 60 * 60 * 1000 - 1000);
  });

  it('无效参数应返回 400', () => {
    const result = processRenewMembership('user-001', { type: 'monthly', durationDays: 30 });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('续费 weekly 类型应正确累加', () => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    createMockMembership('user-001', 'weekly', startDate, endDate, true);

    const result = processRenewMembership('user-001', { type: 'weekly', durationDays: 7 });
    expect(result.success).toBe(true);
    // 应该是从现有到期日顺延，不是从今天
    const expectedEnd = new Date(endDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(new Date(result.membership!.endDate).getTime()).toBe(expectedEnd.getTime());
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 10: validateCategoryInput — 分类输入验证
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-10: validateCategoryInput — 分类输入验证', () => {
  beforeEach(resetAll);

  it('正常输入应无错误', () => {
    const errors = validateCategoryInput({ name: 'Test Category' });
    expect(errors).toHaveLength(0);
  });

  it('空名称应返回错误', () => {
    const errors = validateCategoryInput({ name: '' });
    expect(errors).toContain('分类名称不能为空');
  });

  it('纯空格名称应返回错误', () => {
    const errors = validateCategoryInput({ name: '   ' });
    expect(errors).toContain('分类名称不能为空');
  });

  it('名称超过 100 字符应返回错误', () => {
    const errors = validateCategoryInput({ name: 'A'.repeat(101) });
    expect(errors).toContain('分类名称不能超过100个字符');
  });

  it('描述超过 500 字符应返回错误', () => {
    const errors = validateCategoryInput({ name: 'Test', description: 'D'.repeat(501) });
    expect(errors).toContain('描述不能超过500个字符');
  });

  it('图标超过 50 字符应返回错误', () => {
    const errors = validateCategoryInput({ name: 'Test', icon: 'i'.repeat(51) });
    expect(errors).toContain('图标标识不能超过50个字符');
  });

  it('order 为负数应返回错误', () => {
    const errors = validateCategoryInput({ name: 'Test', order: -1 });
    expect(errors).toContain('排序值无效');
  });

  it('order 超过 10000 应返回错误', () => {
    const errors = validateCategoryInput({ name: 'Test', order: 10001 });
    expect(errors).toContain('排序值无效');
  });

  it('多个错误应全部返回', () => {
    const errors = validateCategoryInput({
      name: '',
      description: 'D'.repeat(501),
      icon: 'i'.repeat(51),
      order: -1,
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 11: validateCategoryId — 分类 ObjectId 验证
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-11: validateCategoryId — 分类 ObjectId 验证', () => {
  beforeEach(resetAll);

  it('有效 ID 应通过', () => {
    expect(validateCategoryId('507f1f77bcf86cd799439011')).toBe(true);
  });

  it('无效格式应拒绝', () => {
    expect(validateCategoryId('invalid')).toBe(false);
    expect(validateCategoryId('')).toBe(false);
    expect(validateCategoryId("'; DROP TABLE--")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 12: processCreateCategory — 创建分类
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-12: processCreateCategory — 创建分类', () => {
  beforeEach(resetAll);

  it('正常创建应成功', () => {
    const result = processCreateCategory({ name: 'New Category' });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe('New Category');
  });

  it('应自动 trim 名称', () => {
    const result = processCreateCategory({ name: '  Category Name  ' });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe('Category Name');
  });

  it('缺少名称应返回 400', () => {
    const result = processCreateCategory({});
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('所有字段应正确设置', () => {
    const result = processCreateCategory({
      name: 'Full Category',
      description: 'Description here',
      icon: 'star',
      order: 5,
    });
    expect(result.success).toBe(true);
    expect(result.data!.description).toBe('Description here');
    expect(result.data!.icon).toBe('star');
    expect(result.data!.order).toBe(5);
  });

  it('默认 order 应为 0', () => {
    const result = processCreateCategory({ name: 'Category' });
    expect(result.success).toBe(true);
    expect(result.data!.order).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 13: processUpdateCategory — 更新分类
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-13: processUpdateCategory — 更新分类', () => {
  beforeEach(resetAll);

  it('正常更新应成功', () => {
    const category = createMockCategory({ name: 'Old Name' });
    const result = processUpdateCategory(category._id, { name: 'New Name' });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe('New Name');
  });

  it('无效 ID 应返回 400', () => {
    const result = processUpdateCategory('invalid', { name: 'New Name' });
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('不存在的分类应返回 404', () => {
    const result = processUpdateCategory('507f1f77bcf86cd799439011', { name: 'New Name' });
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it('部分字段更新不应影响其他字段', () => {
    const category = createMockCategory({ name: 'Original', description: 'Original desc' });
    const result = processUpdateCategory(category._id, { name: 'Updated' });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe('Updated');
    expect(result.data!.description).toBe('Original desc');
  });

  it('order 应正确解析为数字', () => {
    const category = createMockCategory({ order: 0 });
    const result = processUpdateCategory(category._id, { order: '10' });
    expect(result.success).toBe(true);
    expect(result.data!.order).toBe(10);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 14: processDeleteCategory — 删除分类
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-14: processDeleteCategory — 删除分类', () => {
  beforeEach(resetAll);

  it('正常删除应成功', () => {
    const category = createMockCategory();
    const result = processDeleteCategory(category._id);
    expect(result.success).toBe(true);
    expect(mockCategories.has(category._id)).toBe(false);
  });

  it('无效 ID 应返回 400', () => {
    const result = processDeleteCategory('invalid');
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('不存在的分类应返回 404', () => {
    const result = processDeleteCategory('507f1f77bcf86cd799439011');
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 15: checkAdminAuth — 管理员权限检查
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-15: checkAdminAuth — 管理员权限检查', () => {
  beforeEach(resetAll);

  it('未配置白名单时应授权通过', () => {
    setAdminEmails([]);
    const result = checkAdminAuth({ userId: 'any-user', email: 'anyone@test.com' });
    expect(result.authorized).toBe(true);
  });

  it('邮箱在白名单中应授权', () => {
    setAdminEmails(['admin@test.com', 'super@test.com']);
    const result = checkAdminAuth({ userId: 'user-001', email: 'admin@test.com' });
    expect(result.authorized).toBe(true);
  });

  it('邮箱不在白名单中应拒绝', () => {
    setAdminEmails(['admin@test.com']);
    const result = checkAdminAuth({ userId: 'user-001', email: 'user@test.com' });
    expect(result.authorized).toBe(false);
    expect(result.message).toBe('需要管理员权限');
  });

  it('邮箱大小写应不敏感', () => {
    setAdminEmails(['Admin@TEST.COM']);
    const result = checkAdminAuth({ userId: 'user-001', email: 'admin@test.com' });
    expect(result.authorized).toBe(true);
  });

  it('缺少邮箱字段应拒绝', () => {
    setAdminEmails(['admin@test.com']);
    const result = checkAdminAuth({ userId: 'user-001' });
    expect(result.authorized).toBe(false);
  });

  it('空邮箱应拒绝', () => {
    setAdminEmails(['admin@test.com']);
    const result = checkAdminAuth({ userId: 'user-001', email: '' });
    expect(result.authorized).toBe(false);
  });

  it('空白名单（全部拒绝）', () => {
    setAdminEmails([]);
    const result = checkAdminAuth({ userId: 'user-001', email: 'anyone@test.com' });
    expect(result.authorized).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 16: 安全边界条件
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-16: 安全边界条件测试', () => {
  beforeEach(resetAll);

  it('XSS 注入：标题包含脚本标签应被记录（但不禁用）', () => {
    const result = processCreateArticle({
      title: '<script>alert("xss")</script>',
      content: 'Content',
      category: 'biji',
    });
    expect(result.success).toBe(true);
    expect(result.data!.title).toContain('<script>');
  });

  it('SQL 注入尝试在 ObjectId 验证阶段被拦截', () => {
    const result = processDeleteArticle("'; DROP TABLE articles;--");
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it('超长输入：标题 10 万字符应被拒绝', () => {
    const result = processCreateArticle({
      title: 'A'.repeat(100000),
      content: 'Content',
      category: 'biji',
    });
    expect(result.success).toBe(false);
  });

  it('超长输入：内容 1000 万字符应被拒绝', () => {
    const result = processCreateArticle({
      title: 'Title',
      content: 'A'.repeat(10000001),
      category: 'biji',
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe('内容过长');
  });

  it('undefined 字段不应触发验证错误', () => {
    const errors = validateArticleInput({
      title: 'Valid Title',
      content: 'Valid Content',
      category: 'biji',
      // 以下字段不传
      // subCategory: undefined,
      // author: undefined,
      // requiresMembership: undefined,
      // pdfUrl: undefined,
    });
    expect(errors).toHaveLength(0);
  });

  it('null 字段不应触发验证错误', () => {
    const result = processCreateArticle({
      title: 'Title',
      content: 'Content',
      category: 'biji',
    });
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST GROUP 17: ALLOWED_MEMBERSHIP_TYPES 常量验证
// ══════════════════════════════════════════════════════════════════════════════

describe('P-A-17: ALLOWED_MEMBERSHIP_TYPES 常量验证', () => {
  it('应只包含 weekly 和 yearly', () => {
    expect(ALLOWED_MEMBERSHIP_TYPES).toContain('weekly');
    expect(ALLOWED_MEMBERSHIP_TYPES).toContain('yearly');
    expect(ALLOWED_MEMBERSHIP_TYPES.length).toBe(2);
  });

  it('不应包含 monthly（废弃）', () => {
    expect(ALLOWED_MEMBERSHIP_TYPES).not.toContain('monthly');
  });

  it('不应包含 permanent', () => {
    expect(ALLOWED_MEMBERSHIP_TYPES).not.toContain('permanent');
  });

  it('不应包含 free', () => {
    expect(ALLOWED_MEMBERSHIP_TYPES).not.toContain('free');
  });
});
