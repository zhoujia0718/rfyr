/**
 * Module 7 - UI组件库：lib/constants.ts 测试套件
 *
 * 测试覆盖：
 * 1. STORAGE_BUCKETS - 存储桶常量
 * 2. CONTENT_LIMITS - 内容限制
 * 3. ARTICLE_ACCESS_LEVELS / MEMBERSHIP_TIERS / MEMBERSHIP_TYPES - 枚举常量
 * 4. STORAGE_PATH - 路径安全配置
 * 5. CACHE_CONFIG - 缓存配置
 * 6. UPLOAD_CONFIG - 上传配置
 * 7. LOCAL_STORAGE_KEYS - localStorage 键名
 * 8. YUQUE_LIKE_DOMAINS / ALLOWED_IMAGE_DOMAINS - 域名白名单
 * 9. DEFAULT_READING_SETTINGS / DEFAULT_READING_LIMITS - 默认设置
 * 10. SHORT_ID_CONFIG - Short ID 配置
 */
import { describe, it, expect } from 'vitest'
import {
  STORAGE_BUCKETS,
  CONTENT_LIMITS,
  ARTICLE_ACCESS_LEVELS,
  MEMBERSHIP_TIERS,
  MEMBERSHIP_TYPES,
  STORAGE_PATH,
  CACHE_CONFIG,
  UPLOAD_CONFIG,
  LOCAL_STORAGE_KEYS,
  YUQUE_LIKE_DOMAINS,
  ALLOWED_IMAGE_DOMAINS,
  DEFAULT_READING_SETTINGS,
  DEFAULT_READING_LIMITS,
  SHORT_ID_CONFIG,
// @ts-ignore
} from '../lib/constants.ts'

describe('M7-05: lib/constants.ts', () => {
  describe('STORAGE_BUCKETS', () => {
    it('应包含所有必需的存储桶', () => {
      expect(STORAGE_BUCKETS.ARTICLE_IMAGES).toBe('article-images')
      expect(STORAGE_BUCKETS.ARTICLE_PDFS).toBe('article-pdfs')
      expect(STORAGE_BUCKETS.ARTICLE_HTMLS).toBe('article-pdfs')
    })

    it('ARTICLE_HTMLS 应与 ARTICLE_PDFS 使用同一桶', () => {
      expect(STORAGE_BUCKETS.ARTICLE_HTMLS).toBe(STORAGE_BUCKETS.ARTICLE_PDFS)
    })
  })

  describe('CONTENT_LIMITS', () => {
    it('MAX_FILE_SIZE 应为 20MB', () => {
      expect(CONTENT_LIMITS.MAX_FILE_SIZE).toBe(20 * 1024 * 1024)
    })

    it('MAX_IMAGE_SIZE 应为 15MB', () => {
      expect(CONTENT_LIMITS.MAX_IMAGE_SIZE).toBe(15 * 1024 * 1024)
    })

    it('MAX_PATH_LENGTH 应为 1024', () => {
      expect(CONTENT_LIMITS.MAX_PATH_LENGTH).toBe(1024)
    })

    it('MAX_FILENAME_LENGTH 应为 180', () => {
      expect(CONTENT_LIMITS.MAX_FILENAME_LENGTH).toBe(180)
    })

    it('所有限制应为正数', () => {
      expect(CONTENT_LIMITS.MAX_FILE_SIZE).toBeGreaterThan(0)
      expect(CONTENT_LIMITS.MAX_IMAGE_SIZE).toBeGreaterThan(0)
      expect(CONTENT_LIMITS.MAX_PATH_LENGTH).toBeGreaterThan(0)
      expect(CONTENT_LIMITS.MAX_FILENAME_LENGTH).toBeGreaterThan(0)
    })
  })

  describe('ARTICLE_ACCESS_LEVELS / MEMBERSHIP_TIERS', () => {
    it('ARTICLE_ACCESS_LEVELS 应包含 free/monthly/yearly', () => {
      expect(ARTICLE_ACCESS_LEVELS.FREE).toBe('free')
      expect(ARTICLE_ACCESS_LEVELS.MONTHLY).toBe('monthly')
      expect(ARTICLE_ACCESS_LEVELS.YEARLY).toBe('yearly')
    })

    it('MEMBERSHIP_TIERS 应包含所有等级', () => {
      expect(MEMBERSHIP_TIERS.FREE).toBe('free')
      expect(MEMBERSHIP_TIERS.MONTHLY).toBe('monthly')
      expect(MEMBERSHIP_TIERS.YEARLY).toBe('yearly')
      expect(MEMBERSHIP_TIERS.PERMANENT).toBe('permanent')
    })

    it('MEMBERSHIP_TYPES 应只包含付费类型', () => {
      expect(MEMBERSHIP_TYPES.MONTHLY).toBe('monthly')
      expect(MEMBERSHIP_TYPES.YEARLY).toBe('yearly')
      expect(MEMBERSHIP_TYPES.PERMANENT).toBe('permanent')
      expect(MEMBERSHIP_TYPES).not.toHaveProperty('FREE')
    })
  })

  describe('STORAGE_PATH', () => {
    it('ALLOWED_CHARS 应匹配正确的格式', () => {
      expect(STORAGE_PATH.ALLOWED_CHARS.test('abc/def.ghi-jkl')).toBe(true)
      expect(STORAGE_PATH.ALLOWED_CHARS.test('abc/def')).toBe(true)
    })

    it('ALLOWED_CHARS 应拒绝非法字符', () => {
      expect(STORAGE_PATH.ALLOWED_CHARS.test('abc def')).toBe(false)
      expect(STORAGE_PATH.ALLOWED_CHARS.test('abc<script>')).toBe(false)
      expect(STORAGE_PATH.ALLOWED_CHARS.test('abc@def')).toBe(false)
    })

    it('FORBIDDEN_PATTERNS 应包含路径遍历模式', () => {
      expect(STORAGE_PATH.FORBIDDEN_PATTERNS).toContain('..')
      expect(STORAGE_PATH.FORBIDDEN_PATTERNS).toContain('~')
      expect(STORAGE_PATH.FORBIDDEN_PATTERNS).toContain('$')
    })
  })

  describe('CACHE_CONFIG', () => {
    it('MEMBERSHIP_CACHE_TTL 应为 60 秒（毫秒）', () => {
      expect(CACHE_CONFIG.MEMBERSHIP_CACHE_TTL).toBe(60_000)
    })

    it('CATEGORY_CACHE_TTL 应为 5 分钟（毫秒）', () => {
      expect(CACHE_CONFIG.CATEGORY_CACHE_TTL).toBe(5 * 60_000)
    })

    it('缓存 TTL 应为正数', () => {
      expect(CACHE_CONFIG.MEMBERSHIP_CACHE_TTL).toBeGreaterThan(0)
      expect(CACHE_CONFIG.CATEGORY_CACHE_TTL).toBeGreaterThan(0)
    })
  })

  describe('UPLOAD_CONFIG', () => {
    it('MAX_RETRIES 应大于 0', () => {
      expect(UPLOAD_CONFIG.MAX_RETRIES).toBeGreaterThan(0)
    })

    it('RETRY_DELAY_BASE 应大于 0', () => {
      expect(UPLOAD_CONFIG.RETRY_DELAY_BASE).toBeGreaterThan(0)
    })

    it('UPLOAD_TIMEOUT 应大于 0', () => {
      expect(UPLOAD_CONFIG.UPLOAD_TIMEOUT).toBeGreaterThan(0)
    })

    it('MAX_CONCURRENT_UPLOADS 应大于 0', () => {
      expect(UPLOAD_CONFIG.MAX_CONCURRENT_UPLOADS).toBeGreaterThan(0)
    })

    it('RETRY_DELAY_BASE 应小于 UPLOAD_TIMEOUT', () => {
      expect(UPLOAD_CONFIG.RETRY_DELAY_BASE).toBeLessThan(UPLOAD_CONFIG.UPLOAD_TIMEOUT)
    })
  })

  describe('LOCAL_STORAGE_KEYS', () => {
    it('键名应有统一前缀', () => {
      expect(LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME).toContain('pdf_original_name')
      expect(LOCAL_STORAGE_KEYS.HTML_ORIGINAL_NAME).toContain('html_original_name')
      expect(LOCAL_STORAGE_KEYS.CUSTOM_AUTH).toBeTruthy()
    })

    it('每个键名应唯一', () => {
      const values = Object.values(LOCAL_STORAGE_KEYS)
      const unique = new Set(values)
      expect(unique.size).toBe(values.length)
    })
  })

  describe('YUQUE_LIKE_DOMAINS / ALLOWED_IMAGE_DOMAINS', () => {
    it('应包含语雀域名', () => {
      expect(YUQUE_LIKE_DOMAINS).toContain('yuque.com')
      expect(YUQUE_LIKE_DOMAINS).toContain('nlark.com')
    })

    it('应包含飞书域名', () => {
      expect(YUQUE_LIKE_DOMAINS).toContain('feishu.cn')
      expect(YUQUE_LIKE_DOMAINS).toContain('larksuite.com')
    })

    it('ALLOWED_IMAGE_DOMAINS 应与 YUQUE_LIKE_DOMAINS 一致', () => {
      expect(ALLOWED_IMAGE_DOMAINS).toEqual(YUQUE_LIKE_DOMAINS)
    })

    it('域名列表不应包含协议', () => {
      for (const domain of ALLOWED_IMAGE_DOMAINS) {
        expect(domain.includes('://')).toBe(false)
        expect(domain.includes('/')).toBe(false)
      }
    })
  })

  describe('DEFAULT_READING_SETTINGS', () => {
    it('应有有效的字体大小', () => {
      expect(['small', 'medium', 'large']).toContain(DEFAULT_READING_SETTINGS.FONT_SIZE)
    })

    it('应有有效的主题', () => {
      expect(['light', 'dark']).toContain(DEFAULT_READING_SETTINGS.THEME)
    })

    it('应有有效的段落间距', () => {
      expect(['compact', 'normal', 'spacious']).toContain(DEFAULT_READING_SETTINGS.PARAGRAPH_SPACING)
    })
  })

  describe('DEFAULT_READING_LIMITS', () => {
    it('GUEST_READ_LIMIT 应为正数', () => {
      expect(DEFAULT_READING_LIMITS.GUEST_READ_LIMIT).toBeGreaterThan(0)
    })

    it('MONTHLY_DAILY_LIMIT 应为正数', () => {
      expect(DEFAULT_READING_LIMITS.MONTHLY_DAILY_LIMIT).toBeGreaterThan(0)
    })

    it('REFERRAL_BONUS_COUNT 应为正数', () => {
      expect(DEFAULT_READING_LIMITS.REFERRAL_BONUS_COUNT).toBeGreaterThan(0)
    })

    it('GUEST_READ_LIMIT 应小于 MONTHLY_DAILY_LIMIT', () => {
      expect(DEFAULT_READING_LIMITS.GUEST_READ_LIMIT).toBeLessThan(DEFAULT_READING_LIMITS.MONTHLY_DAILY_LIMIT)
    })
  })

  describe('SHORT_ID_CONFIG', () => {
    it('DEFAULT_LENGTH 应为正数', () => {
      expect(SHORT_ID_CONFIG.DEFAULT_LENGTH).toBeGreaterThan(0)
    })

    it('CHARS 不应包含易混淆字符（0/O, 1/l/I）', () => {
      expect(SHORT_ID_CONFIG.CHARS).not.toContain('0')
      expect(SHORT_ID_CONFIG.CHARS).not.toContain('O')
      expect(SHORT_ID_CONFIG.CHARS).not.toContain('1')
      expect(SHORT_ID_CONFIG.CHARS).not.toContain('l')
      expect(SHORT_ID_CONFIG.CHARS).not.toContain('I')
    })

    it('CHARS 应包含数字', () => {
      expect(SHORT_ID_CONFIG.CHARS).toMatch(/\d/)
    })

    it('CHARS 应包含字母', () => {
      expect(SHORT_ID_CONFIG.CHARS).toMatch(/[a-z]/)
      expect(SHORT_ID_CONFIG.CHARS).toMatch(/[A-Z]/)
    })
  })
})
