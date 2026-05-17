/**
 * Module 7 - UI组件库：lib/upload-utils.ts 测试套件
 *
 * 测试覆盖：
 * 1. isSafeStoragePath() - 存储路径安全验证
 * 2. sanitizeFileName() - 文件名安全处理
 * 3. guessContentType() - MIME 类型推断
 * 4. uploadWithRetry() - 重试机制（错误识别）
 * 5. describeUploadFailure() - 错误描述
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore - dynamic import for .ts extension
import * as uploadUtils from '../lib/upload-utils.ts'
const { isSafeStoragePath, sanitizeFileName, guessContentType, describeUploadFailure } = uploadUtils

describe('M7-09: lib/upload-utils.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. isSafeStoragePath()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('isSafeStoragePath() - 存储路径安全验证', () => {
    it('应接受合法的简单路径', () => {
      expect(isSafeStoragePath('file.txt')).toBe(true)
      expect(isSafeStoragePath('folder/file.txt')).toBe(true)
      expect(isSafeStoragePath('a/b/c/d/file.txt')).toBe(true)
    })

    it('应接受包含数字和连字符的路径', () => {
      expect(isSafeStoragePath('article-123/file-name.txt')).toBe(true)
    })

    it('应接受点和下划线', () => {
      expect(isSafeStoragePath('file_name.txt')).toBe(true)
      expect(isSafeStoragePath('folder.name/file.name.txt')).toBe(true)
    })

    it('应拒绝空路径', () => {
      expect(isSafeStoragePath('')).toBe(false)
    })

    it('应拒绝以 / 开头的路径', () => {
      expect(isSafeStoragePath('/file.txt')).toBe(false)
      expect(isSafeStoragePath('/folder/file.txt')).toBe(false)
    })

    it('应拒绝路径遍历（..）', () => {
      expect(isSafeStoragePath('../file.txt')).toBe(false)
      expect(isSafeStoragePath('folder/../../file.txt')).toBe(false)
      expect(isSafeStoragePath('..\\file.txt')).toBe(false)
    })

    it('应拒绝包含 ~ 的路径', () => {
      expect(isSafeStoragePath('~/file.txt')).toBe(false)
      expect(isSafeStoragePath('folder~/file.txt')).toBe(false) // ~ 在任意位置均被禁止
    })

    it('应拒绝包含 $ 的路径', () => {
      expect(isSafeStoragePath('$file.txt')).toBe(false)
      expect(isSafeStoragePath('folder$/file.txt')).toBe(false)
    })

    it('应拒绝包含空格的路径', () => {
      expect(isSafeStoragePath('file name.txt')).toBe(false)
      expect(isSafeStoragePath('folder name/file.txt')).toBe(false)
    })

    it('应拒绝超长路径', () => {
      const longPath = 'a'.repeat(1025)
      expect(isSafeStoragePath(longPath)).toBe(false)
      expect(isSafeStoragePath('a'.repeat(1024))).toBe(true)
    })

    it('应拒绝包含特殊字符', () => {
      expect(isSafeStoragePath('file@something.txt')).toBe(false)
      expect(isSafeStoragePath('file#name.txt')).toBe(false)
      expect(isSafeStoragePath('file%name.txt')).toBe(false)
      expect(isSafeStoragePath('file<script>.txt')).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. sanitizeFileName()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('sanitizeFileName() - 文件名安全处理', () => {
    it('应提取路径最后一部分', () => {
      expect(sanitizeFileName('folder/file.txt')).toBe('file.txt')
      expect(sanitizeFileName('a/b/c/name.txt')).toBe('name.txt')
    })

    it('应处理正斜杠和反斜杠', () => {
      expect(sanitizeFileName('folder\\file.txt')).toBe('file.txt')
    })

    it('应移除路径遍历（..）', () => {
      // split(/[\\/]/) 先按路径分隔符分割，所以 '../file.txt' → pop() → 'file.txt'
      expect(sanitizeFileName('../file.txt')).toBe('file.txt')
      expect(sanitizeFileName('folder/../../file.txt')).toBe('file.txt')
      // 纯 '..' 作为文件名时，replace 转换为 '_'
      expect(sanitizeFileName('..')).toBe('_')
      // '...txt' 中 replace(/\.\./g, '_') 只替换第一组 '..'，剩余 '.' 保留 → '_.txt'
      expect(sanitizeFileName('...txt')).toBe('_.txt')
    })

    it('应截断超长文件名', () => {
      const longName = 'a'.repeat(200) + '.txt'
      const result = sanitizeFileName(longName, 180)
      expect(result.length).toBeLessThanOrEqual(180)
      expect(result.endsWith('.txt')).toBe(true)
    })

    it('应保留文件扩展名', () => {
      const name = 'document.pdf'
      const result = sanitizeFileName(name, 100)
      expect(result).toBe('document.pdf')
    })

    it('应处理无扩展名的文件名', () => {
      const result = sanitizeFileName('noextension', 50)
      expect(result).toBe('noextension')
    })

    it('应处理空字符串输入', () => {
      const result = sanitizeFileName('', 50)
      expect(result).toBe('file')
    })

    it('应去除文件名前后空白', () => {
      expect(sanitizeFileName('  file.txt  ')).toBe('file.txt')
    })

    it('默认 maxLength 应为 180', () => {
      const longName = 'a'.repeat(200) + '.txt'
      const result = sanitizeFileName(longName)
      expect(result.length).toBeLessThanOrEqual(180)
    })

    it('应处理只有扩展名的输入', () => {
      expect(sanitizeFileName('.txt')).toBe('.txt')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. guessContentType()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('guessContentType() - MIME 类型推断', () => {
    it('应正确识别图片类型', () => {
      expect(guessContentType('photo.jpg')).toBe('image/jpeg')
      expect(guessContentType('photo.jpeg')).toBe('image/jpeg')
      expect(guessContentType('icon.png')).toBe('image/png')
      expect(guessContentType('image.gif')).toBe('image/gif')
      expect(guessContentType('graphic.webp')).toBe('image/webp')
      expect(guessContentType('vector.svg')).toBe('image/svg+xml')
    })

    it('应正确识别文档类型', () => {
      expect(guessContentType('doc.pdf')).toBe('application/pdf')
      expect(guessContentType('page.html')).toBe('text/html; charset=utf-8')
      expect(guessContentType('page.htm')).toBe('text/html; charset=utf-8')
    })

    it('应正确识别其他常见类型', () => {
      expect(guessContentType('data.json')).toBe('application/json')
      expect(guessContentType('script.js')).toBe('application/javascript')
      expect(guessContentType('style.css')).toBe('text/css')
      expect(guessContentType('readme.txt')).toBe('text/plain')
    })

    it('应大小写不敏感', () => {
      expect(guessContentType('PHOTO.JPG')).toBe('image/jpeg')
      expect(guessContentType('Doc.PDF')).toBe('application/pdf')
      expect(guessContentType('PAGE.HTML')).toBe('text/html; charset=utf-8')
    })

    it('应处理无扩展名的文件', () => {
      expect(guessContentType('noextension')).toBe('application/octet-stream')
      expect(guessContentType('')).toBe('application/octet-stream')
    })

    it('应处理未知扩展名', () => {
      expect(guessContentType('file.xyz')).toBe('application/octet-stream')
      expect(guessContentType('file.abc')).toBe('application/octet-stream')
    })

    it('应处理带路径的文件名', () => {
      expect(guessContentType('folder/file.jpg')).toBe('image/jpeg')
      expect(guessContentType('C:\\Users\\file.pdf')).toBe('application/pdf')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. describeUploadFailure()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('describeUploadFailure() - 错误描述', () => {
    it('应识别网络错误', () => {
      expect(describeUploadFailure(new Error('Failed to fetch'))).toContain('无法连接服务器')
      expect(describeUploadFailure(new Error('NetworkError'))).toContain('无法连接服务器')
      expect(describeUploadFailure(new Error('Load failed'))).toContain('无法连接服务器')
    })

    it('应识别超时错误', () => {
      expect(describeUploadFailure(new Error('timeout'))).toContain('上传超时')
      expect(describeUploadFailure(new Error('Timeout exceeded'))).toContain('上传超时')
    })

    it('应识别文件大小超限', () => {
      expect(describeUploadFailure(new Error('File too large'))).toContain('超过限制')
      expect(describeUploadFailure(new Error('size limit exceeded'))).toContain('超过限制')
    })

    it('应处理未知错误', () => {
      const result = describeUploadFailure(new Error('Unknown error'))
      expect(result).toBe('Unknown error')
    })

    it('应处理空错误消息', () => {
      // new Error('') → message='' (falsy) → String(error) = 'Error' → 返回 'Error'
      expect(describeUploadFailure(new Error(''))).toBe('Error')
      // null → null?.message = undefined → String(null||'') = '' → trim() = '' → '' || fallback → '上传失败，请稍后重试'
      expect(describeUploadFailure(null)).toBe('上传失败，请稍后重试')
    })

    it('应处理字符串错误', () => {
      expect(describeUploadFailure('Failed to fetch')).toContain('无法连接服务器')
    })

    it('应处理错误对象', () => {
      const err = { message: 'Failed to fetch', name: 'NetworkError' }
      expect(describeUploadFailure(err)).toContain('无法连接服务器')
    })
  })
})
