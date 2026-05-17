import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  captureReferrerFromUrl,
  getStoredReferrerCode,
  clearStoredReferrerCode,
  buildShareUrlWithReferrer,
} from '@/lib/referral-client'

// Mock @/lib/supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { code: 'REF123' }, error: null })),
        })),
      })),
    })),
  },
}))

// Mock localStorage
let mockStorage: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key]
  }),
  clear: vi.fn(() => {
    mockStorage = {}
  }),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStorage = {}

  // Setup window and localStorage mocks
  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })

  Object.defineProperty(global, 'window', {
    value: {
      localStorage: localStorageMock,
      location: { search: '' },
    },
    writable: true,
    configurable: true,
  })
})

describe('referral-client', () => {
  describe('captureReferrerFromUrl', () => {
    it('returns null when no ref param in URL', () => {
      Object.defineProperty(global, 'window', {
        value: {
          localStorage: localStorageMock,
          location: { search: '' },
        },
        writable: true,
        configurable: true,
      })

      const result = captureReferrerFromUrl()
      expect(result).toBeNull()
    })

    it('returns CODE123 and stores in localStorage when ?ref=CODE123', () => {
      Object.defineProperty(global, 'window', {
        value: {
          localStorage: localStorageMock,
          location: { search: '?ref=a1b2c3d4' },
        },
        writable: true,
        configurable: true,
      })

      const result = captureReferrerFromUrl()
      expect(result).toBe('a1b2c3d4')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('rfyr_referrer_code', 'a1b2c3d4')
    })

    it('captures article ID from URL path /notes/abc123', () => {
      Object.defineProperty(global, 'window', {
        value: {
          localStorage: localStorageMock,
          location: { search: '?ref=deadbeef', pathname: '/notes/abc123' },
        },
        writable: true,
        configurable: true,
      })

      const result = captureReferrerFromUrl()
      expect(result).toBe('deadbeef')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('rfyr_referrer_article', 'abc123')
    })

    it('returns null on server-side (no window)', () => {
      Object.defineProperty(global, 'window', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const result = captureReferrerFromUrl()
      expect(result).toBeNull()
    })
  })

  describe('getStoredReferrerCode', () => {
    it('returns stored code from localStorage', () => {
      // Use the actual key: rfyr_referrer_code
      mockStorage['rfyr_referrer_code'] = 'STORED123'
      const result = getStoredReferrerCode()
      expect(result).toBe('STORED123')
    })

    it('returns null when no stored code', () => {
      const result = getStoredReferrerCode()
      expect(result).toBeNull()
    })
  })

  describe('clearStoredReferrerCode', () => {
    it('removes stored referrer code', () => {
      clearStoredReferrerCode()
      // Actual key is rfyr_referrer_code
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('rfyr_referrer_code')
    })
  })

  describe('buildShareUrlWithReferrer', () => {
    it('returns URL with ref param appended', () => {
      const url = buildShareUrlWithReferrer('http://example.com/page', 'CODE123')
      expect(url).toBe('http://example.com/page?ref=CODE123')
    })

    it('appends ref param to URL with existing query string', () => {
      const url = buildShareUrlWithReferrer('http://example.com/page?existing=1', 'CODE123')
      expect(url).toBe('http://example.com/page?existing=1&ref=CODE123')
    })

    it('returns original URL when code is empty string', () => {
      const url = buildShareUrlWithReferrer('http://example.com/page', '')
      expect(url).toBe('http://example.com/page')
    })

    it('returns original URL when code is whitespace only', () => {
      const url = buildShareUrlWithReferrer('http://example.com/page', '   ')
      expect(url).toBe('http://example.com/page')
    })

    it('handles URLs with hash fragments', () => {
      const url = buildShareUrlWithReferrer('http://example.com/page#section', 'HASHREF')
      expect(url).toBe('http://example.com/page?ref=HASHREF#section')
    })
  })
})
