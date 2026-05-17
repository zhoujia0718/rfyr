import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Date fake timer check', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z').getTime())
  })
  afterEach(() => { vi.useRealTimers() })

  it('new Date() should match setSystemTime', () => {
    const d = new Date()
    console.log('new Date():', d.toISOString())
    expect(d.toISOString()).toBe('2026-04-20T12:00:00.000Z')
  })
})
