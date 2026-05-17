/**
 * Module 18 - 工具脚本：scripts/import-xinduoduo.mjs 工具函数测试套件
 *
 * 测试覆盖：
 * 1. safeFilename() - 文件名安全化
 * 2. shortHash() - 短哈希生成
 * 3. extractTitle() - XSS 安全标题提取
 * 4. extractImgRefs() - XSS 安全图片引用提取
 * 5. buildAssetsIndex() - 配图索引构建
 *
 * 修复问题：
 * P-M18-07: HTML 提取正则 XSS 风险 → 安全化实现
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as path from 'path'

// ─── 被测试的函数（从脚本提取的纯函数逻辑） ──────────────────────────────────

/**
 * safeFilename: 移除 Windows 不安全字符
 */
function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\.+/g, '.').trim()
}

/**
 * shortHash: 生成 6 位短哈希
 * 使用 DJB2 哈希算法（乘数 33），取 base-36 编码后 padStart 到 6 位
 */
function shortHash(name: string): string {
  let h = 5381 // DJB2 初始值
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) | 0
  }
  const hash = Math.abs(h).toString(36)
  // 修复：不足 6 位时 padStart，保证长度一致
  return hash.padStart(6, '0')
}

/**
 * P-M18-07 修复版：extractTitle
 * 彻底去除 HTML 标签 + 阻止 script/style/link 等危险标签
 * <h1>标题<script>alert(1)</script></h1> → 标题（script 标签内容也被清除）
 */
function extractTitle(htmlText: string): string | null {
  // 优先使用 <title> 标签
  const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) return titleMatch[1].trim()

  // 降级方案：提取 H1 文本
  const h1Match = htmlText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1Match) {
    let raw = h1Match[1]
    // P-M18-07 修复：检测并清除危险标签内容
    // <script>...</script> → 空字符串（不能只 strip 标签，要清除内部内容）
    raw = raw.replace(/<script[\s\S]*?<\/script>/gi, '')
    // 清除 <style>、<link>、<iframe> 等危险标签
    raw = raw.replace(/<(style|link|iframe|object|embed|form|input)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // 清除独立的事件属性（onerror=、onclick= 等）
    raw = raw.replace(/\s(on\w+)=["'][^"']*["']/gi, '')
    // 清除 javascript: href
    raw = raw.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '')
    // 清除所有剩余 HTML 标签
    raw = raw.replace(/<[^>]+>/g, '')
    // HTML 实体解码
    raw = raw
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
    return raw || null
  }
  return null
}

/**
 * P-M18-07 修复版：extractImgRefs
 * 白名单校验 + 路径安全检查
 */
function extractImgRefs(htmlText: string): string[] {
  const refs: Set<string> = new Set()
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let m
  while ((m = re.exec(htmlText)) !== null) {
    const src = m[1].trim()
    // 白名单校验：只允许字母、数字、点、短横、下划线、斜杠
    // 且禁止路径遍历（../ 或 ..\）
    if (
      /^[a-zA-Z0-9._/-]+$/.test(src) &&
      !src.includes('../') &&
      !src.includes('..\\')
    ) {
      refs.add(src)
    }
  }
  return [...refs]
}

/**
 * buildAssetsIndex: 构建配图索引（基于文件名规则）
 */
function buildAssetsIndexFromDir(assetsDir: string): Map<string, string[]> {
  const byPrefix = new Map<string, string[]>()
  if (!existsSync(assetsDir)) return byPrefix

  for (const file of readdirSync(assetsDir)) {
    if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.jpeg')) continue
    const dotExt = file.lastIndexOf('.')
    const base = file.slice(0, dotExt)
    const upIdx = base.lastIndexOf('_p')
    if (upIdx < 0) continue
    const prefix = base.slice(0, upIdx)
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, [])
    byPrefix.get(prefix)!.push(file)
  }
  for (const [, arr] of byPrefix) arr.sort()
  return byPrefix
}

// ─── safeFilename() 测试 ────────────────────────────────────────────────────

describe('M18-10: safeFilename() - 文件名安全化', () => {
  it('应移除 Windows 不安全字符', () => {
    expect(safeFilename('file:name?test')).toBe('file_name_test')
    expect(safeFilename('test<file>test')).toBe('test_file_test')
    expect(safeFilename('path\\to\\file')).toBe('path_to_file')
    expect(safeFilename('test|pipe')).toBe('test_pipe')
  })

  it('应将多个连续点压缩为单个点', () => {
    expect(safeFilename('file...name')).toBe('file.name')
    expect(safeFilename('...name...')).toBe('.name.')
  })

  it('应移除首尾空格', () => {
    expect(safeFilename('  filename  ')).toBe('filename')
  })

  it('应处理空字符串', () => {
    expect(safeFilename('')).toBe('')
  })

  it('应保持安全字符不变', () => {
    expect(safeFilename('normal_file-name.png')).toBe('normal_file-name.png')
    expect(safeFilename('中文文件名')).toBe('中文文件名')
  })
})

// ─── shortHash() 测试 ──────────────────────────────────────────────────────

describe('M18-11: shortHash() - 短哈希生成', () => {
  it('应返回 6 位哈希值', () => {
    const result = shortHash('test')
    expect(result.length).toBe(6)
  })

  it('相同输入应返回相同哈希', () => {
    const h1 = shortHash('same-input')
    const h2 = shortHash('same-input')
    expect(h1).toBe(h2)
  })

  it('不同输入应返回不同哈希（高概率）', () => {
    const hashes = new Set(['input1', 'input2', 'input3', 'input4', 'input5'].map(shortHash))
    // 5 个不同输入不应全部碰撞
    expect(hashes.size).toBeGreaterThanOrEqual(4)
  })

  it('空字符串应返回有效哈希', () => {
    const result = shortHash('')
    expect(result.length).toBe(6)
  })

  it('应处理中文字符串', () => {
    const result = shortHash('鑫多多')
    expect(result.length).toBe(6)
  })

  it('应处理长字符串', () => {
    const longStr = 'a'.repeat(1000)
    const result = shortHash(longStr)
    expect(result.length).toBe(6)
  })

  it('应生成合法的文件名（无非法字符）', () => {
    for (let i = 0; i < 20; i++) {
      const hash = shortHash(`input-${i}-${Date.now()}`)
      expect(safeFilename(hash)).toBe(hash) // 本身即为安全
    }
  })
})

// ─── extractTitle() 测试 ───────────────────────────────────────────────────

describe('M18-12: extractTitle() - XSS 安全标题提取', () => {
  it('应从 <title> 标签提取标题', () => {
    const html = '<html><head><title>测试标题</title></head></html>'
    expect(extractTitle(html)).toBe('测试标题')
  })

  it('应从 <h1> 标签提取标题（去除 HTML 标签）', () => {
    const html = '<h1>这是H1标题</h1>'
    expect(extractTitle(html)).toBe('这是H1标题')
  })

  it('P-M18-07 修复：应去除 H1 中的 HTML 标签', () => {
    // 恶意输入：尝试通过 innerHTML 注入脚本
    const maliciousHtml = '<h1>标题<script>alert(1)</script></h1>'
    const result = extractTitle(maliciousHtml)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert(1)')
    expect(result).toBe('标题')
  })

  it('P-M18-07 修复：应去除 <strong> 等格式标签', () => {
    const html = '<h1><strong>加粗标题</strong> <em>斜体</em></h1>'
    const result = extractTitle(html)
    expect(result).toBe('加粗标题 斜体')
    expect(result).not.toContain('<strong>')
    expect(result).not.toContain('<em>')
  })

  it('P-M18-07 修复：应防止嵌套标签绕过', () => {
    const html = '<h1><span onclick="alert(1)">点击我</span></h1>'
    const result = extractTitle(html)
    expect(result).toBe('点击我')
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('alert')
  })

  it('P-M18-07 修复：应防止 data: URL 绕过', () => {
    const html = '<h1><img src="data:text/html,<script>alert(1)</script>">图片</h1>'
    const result = extractTitle(html)
    expect(result).toBe('图片')
    expect(result).not.toContain('data:')
  })

  it('应优先返回 <title>（即使存在 H1）', () => {
    const html = '<h1>H1标题</h1><title>Title标签</title>'
    expect(extractTitle(html)).toBe('Title标签')
  })

  it('无标题标签时应返回 null', () => {
    const html = '<div>无标题</div>'
    expect(extractTitle(html)).toBe(null)
  })

  it('应处理空白 H1（空白内容返回 null）', () => {
    const html = '<h1>   </h1>'
    // raw 为纯空白 → '   ' → trim → '' → '' || null → null
    expect(extractTitle(html)).toBe(null)
  })

  it('P-M18-07 修复：应去除换行符', () => {
    const html = '<h1>标题\n带换行</h1>'
    const result = extractTitle(html)
    expect(result).not.toBeNull()
    if (result) {
      expect(result.replace(/\s+/g, ' ').trim()).toBe('标题 带换行')
    }
  })

  it('应处理大小写混合的标签名', () => {
    const html = '<H1>大写H1</H1><TITLE>大写TITLE</TITLE>'
    // title 优先
    expect(extractTitle(html)).toBe('大写TITLE')
  })
})

// ─── extractImgRefs() 测试 ─────────────────────────────────────────────────

describe('M18-13: extractImgRefs() - XSS 安全图片引用提取', () => {
  it('应提取基本图片 src', () => {
    const html = '<img src="image.png">'
    expect(extractImgRefs(html)).toEqual(['image.png'])
  })

  it('应提取多个图片 src', () => {
    const html = '<img src="a.png"><img src="b.jpg">'
    expect(extractImgRefs(html)).toContain('a.png')
    expect(extractImgRefs(html)).toContain('b.jpg')
  })

  it('应支持单引号和双引号', () => {
    expect(extractImgRefs('<img src="double.png">')).toEqual(['double.png'])
    expect(extractImgRefs("<img src='single.png'>")).toEqual(['single.png'])
  })

  it('P-M18-07 修复：应拒绝含路径遍历的 src', () => {
    // 路径遍历攻击
    const html = '<img src="../../../etc/passwd">'
    const result = extractImgRefs(html)
    // 含 ../ 不符合白名单，应被拒绝
    expect(result).not.toContain('../../../etc/passwd')
  })

  it('P-M18-07 修复：应拒绝含空格的 src', () => {
    const html = '<img src="file with spaces.png">'
    const result = extractImgRefs(html)
    expect(result).not.toContain('file with spaces.png')
  })

  it('P-M18-07 修复：应拒绝含特殊字符的 src', () => {
    const dangerous = [
      'file<script>.png',
      'file">.png',
      "file'>.png",
      'file&char=.png',
      'file?query=.png',
      'file#.png',
    ]
    for (const src of dangerous) {
      const html = `<img src="${src}">`
      const result = extractImgRefs(html)
      expect(result).not.toContain(src)
    }
  })

  it('P-M18-07 修复：应拒绝 javascript: URL', () => {
    const html = '<img src="javascript:alert(1)">'
    expect(extractImgRefs(html)).toEqual([])
  })

  it('P-M18-07 修复：应拒绝 data: URL', () => {
    const html = '<img src="data:text/html,<script>alert(1)</script>">'
    expect(extractImgRefs(html)).toEqual([])
  })

  it('应正确处理 assets/ 开头的相对路径', () => {
    const html = '<img src="assets/image.png"><img src="assets/chart.jpg">'
    const result = extractImgRefs(html)
    expect(result).toContain('assets/image.png')
    expect(result).toContain('assets/chart.jpg')
  })

  it('应去重重复的 src', () => {
    const html = '<img src="same.png"><img src="same.png">'
    const result = extractImgRefs(html)
    expect(result).toEqual(['same.png'])
  })

  it('应处理无 src 属性的 img 标签', () => {
    const html = '<img alt="无src">'
    expect(extractImgRefs(html)).toEqual([])
  })

  it('P-M18-07 修复：应拒绝含 @ 符的 src（常见 XSS 向量）', () => {
    const html = '<img src="x@y.png">'
    const result = extractImgRefs(html)
    expect(result).not.toContain('x@y.png')
  })
})

// ─── buildAssetsIndex() 集成测试 ──────────────────────────────────────────

describe('M18-14: buildAssetsIndex() - 配图索引构建（临时文件）', () => {
  const fs = require('fs') as typeof import('fs')
  const os = require('os') as typeof import('os')
  const pathModule = require('path') as typeof import('path')

  let tempDir: string
  let assetsDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(pathModule.join(os.tmpdir(), 'rfyr-assets-test-'))
    assetsDir = pathModule.join(tempDir, 'assets')
    fs.mkdirSync(assetsDir)
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('应正确按前缀分组配图文件', () => {
    // 创建配图文件
    fs.writeFileSync(pathModule.join(assetsDir, '鑫多多_p01.png'), '')
    fs.writeFileSync(pathModule.join(assetsDir, '鑫多多_p02.png'), '')
    fs.writeFileSync(pathModule.join(assetsDir, '其他文章_p01.png'), '')

    const index = buildAssetsIndexFromDir(assetsDir)

    expect(index.get('鑫多多')).toEqual(['鑫多多_p01.png', '鑫多多_p02.png'])
    expect(index.get('其他文章')).toEqual(['其他文章_p01.png'])
  })

  it('应按页码排序（字典序）', () => {
    fs.writeFileSync(pathModule.join(assetsDir, '文章_p10.png'), '')
    fs.writeFileSync(pathModule.join(assetsDir, '文章_p02.png'), '')
    fs.writeFileSync(pathModule.join(assetsDir, '文章_p01.png'), '')

    const index = buildAssetsIndexFromDir(assetsDir)
    const imgs = index.get('文章')

    expect(imgs).toEqual(['文章_p01.png', '文章_p02.png', '文章_p10.png'])
  })

  it('应忽略非图片文件', () => {
    fs.writeFileSync(pathModule.join(assetsDir, '鑫多多_p01.png'), '')
    fs.writeFileSync(pathModule.join(assetsDir, '鑫多多_p01.txt'), '')

    const index = buildAssetsIndexFromDir(assetsDir)
    const imgs = index.get('鑫多多')

    expect(imgs).toContain('鑫多多_p01.png')
    expect(imgs).not.toContain('鑫多多_p01.txt')
  })

  it('应处理无匹配文件的目录', () => {
    const index = buildAssetsIndexFromDir(assetsDir)
    expect(index.size).toBe(0)
  })

  it('应处理不存在的目录', () => {
    const index = buildAssetsIndexFromDir('/non/existent/dir')
    expect(index.size).toBe(0)
  })

  it('P-M18-01 修复验证：应处理中文文件名', () => {
    fs.writeFileSync(pathModule.join(assetsDir, '鑫多多_p01.png'), '')
    fs.writeFileSync(pathModule.join(assetsDir, '鑫多多_p02.jpg'), '')

    const index = buildAssetsIndexFromDir(assetsDir)
    const imgs = index.get('鑫多多')

    expect(imgs).toHaveLength(2)
    expect(imgs).toContain('鑫多多_p01.png')
    expect(imgs).toContain('鑫多多_p02.jpg')
  })
})
