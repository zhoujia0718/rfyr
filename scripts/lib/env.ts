/**
 * scripts/lib/env.ts
 *
 * 统一的脚本环境变量加载模块
 * 解决 P-M18-02: 硬编码 .env.local 路径问题
 *
 * 特性：
 * 1. 自动检测项目根目录（支持从 scripts/ 和项目根执行）
 * 2. 支持自定义 .env 文件路径
 * 3. 仅加载未设置的变量，避免覆盖已有环境变量
 * 4. NODE_ENV=production 时输出警告
 * 5. 提供类型安全的 getRequired() 和 getOptional()
 *
 * 使用方式：
 *   import { loadEnv, getRequired, getOptional } from './lib/env'
 *
 *   loadEnv()                              // 自动检测 .env.local
 *   loadEnv({ path: '.env.production' })   // 自定义路径
 *   loadEnv({ required: true })            // 文件不存在时抛出错误
 */

import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// 缓存已加载的环境变量
let loaded = false

export interface LoadEnvOptions {
  /** 自定义 .env 文件路径（默认为 .env.local） */
  path?: string
  /** 是否为必需文件（文件不存在时抛出错误） */
  required?: boolean
  /** 允许重复加载（默认 false，已加载则跳过） */
  allowReload?: boolean
}

/**
 * 解析 .env 文件并加载到 process.env
 * 格式：KEY=value（支持空值、多行值、引号包裹的值）
 */
function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = content.split('\n')

  for (const rawLine of lines) {
    let line = rawLine.trim()

    // 跳过空行和注释
    if (!line || line.startsWith('#')) continue

    // 移除行内注释（# 前必须有空格）
    const commentIdx = line.indexOf(' #')
    if (commentIdx !== -1) {
      line = line.slice(0, commentIdx).trim()
    }

    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue

    const key = line.slice(0, eqIdx).trim()
    let value = line.slice(eqIdx + 1).trim()

    // 去掉引号包裹
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

/**
 * 检测项目根目录（向上查找 package.json）
 */
function findProjectRoot(fromDir?: string): string | null {
  let dir = fromDir || (typeof __dirname !== 'undefined' ? __dirname : process.cwd())

  // 向上最多查找 5 层
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, 'package.json'))) {
      return dir
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break // 已到达根目录
    dir = parent
  }

  return null
}

/**
 * 加载 .env 文件到 process.env
 *
 * @param options.path 自定义 .env 文件路径
 * @param options.required 文件不存在时是否抛出错误（默认 false）
 * @param options.allowReload 是否允许重复加载（默认 false）
 */
export function loadEnv(options: LoadEnvOptions = {}): void {
  const { path: customPath, required = false, allowReload = false } = options

  if (loaded && !allowReload) return

  // 确定 .env 文件路径
  let envPath: string
  if (customPath) {
    envPath = customPath.startsWith('/') ? customPath : resolve(process.cwd(), customPath)
  } else {
    const projectRoot = findProjectRoot()
    if (!projectRoot) {
      if (required) throw new Error('[env] 无法找到项目根目录（package.json）')
      console.warn('[env] 警告: 无法找到项目根目录，跳过环境变量加载')
      return
    }
    envPath = resolve(projectRoot, '.env.local')
  }

  // 生产环境警告
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[env] ⚠️ 警告: 脚本在生产环境执行中！请确认此操作是安全的。'
    )
  }

  // 检查文件是否存在
  if (!existsSync(envPath)) {
    if (required) throw new Error(`[env] 必需的环境变量文件不存在: ${envPath}`)
    return
  }

  const content = readFileSync(envPath, 'utf-8')
  const vars = parseEnvContent(content)
  let count = 0

  for (const [key, value] of Object.entries(vars)) {
    // 仅覆盖未设置的变量
    if (!process.env[key]) {
      process.env[key] = value
      count++
    }
  }

  loaded = true
}

/**
 * 获取必需的环境变量，不存在则抛出错误
 */
export function getRequired(key: string, hint?: string): string {
  const value = process.env[key]
  if (!value) {
    const suggestion = hint ? `\n提示: ${hint}` : ''
    throw new Error(`[env] 缺少必需的环境变量: ${key}${suggestion}`)
  }
  return value
}

/**
 * 获取可选的环境变量，不存在则返回 undefined
 */
export function getOptional(key: string): string | undefined {
  return process.env[key]
}

/**
 * 获取可选的环境变量，提供默认值
 */
export function getDefault<T extends string | number>(
  key: string,
  defaultValue: T
): T {
  const value = process.env[key]
  if (value === undefined) return defaultValue
  // 类型转换
  if (typeof defaultValue === 'number') {
    const parsed = Number(value)
    return (isNaN(parsed) ? defaultValue : parsed) as T
  }
  return (value as T) || defaultValue
}

/**
 * 检查是否为生产环境
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * 强制重新加载环境变量
 */
export function reloadEnv(options: LoadEnvOptions = {}): void {
  loaded = false
  loadEnv({ ...options, allowReload: true })
}
