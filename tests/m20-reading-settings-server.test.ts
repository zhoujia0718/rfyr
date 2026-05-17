import { describe, it, expect, vi } from 'vitest'
import { clearSettingsCache } from '@/lib/reading-settings-server'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { revalidatePath } from 'next/cache'

describe('reading-settings-server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('clearSettingsCache', () => {
    it('calls revalidatePath with /api/reading-settings', () => {
      clearSettingsCache()
      expect(revalidatePath).toHaveBeenCalledWith('/api/reading-settings')
    })

    it('calls revalidatePath with / and layout kind', () => {
      clearSettingsCache()
      expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    })

    it('can be called multiple times', () => {
      expect(() => {
        clearSettingsCache()
        clearSettingsCache()
        clearSettingsCache()
      }).not.toThrow()
    })

    it('revalidates in correct order', () => {
      clearSettingsCache()
      expect(revalidatePath).toHaveBeenCalledTimes(2)
      expect(revalidatePath).toHaveBeenNthCalledWith(1, '/api/reading-settings')
      expect(revalidatePath).toHaveBeenNthCalledWith(2, '/', 'layout')
    })
  })
})
