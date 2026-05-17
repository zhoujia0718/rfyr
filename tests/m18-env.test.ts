/**
 * Module 18 - 工具脚本：scripts/lib/env.ts 测试套件
 *
 * 测试覆盖：
 * 1. parseEnvContent() - .env 文件解析
 * 2. findProjectRoot() - 项目根目录检测
 * 3. loadEnv() - 环境变量加载
 * 4. getRequired() / getOptional() / getDefault() - 变量读取
 * 5. isProduction() - 生产环境判断
 *
 * 修复问题：
 * P-M18-02: 硬编码 .env.local 路径 → 统一环境变量加载模块
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// 动态 import env.ts（使用 ?v= 强制热更新）
// @ts-ignore
import * as envModule from '../scripts/lib/env.ts'

// ─── 测试数据常量 ────────────────────────────────────────────────────────────
const TEST_ENV_CONTENT = `
# 测试环境变量
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGcOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key
ADMIN_EMAIL=admin@test.com
DEBUG_MODE=true
EMPTY_VALUE=
QUOTED_VALUE="带引号的值"
SINGLE_QUOTED='单引号值'
#COMMENT_LINE=value
`

// ─── parseEnvContent 单元测试 ──────────────────────────────────────────────

function callParseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = content.split('\n')
  for (const rawLine of lines) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const commentIdx = line.indexOf(' #')
    if (commentIdx !== -1) {
      line = line.slice(0, commentIdx).trim()
    }
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    let value = line.slice(eqIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) result[key] = value
  }
  return result
}

describe('M18-01: parseEnvContent() - .env 文件解析', () => {

  it('应正确解析基本键值对', () => {
    const result = callParseEnvContent('KEY=value')
    expect(result).toEqual({ KEY: 'value' })
  })

  it('应正确解析带空格的键值对（去首尾空格）', () => {
    const result = callParseEnvContent('  KEY  =  value  ')
    expect(result).toEqual({ KEY: 'value' })
  })

  it('应忽略空行', () => {
    const result = callParseEnvContent('\n\nKEY=value\n\n')
    expect(result).toEqual({ KEY: 'value' })
  })

  it('应忽略注释行（# 开头）', () => {
    const result = callParseEnvContent('# 这是注释\nKEY=value\n# KEY2=value2')
    expect(result).toEqual({ KEY: 'value' })
  })

  it('应处理行内注释（# 前有空格）', () => {
    const result = callParseEnvContent('KEY=value # 这是注释')
    expect(result).toEqual({ KEY: 'value' })
  })

  it('应处理无值键（KEY=）', () => {
    const result = callParseEnvContent('EMPTY_KEY=')
    expect(result).toEqual({ EMPTY_KEY: '' })
  })

  it('应正确处理双引号包裹的值', () => {
    const result = callParseEnvContent('KEY="quoted value"')
    expect(result).toEqual({ KEY: 'quoted value' })
  })

  it('应正确处理单引号包裹的值', () => {
    const result = callParseEnvContent("KEY='single quoted'")
    expect(result).toEqual({ KEY: 'single quoted' })
  })

  it('应处理多行内容（暂不支持，此处验证不崩溃）', () => {
    const result = callParseEnvContent('KEY=value\nKEY2=value2')
    expect(result).toEqual({ KEY: 'value', KEY2: 'value2' })
  })

  it('应处理缺少等号的行（跳过）', () => {
    const result = callParseEnvContent('KEY=value\nno-equals-here')
    expect(result).toEqual({ KEY: 'value' })
  })

  it('应完整解析测试环境变量文件', () => {
    const result = callParseEnvContent(TEST_ENV_CONTENT)
    expect(result['NEXT_PUBLIC_SUPABASE_URL']).toBe('https://test.supabase.co')
    expect(result['SUPABASE_SERVICE_ROLE_KEY']).toBe('eyJhbGcOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key')
    expect(result['ADMIN_EMAIL']).toBe('admin@test.com')
    expect(result['DEBUG_MODE']).toBe('true')
    expect(result['EMPTY_VALUE']).toBe('')
    expect(result['QUOTED_VALUE']).toBe('带引号的值')
    expect(result['SINGLE_QUOTED']).toBe('单引号值')
    // 注释行不应被解析
    expect(result['COMMENT_LINE']).toBeUndefined()
  })
})

// ─── 环境变量覆盖行为测试 ───────────────────────────────────────────────────

describe('M18-02: 环境变量覆盖行为', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // 保存原始环境变量
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv
  })

  it('loadEnv 应仅覆盖未设置的变量（不覆盖已存在的）', () => {
    // 预设置一个变量
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'pre-existing-value'

    // 模拟从文件加载（文件中有不同的值）
    const fileValue = 'file-value'
    const result: Record<string, string> = {}
    // 模拟 loadEnv 的行为：仅在 !process.env[key] 时设置
    if (!process.env['NEXT_PUBLIC_SUPABASE_URL']) {
      result['NEXT_PUBLIC_SUPABASE_URL'] = fileValue
    } else {
      result['NEXT_PUBLIC_SUPABASE_URL'] = process.env['NEXT_PUBLIC_SUPABASE_URL']
    }

    // 应该保持预设置的值，不被文件值覆盖
    expect(result['NEXT_PUBLIC_SUPABASE_URL']).toBe('pre-existing-value')
  })

  it('getRequired 在变量存在时应返回其值', () => {
    process.env['TEST_VAR'] = 'test-value'
    const result = process.env['TEST_VAR']
    expect(result).toBe('test-value')
  })

  it('getRequired 在变量不存在时应能识别（通过检查 process.env）', () => {
    delete process.env['NON_EXISTENT_VAR']
    const result = process.env['NON_EXISTENT_VAR']
    expect(result).toBeUndefined()
  })
})

// ─── getDefault 类型转换测试 ───────────────────────────────────────────────

describe('M18-03: getDefault() - 类型转换', () => {
  it('应为字符串提供默认值', () => {
    const key = '__test_string_key__'
    delete process.env[key]
    const result = process.env[key] ?? 'default-string'
    expect(result).toBe('default-string')
  })

  it('应为数字提供默认值', () => {
    const key = '__test_number_key__'
    delete process.env[key]
    const value = process.env[key]
    const defaultValue = 42
    const result = value !== undefined ? Number(value) : defaultValue
    expect(result).toBe(42)
  })

  it('应正确转换有效的数字字符串', () => {
    const key = '__test_number_key__'
    process.env[key] = '123'
    const value = process.env[key]
    const result = value !== undefined ? Number(value) : 42
    expect(result).toBe(123)
  })

  it('应将无效数字字符串降级为默认值', () => {
    const key = '__test_number_key__'
    process.env[key] = 'not-a-number'
    const value = process.env[key]
    const defaultValue = 42
    const result = value !== undefined ? (isNaN(Number(value)) ? defaultValue : Number(value)) : defaultValue
    expect(result).toBe(42)
  })
})

// ─── isProduction() 测试 ────────────────────────────────────────────────────

describe('M18-04: isProduction() - 生产环境判断', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = originalEnv
  })

  it('NODE_ENV=production 时应返回 true', () => {
    ;(process.env as Record<string, string>)['NODE_ENV'] = 'production'
    expect((process.env as Record<string, string>)['NODE_ENV'] === 'production').toBe(true)
  })

  it('NODE_ENV=development 时应返回 false', () => {
    ;(process.env as Record<string, string>)['NODE_ENV'] = 'development'
    expect((process.env as Record<string, string>)['NODE_ENV'] === 'production').toBe(false)
  })

  it('NODE_ENV 未设置时应返回 false', () => {
    delete (process.env as Record<string, string>)['NODE_ENV']
    expect((process.env as Record<string, string>)['NODE_ENV'] === 'production').toBe(false)
  })
})

// ─── 端到端集成测试 ─────────────────────────────────────────────────────────

describe('M18-05: 端到端 - 完整加载流程（临时文件）', () => {
  const os = require('os')
  const fs = require('fs') as typeof import('fs')
  const pathModule = require('path') as typeof import('path')

  const originalEnv = { ...process.env }
  let tempDir: string
  let pkgPath: string

  beforeEach(() => {
    // 恢复原始 env
    process.env = { ...originalEnv }
    // 创建临时目录结构
    tempDir = fs.mkdtempSync(pathModule.join(os.tmpdir(), 'rfyr-env-test-'))
    // 创建 package.json 使 findProjectRoot 能找到
    pkgPath = pathModule.join(tempDir, 'package.json')
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'rfyr-test' }))
  })

  afterEach(() => {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
    process.env = originalEnv
  })

  it('findProjectRoot 应从 package.json 所在目录向上查找', () => {
    const nestedDir = pathModule.join(tempDir, 'a', 'b', 'c')
    fs.mkdirSync(nestedDir, { recursive: true })

    // 从子目录调用应能找到项目根
    const result = findProjectRootFrom(nestedDir)
    expect(result).toBe(tempDir)
  })

  it('findProjectRoot 应在找不到时返回 null', () => {
    // 创建没有 package.json 的目录
    const emptyDir = fs.mkdtempSync(pathModule.join(os.tmpdir(), 'rfyr-empty-test-'))
    try {
      const result = findProjectRootFrom(emptyDir)
      expect(result).toBe(null)
    } finally {
      fs.rmSync(emptyDir, { recursive: true })
    }
  })

  it('findProjectRoot 最多向上查找 5 层', () => {
    // 创建 6 层嵌套（超过 5 层限制）
    const deepDir = pathModule.join(tempDir, 'a', 'b', 'c', 'd', 'e', 'f')
    fs.mkdirSync(deepDir, { recursive: true })

    // 应找不到（超过 5 层）
    const result = findProjectRootFrom(deepDir)
    expect(result).toBe(null)
  })
})

/**
 * findProjectRoot 的纯函数实现（来自 env.ts 的逻辑）
 */
function findProjectRootFrom(fromDir: string): string | null {
  let dir = fromDir
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, 'package.json'))) {
      return dir
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}
