import { describe, it, expect, afterEach } from 'vitest'
import { createSupabaseAdminClient } from '../lib/supabase-admin'

describe('supabase-admin', () => {
  describe('createSupabaseAdminClient', () => {
    it('should return a non-null object when env vars are set', () => {
      const client = createSupabaseAdminClient()
      expect(client).not.toBeNull()
      expect(typeof client).toBe('object')
    })

    it('should return a client with expected methods', () => {
      const client = createSupabaseAdminClient()
      expect(client).toHaveProperty('from')
      expect(client).toHaveProperty('auth')
      expect(typeof client.from).toBe('function')
      expect(typeof client.auth).toBe('object')
    })

    it('should throw error when NEXT_PUBLIC_SUPABASE_URL is missing', () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey

      expect(() => createSupabaseAdminClient()).toThrow(
        'Missing NEXT_PUBLIC_SUPABASE_URL'
      )

      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    })

    it('should throw error when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      expect(() => createSupabaseAdminClient()).toThrow(
        'Missing SUPABASE_SERVICE_ROLE_KEY'
      )

      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
    })

    it('should throw error when both env vars are missing', () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      expect(() => createSupabaseAdminClient()).toThrow()

      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
    })

    it('should create a new client instance on each call', () => {
      const client1 = createSupabaseAdminClient()
      const client2 = createSupabaseAdminClient()
      expect(client1).not.toBe(client2)
    })
  })
})
