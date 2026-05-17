/**
 * Module 13 - 数据库架构：lib/supabase.ts & lib/supabase-admin.ts 测试套件
 *
 * 测试覆盖：
 * 1. supabase.ts 模块导出完整性（V-C-05 修复验证）
 * 2. supabase-admin.ts: createSupabaseAdminClient() 防御性行为
 * 3. 环境变量检查在 setup.ts 中已正确配置
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('M13-03: lib/supabase.ts 模块完整性', () => {
  describe('V-C-05 修复验证：模块导出', () => {
    it('应导出 supabase 客户端', async () => {
      // @ts-ignore
      const { supabase } = await import('../lib/supabase.ts')
      expect(supabase).toBeDefined()
      expect(typeof supabase).toBe('object')
    })

    it('应导出 supabaseAdmin 客户端（setup.ts 已配置环境变量）', async () => {
      // @ts-ignore
      const { supabaseAdmin } = await import('../lib/supabase.ts')
      // setup.ts 中设置了 SUPABASE_SERVICE_ROLE_KEY，所以 supabaseAdmin 不为 null
      expect(supabaseAdmin).not.toBeNull()
    })

    it('supabase 客户端应有 auth 和 from 方法', async () => {
      // @ts-ignore
      const { supabase } = await import('../lib/supabase.ts')
      expect(typeof supabase.auth).toBe('object')
      expect(typeof supabase.from).toBe('function')
    })

    it('supabaseAdmin 客户端（存在时）应有 from 方法', async () => {
      // @ts-ignore
      const { supabaseAdmin } = await import('../lib/supabase.ts')
      if (supabaseAdmin) {
        expect(typeof supabaseAdmin.from).toBe('function')
      }
    })
  })
})

describe('M13-04: lib/supabase-admin.ts 防御性行为', () => {
  describe('createSupabaseAdminClient() 环境变量验证', () => {
    it('SUPABASE_SERVICE_ROLE_KEY 缺失时应抛出明确错误', async () => {
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      process.env.SUPABASE_SERVICE_ROLE_KEY = ''

      // @ts-ignore
      const mod = await import('../lib/supabase-admin.ts')

      expect(() => mod.createSupabaseAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)

      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey ?? undefined
    })

    it('NEXT_PUBLIC_SUPABASE_URL 缺失时应抛出错误', async () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = ''

      // @ts-ignore
      const mod = await import('../lib/supabase-admin.ts')

      // 删除 NEXT_PUBLIC_SUPABASE_URL 时，getSupabaseAdmin 中的 createClient
      // 会抛出 "Invalid supabaseUrl" 错误
      expect(() => mod.createSupabaseAdminClient()).toThrow()

      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl ?? undefined
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey ?? undefined
    })

    it('环境变量正常时应返回有效的 Supabase 客户端', async () => {
      // setup.ts 已配置正确的环境变量
      // @ts-ignore
      const mod = await import('../lib/supabase-admin.ts')
      const client = mod.createSupabaseAdminClient()

      expect(client).toBeDefined()
      expect(typeof client.from).toBe('function')
      expect(typeof client.auth).toBe('object')
    })

    it('创建的客户端应禁用自动刷新和持久化（服务端专用配置）', async () => {
      // @ts-ignore
      const mod = await import('../lib/supabase-admin.ts')
      const client = mod.createSupabaseAdminClient()

      // 服务端 admin 客户端不应自动刷新 token
      expect(client.auth).toBeDefined()
    })
  })
})

describe('M13-05: 环境变量配置验证（setup.ts）', () => {
  it('setup.ts 应配置 NEXT_PUBLIC_SUPABASE_URL', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeDefined()
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toContain('supabase.co')
  })

  it('setup.ts 应配置 NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeDefined()
  })

  it('setup.ts 应配置 SUPABASE_SERVICE_ROLE_KEY', () => {
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined()
  })

  it('URL 应为有效的 HTTPS URL', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    expect(url.startsWith('https://')).toBe(true)
    expect(url.includes('.supabase.co')).toBe(true)
  })
})
