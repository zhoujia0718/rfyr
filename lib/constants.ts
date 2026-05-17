/**
 * 应用常量配置
 * 集中管理所有硬编码的配置值，便于维护和修改
 */

// Supabase Storage 存储桶名称
export const STORAGE_BUCKETS = {
  ARTICLE_IMAGES: 'article-images',
  ARTICLE_PDFS: 'article-pdfs',
  ARTICLE_HTMLS: 'article-pdfs', // 与 PDFs 同一桶
  BOOK_PDFS: 'book-pdfs',        // 书籍 PDF（私有桶，下载需经服务端验证）
} as const

// 内容大小限制
export const CONTENT_LIMITS = {
  MAX_FILE_SIZE: 20 * 1024 * 1024,   // 20MB
  MAX_IMAGE_SIZE: 15 * 1024 * 1024,  // 15MB
  MAX_PATH_LENGTH: 1024,              // 路径最大长度
  MAX_FILENAME_LENGTH: 180,           // 文件名最大长度
} as const

// 文章访问级别
export const ARTICLE_ACCESS_LEVELS = {
  FREE: 'free',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const

// 会员等级
export const MEMBERSHIP_TIERS = {
  FREE: 'free',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  PERMANENT: 'permanent',
} as const

// 会员类型（用于数据库查询）
export const MEMBERSHIP_TYPES = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  PERMANENT: 'permanent',
} as const

// 存储路径安全验证
export const STORAGE_PATH = {
  // 允许的字符白名单
  ALLOWED_CHARS: /^[a-zA-Z0-9._\-/]+$/,
  // 禁止的模式
  FORBIDDEN_PATTERNS: ['..', '~', '$'],
} as const

// 缓存配置
export const CACHE_CONFIG = {
  // 会员信息缓存时间（毫秒）
  MEMBERSHIP_CACHE_TTL: 60_000, // 60秒
  // 分类信息缓存时间（毫秒）
  CATEGORY_CACHE_TTL: 5 * 60_000, // 5分钟
} as const

// 上传配置
export const UPLOAD_CONFIG = {
  // 图片上传重试次数
  MAX_RETRIES: 3,
  // 重试延迟（毫秒，指数退避）
  RETRY_DELAY_BASE: 1000,
  // 单次上传超时（毫秒）
  UPLOAD_TIMEOUT: 60_000,
  // 同时上传的最大文件数
  MAX_CONCURRENT_UPLOADS: 5,
} as const

// localStorage 键名前缀
export const LOCAL_STORAGE_KEYS = {
  PDF_ORIGINAL_NAME: 'pdf_original_name_',
  HTML_ORIGINAL_NAME: 'html_original_name_',
  CUSTOM_AUTH: 'custom_auth',
} as const

// 语雀/飞书 CDN 域名（用于检测剪贴板粘贴来源）
export const YUQUE_LIKE_DOMAINS = [
  'nlark.com',
  'yuque.com',
  'yuque.antfin.com',
  'larkoffice.com',
  'feishu.cn',
  'larksuite.com',
  'alicdn.com',
  'alipayobjects.com',
  'mmstat.com',
  'bcebos.com',
] as const

// 允许的外链图片域名
export const ALLOWED_IMAGE_DOMAINS = [
  'nlark.com',
  'yuque.com',
  'yuque.antfin.com',
  'larkoffice.com',
  'feishu.cn',
  'larksuite.com',
  'alicdn.com',
  'alipayobjects.com',
  'mmstat.com',
  'bcebos.com',
] as const

// 默认的阅读设置
export const DEFAULT_READING_SETTINGS = {
  FONT_SIZE: 'medium',
  THEME: 'light',
  PARAGRAPH_SPACING: 'normal',
} as const

// 默认的阅读限制
export const DEFAULT_READING_LIMITS = {
  GUEST_READ_LIMIT: 3,
  MONTHLY_DAILY_LIMIT: 8,
  REFERRAL_BONUS_COUNT: 2,
} as const

// Short ID 生成配置
export const SHORT_ID_CONFIG = {
  DEFAULT_LENGTH: 8,
  CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789',
} as const
