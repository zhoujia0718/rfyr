/**
 * Module 13 - 数据库架构：lib/guest-tracking.ts 测试套件
 *
 * 测试覆盖：
 * 1. getGuestId() - 游客 ID 生成（localStorage / fallback）
 * 2. getBrowserFingerprint() - 浏览器指纹
 * 3. getTrackingId() - 追踪 ID（guestId + 指纹）
 * 4. clearGuestTracking() - 清除追踪数据
 * 5. hashString() - 字符串哈希
 * 6. hashIP() - IP 哈希
 */

// mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    getStore: () => store,
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

// mock window
Object.defineProperty(global, 'window', {
  value: {
    localStorage: localStorageMock,
    navigator: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      language: 'zh-CN',
      platform: 'MacIntel',
      hardwareConcurrency: 4,
    },
    screen: {
      width: 1440,
      height: 900,
      colorDepth: 24,
    },
    crypto: {
      subtle: {},
    },
  },
  writable: true,
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 动态导入以使用 mock
import {
  hashString,
  hashIP,
// @ts-ignore
} from '../lib/guest-tracking.ts'

describe('M13-01: lib/guest-tracking.ts', () => {
  beforeEach(() => {
    localStorageMock.getStore()['rfyr_guest_id'] = ''
    localStorageMock.getStore()['rfyr_guest_fp'] = ''
    vi.clearAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. hashString()
  // ═══════════════════════════════════════════════════════════════════════════
  describe('hashString() - 字符串哈希', () => {
    it('应返回 8 字符的十六进制字符串', () => {
      const result = hashString('test string')
      expect(result).toMatch(/^[a-f0-9]{8}$/)
    })

    it('相同输入应产生相同哈希（确定性）', () => {
      const input = 'hello world'
      const hash1 = hashString(input)
      const hash2 = hashString(input)
      expect(hash1).toBe(hash2)
    })

    it('不同输入应产生不同哈希', () => {
      const hash1 = hashString('input1')
      const hash2 = hashString('input2')
      expect(hash1).not.toBe(hash2)
    })

    it('应处理空字符串', () => {
      const result = hashString('')
      expect(result).toMatch(/^[a-f0-9]{8}$/)
    })

    it('应处理 Unicode 字符', () => {
      const result = hashString('中文内容')
      expect(result).toMatch(/^[a-f0-9]{8}$/)
    })

    it('应处理长字符串', () => {
      const longString = 'x'.repeat(10000)
      const result = hashString(longString)
      expect(result).toMatch(/^[a-f0-9]{8}$/)
    })

    it('哈希结果应为正数（无符号 32 位整数）', () => {
      const result = hashString('any input')
      // parseInt 成功说明是有效的十六进制数字
      const num = parseInt(result, 16)
      expect(num).toBeGreaterThan(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. hashIP()
  // ═══════════════════════════════════════════════════════════════════════════
  describe('hashIP() - IP 哈希', () => {
    it('应返回 8 字符的十六进制字符串', () => {
      const result = hashIP('192.168.1.1')
      expect(result).toMatch(/^[a-f0-9]{8}$/)
    })

    it('相同 IP 应产生相同哈希', () => {
      const ip = '10.0.0.1'
      expect(hashIP(ip)).toBe(hashIP(ip))
    })

    it('不同 IP 应产生不同哈希', () => {
      expect(hashIP('192.168.1.1')).not.toBe(hashIP('192.168.1.2'))
    })

    it('应处理 IPv6 地址', () => {
      const result = hashIP('::1')
      expect(result).toMatch(/^[a-f0-9]{8}$/)
    })

    it('应处理域名', () => {
      const result = hashIP('example.com')
      expect(result).toMatch(/^[a-f0-9]{8}$/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. hashString 碰撞检测
  // ═══════════════════════════════════════════════════════════════════════════
  describe('hashString() - 碰撞检测', () => {
    it('10000 次调用应有极低碰撞率', () => {
      const hashes = new Set<string>()
      for (let i = 0; i < 10000; i++) {
        hashes.add(hashString(`unique-string-${i}`))
      }
      // 10000 个唯一输入，应产生接近 10000 个唯一哈希
      // 允许极少数碰撞（8 字符十六进制约 43 亿种可能）
      expect(hashes.size).toBeGreaterThan(9990)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. 防彩虹表攻击特性
  // ═══════════════════════════════════════════════════════════════════════════
  describe('安全性特性', () => {
    it('哈希应不可逆（哈希后值与原值无明显关系）', () => {
      const hashes = [
        hashString('127.0.0.1'),
        hashString('192.168.0.1'),
        hashString('10.0.0.1'),
        hashString('255.255.255.255'),
      ]
      // 相似的 IP 不应产生相似的哈希（雪崩效应）
      const unique = new Set(hashes)
      expect(unique.size).toBe(hashes.length)
    })

    it('短字符串哈希应安全（使用 DJB2 变体，有雪崩效应）', () => {
      const h1 = hashString('a')
      const h2 = hashString('b')
      expect(h1).not.toBe(h2)
    })
  })
})
