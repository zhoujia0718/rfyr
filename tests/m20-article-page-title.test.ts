import { describe, it, expect } from 'vitest'
import {
  articlePageTitleClassName,
} from '../lib/article-page-title'

describe('articlePageTitle', () => {
  describe('articlePageTitleClassName', () => {
    it('should be exported', () => {
      expect(articlePageTitleClassName).toBeDefined()
    })

    it('should be a non-empty string', () => {
      expect(typeof articlePageTitleClassName).toBe('string')
      expect(articlePageTitleClassName.length).toBeGreaterThan(0)
    })

    it('should contain expected CSS classes', () => {
      expect(articlePageTitleClassName).toContain('text-balance')
      expect(articlePageTitleClassName).toContain('text-base')
      expect(articlePageTitleClassName).toContain('font-medium')
      expect(articlePageTitleClassName).toContain('leading-relaxed')
      expect(articlePageTitleClassName).toContain('tracking-[-0.015em]')
    })

    it('should contain light mode color class', () => {
      expect(articlePageTitleClassName).toContain('text-[#3d4f5f]')
    })

    it('should contain responsive font size classes', () => {
      expect(articlePageTitleClassName).toContain('sm:text-[1.0625rem]')
      expect(articlePageTitleClassName).toContain('md:text-[1.1875rem]')
    })

    it('should contain dark mode class', () => {
      expect(articlePageTitleClassName).toContain('dark:')
      expect(articlePageTitleClassName).toContain('dark:text-[#93c5fd]')
    })
  })
})
