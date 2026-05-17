import { describe, it, expect, beforeEach } from 'vitest'
import {
  getPdfOriginalNameKey,
  getHtmlOriginalNameKey,
  getStoredPdfOriginalName,
  setStoredPdfOriginalName,
  getStoredHtmlOriginalName,
  setStoredHtmlOriginalName,
  cleanupExpiredStorage,
} from '../lib/storage-utils'
import { LOCAL_STORAGE_KEYS } from '../lib/constants'

let mockStorage: Record<string, string> = {}

function setupStorageMock() {
  mockStorage = {}
  Object.defineProperty(global, 'localStorage', {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value },
      removeItem: (key: string) => { delete mockStorage[key] },
      key: (index: number) => Object.keys(mockStorage)[index] ?? null,
      get length() { return Object.keys(mockStorage).length },
      clear: () => { mockStorage = {} },
    },
    writable: true,
  })
}

describe('storage-utils', () => {
  beforeEach(() => {
    setupStorageMock()
  })

  describe('getPdfOriginalNameKey', () => {
    it('should return correct key for given articleId', () => {
      const articleId = 'abc123'
      const key = getPdfOriginalNameKey(articleId)
      expect(key).toBe(`${LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME}abc123`)
    })

    it('should include the correct prefix', () => {
      const key = getPdfOriginalNameKey('test')
      expect(key).toContain(LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME)
    })
  })

  describe('getHtmlOriginalNameKey', () => {
    it('should return correct key for given articleId', () => {
      const articleId = 'xyz789'
      const key = getHtmlOriginalNameKey(articleId)
      expect(key).toBe(`${LOCAL_STORAGE_KEYS.HTML_ORIGINAL_NAME}xyz789`)
    })

    it('should include the correct prefix', () => {
      const key = getHtmlOriginalNameKey('test')
      expect(key).toContain(LOCAL_STORAGE_KEYS.HTML_ORIGINAL_NAME)
    })
  })

  describe('getStoredPdfOriginalName', () => {
    it('should return null when no value is stored', () => {
      const result = getStoredPdfOriginalName('article1', 'http://example.com')
      expect(result).toBeNull()
    })

    it('should return stored value when key exists', () => {
      const articleId = 'article1'
      const originalName = 'test-document.pdf'
      setStoredPdfOriginalName(articleId, originalName)

      const result = getStoredPdfOriginalName(articleId, 'http://example.com')
      expect(result).toBe(originalName)
    })

    it('should migrate from URL key if articleId key does not exist', () => {
      const articleId = 'article1'
      const url = 'http://example.com/article'
      const originalName = 'old-document.pdf'

      // Set value using URL key (old format)
      const urlKey = `${LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME}${url}`
      mockStorage[urlKey] = originalName

      // Should return value and migrate to new format
      const result = getStoredPdfOriginalName(articleId, url)
      expect(result).toBe(originalName)

      // Should also be accessible via articleId key now
      const newKey = getPdfOriginalNameKey(articleId)
      expect(mockStorage[newKey]).toBe(originalName)

      // Old URL key should be removed
      expect(mockStorage[urlKey]).toBeUndefined()
    })
  })

  describe('setStoredPdfOriginalName', () => {
    it('should store value in localStorage', () => {
      const articleId = 'article1'
      const originalName = 'test.pdf'

      setStoredPdfOriginalName(articleId, originalName)

      const key = getPdfOriginalNameKey(articleId)
      expect(mockStorage[key]).toBe(originalName)
    })

    it('should overwrite existing value', () => {
      const articleId = 'article1'
      setStoredPdfOriginalName(articleId, 'first.pdf')
      setStoredPdfOriginalName(articleId, 'second.pdf')

      const key = getPdfOriginalNameKey(articleId)
      expect(mockStorage[key]).toBe('second.pdf')
    })
  })

  describe('getStoredHtmlOriginalName', () => {
    it('should return null when no value is stored', () => {
      const result = getStoredHtmlOriginalName('article1', 'http://example.com')
      expect(result).toBeNull()
    })

    it('should return stored value when key exists', () => {
      const articleId = 'article1'
      const originalName = 'test-document.html'
      setStoredHtmlOriginalName(articleId, originalName)

      const result = getStoredHtmlOriginalName(articleId, 'http://example.com')
      expect(result).toBe(originalName)
    })

    it('should migrate from URL key if articleId key does not exist', () => {
      const articleId = 'article1'
      const url = 'http://example.com/article'
      const originalName = 'old-document.html'

      // Set value using URL key (old format)
      const urlKey = `${LOCAL_STORAGE_KEYS.HTML_ORIGINAL_NAME}${url}`
      mockStorage[urlKey] = originalName

      // Should return value and migrate to new format
      const result = getStoredHtmlOriginalName(articleId, url)
      expect(result).toBe(originalName)

      // Should also be accessible via articleId key now
      const newKey = getHtmlOriginalNameKey(articleId)
      expect(mockStorage[newKey]).toBe(originalName)

      // Old URL key should be removed
      expect(mockStorage[urlKey]).toBeUndefined()
    })
  })

  describe('setStoredHtmlOriginalName', () => {
    it('should store value in localStorage', () => {
      const articleId = 'article1'
      const originalName = 'test.html'

      setStoredHtmlOriginalName(articleId, originalName)

      const key = getHtmlOriginalNameKey(articleId)
      expect(mockStorage[key]).toBe(originalName)
    })

    it('should overwrite existing value', () => {
      const articleId = 'article1'
      setStoredHtmlOriginalName(articleId, 'first.html')
      setStoredHtmlOriginalName(articleId, 'second.html')

      const key = getHtmlOriginalNameKey(articleId)
      expect(mockStorage[key]).toBe('second.html')
    })
  })

  describe('cleanupExpiredStorage', () => {
    it('should not remove valid keys', () => {
      const articleId = 'article1'
      setStoredPdfOriginalName(articleId, 'valid.pdf')
      setStoredHtmlOriginalName(articleId, 'valid.html')

      cleanupExpiredStorage()

      expect(getStoredPdfOriginalName(articleId, '')).toBe('valid.pdf')
      expect(getStoredHtmlOriginalName(articleId, '')).toBe('valid.html')
    })

    it('should remove old-format keys containing http', () => {
      const urlKey = `${LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME}http://example.com/file.pdf`
      mockStorage[urlKey] = 'old.pdf'

      cleanupExpiredStorage()

      expect(mockStorage[urlKey]).toBeUndefined()
    })

    it('should remove old-format keys containing storage', () => {
      const urlKey = `${LOCAL_STORAGE_KEYS.HTML_ORIGINAL_NAME}https://storage.example.com/file.html`
      mockStorage[urlKey] = 'old.html'

      cleanupExpiredStorage()

      expect(mockStorage[urlKey]).toBeUndefined()
    })

    it('should remove multiple expired keys', () => {
      const pdfHttpKey = `${LOCAL_STORAGE_KEYS.PDF_ORIGINAL_NAME}http://test.com/file.pdf`
      const htmlStorageKey = `${LOCAL_STORAGE_KEYS.HTML_ORIGINAL_NAME}https://storage.test.com/file.html`

      mockStorage[pdfHttpKey] = 'old1.pdf'
      mockStorage[htmlStorageKey] = 'old2.html'

      cleanupExpiredStorage()

      expect(mockStorage[pdfHttpKey]).toBeUndefined()
      expect(mockStorage[htmlStorageKey]).toBeUndefined()
    })

    it('should only check keys with correct prefix', () => {
      const unrelatedKey = 'some_other_key'
      mockStorage[unrelatedKey] = 'value'

      cleanupExpiredStorage()

      expect(mockStorage[unrelatedKey]).toBe('value')
    })
  })
})
