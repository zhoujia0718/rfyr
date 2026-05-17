import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateFakeToken, getUserIdFromBearer } from '@/lib/server-auth-user'
import type { NextRequest } from 'next/server'

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } }, error: null })),
    },
  })),
}))

// Helper to create mock NextRequest
function createMockRequest(auth?: string, userId?: string): NextRequest {
  const headers = new Headers()
  if (auth) headers.set('authorization', auth)
  if (userId) headers.set('x-user-id', userId)
  return new Request('http://localhost/api', { headers }) as unknown as NextRequest
}

describe('server-auth-user', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateFakeToken', () => {
    it('returns a string starting with "fake_" + userId + pipe when HMAC_SECRET is set', () => {
      const token = generateFakeToken('user-abc')
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token!.startsWith('fake_user-abc|')).toBe(true)
    })

    it('contains 64-char hex signature', () => {
      const token = generateFakeToken('user-xyz')
      expect(token).toBeTruthy()
      const parts = token!.split('|')
      expect(parts.length).toBe(3)
      expect(parts[2].length).toBe(64) // SHA256 hex signature
    })

    it('accepts custom expiry time', () => {
      const token = generateFakeToken('user-123', 3600)
      expect(token).toBeTruthy()
      expect(token!.startsWith('fake_user-123|')).toBe(true)
    })

    it('generates different tokens for different users', () => {
      const token1 = generateFakeToken('user-1')
      const token2 = generateFakeToken('user-2')
      expect(token1).not.toBe(token2)
    })
  })

  describe('getUserIdFromBearer', () => {
    it('returns null when no Authorization header', async () => {
      const request = createMockRequest()
      const userId = await getUserIdFromBearer(request)
      expect(userId).toBeNull()
    })

    it('returns null for invalid Authorization format', async () => {
      const request = createMockRequest('InvalidFormat token123')
      const userId = await getUserIdFromBearer(request)
      expect(userId).toBeNull()
    })

    it('extracts user id from real Supabase token', async () => {
      const request = createMockRequest('Bearer real-supabase-token')
      const userId = await getUserIdFromBearer(request)
      expect(userId).toBe('user-123')
    })

    it('returns null for fake token without x-user-id header', async () => {
      const token = generateFakeToken('fake-user-789')
      expect(token).toBeTruthy()

      // Only provide bearer token, no x-user-id
      const request = createMockRequest(`Bearer ${token}`)
      const userId = await getUserIdFromBearer(request)
      expect(userId).toBeNull()
    })

    it('returns null for fake token with mismatched user id in header', async () => {
      const token = generateFakeToken('real-user')
      expect(token).toBeTruthy()

      // Provide wrong user id in header
      const request = createMockRequest(`Bearer ${token}`, 'wrong-user')
      const userId = await getUserIdFromBearer(request)
      expect(userId).toBeNull()
    })
  })
})
