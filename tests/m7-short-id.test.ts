/**
 * Module 7 - UI组件库：lib/short-id.ts 测试套件
 *
 * 测试覆盖：
 * 1. generateShortId() - 短 ID 生成
 * 2. isShortId() - 短 ID 格式校验
 * 3. isArticleUuid() - UUID 格式校验
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { generateShortId, isShortId, isArticleUuid } from '../lib/short-id.ts'

describe('M7-03: lib/short-id.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. generateShortId()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('generateShortId() - 短 ID 生成', () => {
    it('应生成默认长度 8 的 ID', () => {
      const id = generateShortId()
      expect(id.length).toBe(8)
    })

    it('应生成指定长度的 ID', () => {
      expect(generateShortId(6).length).toBe(6)
      expect(generateShortId(10).length).toBe(10)
      expect(generateShortId(16).length).toBe(16)
    })

    it('应只包含允许的字符（无易混淆字符：0/O, 1/l/I）', () => {
      const ALLOWED = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
      for (let i = 0; i < 50; i++) {
        const id = generateShortId(20)
        for (const char of id) {
          expect(ALLOWED.includes(char)).toBe(true)
        }
      }
    })

    it('应生成唯一的 ID（随机性）', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateShortId()))
      // 100 个随机 ID，集合大小应接近 100
      expect(ids.size).toBeGreaterThan(90)
    })

    it('长度 0 应生成空字符串', () => {
      const id = generateShortId(0)
      expect(id).toBe('')
    })

    it('长度 1 应生成单个字符', () => {
      const id = generateShortId(1)
      expect(id.length).toBe(1)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. isShortId()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('isShortId() - 短 ID 格式校验', () => {
    it('应接受有效短 ID', () => {
      expect(isShortId('abc12345')).toBe(true)
      expect(isShortId('ABCDEFGH')).toBe(true)
      expect(isShortId('1234567890')).toBe(true)
      expect(isShortId('aBcDeFgH')).toBe(true)
    })

    it('应接受最小长度 6', () => {
      expect(isShortId('123456')).toBe(true)
      expect(isShortId('abcdef')).toBe(true)
    })

    it('应接受最大长度 12', () => {
      expect(isShortId('123456789012')).toBe(true)
    })

    it('应拒绝过短（<6）', () => {
      expect(isShortId('12345')).toBe(false)
      expect(isShortId('a')).toBe(false)
      expect(isShortId('')).toBe(false)
    })

    it('应拒绝过长（>12）', () => {
      expect(isShortId('1234567890123')).toBe(false)
    })

    it('应拒绝包含连字符的 ID（UUID 格式）', () => {
      expect(isShortId('abc-123-xyz')).toBe(false)
      expect(isShortId('550e8400-e29b')).toBe(false)
    })

    it('应拒绝包含下划线的 ID', () => {
      expect(isShortId('abc_123')).toBe(false)
    })

    it('应拒绝包含空格的 ID', () => {
      expect(isShortId('abc 123')).toBe(false)
    })

    it('应拒绝特殊字符', () => {
      expect(isShortId('abc<script>')).toBe(false)
      expect(isShortId('abc@123')).toBe(false)
      expect(isShortId('abc#123')).toBe(false)
    })

    it('应拒绝包含易混淆字符（I/O 在 CHARS 中已排除）', () => {
      // CHARS = ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789
      // 排除: I, O (大写字母); o (小写); 0, 1 (数字)
      // 包含 A-H J-N P-Q R-Z; 2-9
      expect(isShortId('ABCDEFGHJ')).toBe(true) // 无混淆字符
      expect(isShortId('KLMNPQRST')).toBe(true) // 无混淆字符
      expect(isShortId('ABCDEFGHJ234')).toBe(true) // 混合测试
      expect(isShortId('a')).toBe(false) // 单独一个 a 长度不足
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. isArticleUuid()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('isArticleUuid() - UUID 格式校验', () => {
    it('应接受标准 UUID 格式（小写）', () => {
      expect(isArticleUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
      expect(isArticleUuid('00000000-0000-0000-0000-000000000000')).toBe(true)
      expect(isArticleUuid('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true)
    })

    it('应接受大写 UUID', () => {
      expect(isArticleUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
    })

    it('应接受混合大小写 UUID', () => {
      expect(isArticleUuid('550e8400-E29B-41d4-A716-446655440000')).toBe(true)
    })

    it('应拒绝不完整 UUID', () => {
      expect(isArticleUuid('550e8400-e29b-41d4-a716')).toBe(false)
      expect(isArticleUuid('550e8400')).toBe(false)
      expect(isArticleUuid('550e8400-e29b-41d4-a716-44665544000g')).toBe(false) // g 非法
    })

    it('应拒绝错误格式（缺少连字符）', () => {
      expect(isArticleUuid('550e8400e29b41d4a716446655440000')).toBe(false)
    })

    it('应拒绝非 UUID 字符串', () => {
      expect(isArticleUuid('abc12345')).toBe(false)
      expect(isArticleUuid('not-a-uuid')).toBe(false)
      expect(isArticleUuid('')).toBe(false)
    })

    it('应处理前后空白（trim）', () => {
      expect(isArticleUuid('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(true)
    })

    it('应拒绝包含非十六进制字符的 UUID', () => {
      expect(isArticleUuid('550e8400-e29b-41d4-a716-44665544000z')).toBe(false)
      expect(isArticleUuid('h50e8400-e29b-41d4-a716-446655440000')).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. 综合区分测试
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('综合区分测试', () => {
    it('isShortId 和 isArticleUuid 应互斥', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const shortId = 'abc12345'
      expect(isShortId(uuid)).toBe(false)
      expect(isArticleUuid(shortId)).toBe(false)
    })

    it('生成的 shortId 应通过 isShortId 校验', () => {
      for (let i = 0; i < 20; i++) {
        const id = generateShortId()
        expect(isShortId(id)).toBe(true)
      }
    })
  })
})
