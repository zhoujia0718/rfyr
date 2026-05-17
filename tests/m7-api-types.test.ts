/**
 * Module 7 - UI组件库：lib/api-types.ts 测试套件
 *
 * 测试覆盖：
 * 1. ApiSuccess / ApiError / ApiResponse - 基础类型
 * 2. success() / error() - 响应创建函数
 * 3. articleSuccess() / articleError() - 文章响应创建
 * 4. jsonResponse() - NextResponse JSON 响应
 * 5. isSuccess() / isApiError() - 类型守卫
 * 6. isArticleSuccess() / isArticleError() - 文章类型守卫
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import * as apiTypes from '../lib/api-types.ts'
const { success, error, articleSuccess, articleError, jsonResponse, isSuccess, isApiError, isArticleSuccess, isArticleError } = apiTypes

describe('M7-11: lib/api-types.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. success() / error()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('success() / error() - 基础响应创建', () => {
    it('success() 应返回正确格式', () => {
      const result = success({ foo: 'bar' })
      expect(result).toEqual({ status: 'success', data: { foo: 'bar' } })
    })

    it('success() 应支持空数据', () => {
      const result = success(null)
      expect(result.status).toBe('success')
      expect(result.data).toBeNull()
    })

    it('error() 应返回正确格式', () => {
      const result = error('ERR_CODE', '错误消息')
      expect(result).toEqual({
        status: 'error',
        code: 'ERR_CODE',
        message: '错误消息',
      })
    })

    it('error() 应支持 details', () => {
      const result = error('ERR_CODE', '消息', { extra: 'data' })
      expect(result.details).toEqual({ extra: 'data' })
    })

    it('error() 应支持无 details', () => {
      const result = error('CODE', '消息')
      expect(result.details).toBeUndefined()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. articleSuccess() / articleError()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('articleSuccess() / articleError() - 文章响应', () => {
    it('articleSuccess() 应返回正确格式', () => {
      const result = articleSuccess({ title: 'Test', content: '<p>Hi</p>' })
      expect(result.status).toBe('success')
      expect(result.data.title).toBe('Test')
      expect(result.data.content).toBe('<p>Hi</p>')
    })

    it('articleSuccess() 应支持扩展字段', () => {
      const result = articleSuccess({
        title: 'Test',
        accessType: 'free',
        remaining: 5,
      })
      expect(result.data.accessType).toBe('free')
      expect(result.data.remaining).toBe(5)
    })

    it('articleError() 应返回正确格式', () => {
      const result = articleError('LIMIT_EXCEEDED', '阅读次数已用完')
      expect(result.status).toBe('error')
      expect(result.code).toBe('LIMIT_EXCEEDED')
      expect(result.message).toBe('阅读次数已用完')
    })

    it('articleError() 应支持扩展字段', () => {
      const result = articleError('LIMIT_EXCEEDED', '超限', {
        readCount: 3,
        limit: 3,
      })
      expect(result.readCount).toBe(3)
      expect(result.limit).toBe(3)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. jsonResponse()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('jsonResponse() - JSON 响应', () => {
    it('应返回 Response 对象', () => {
      const result = jsonResponse(success({ foo: 'bar' }))
      expect(result).toBeInstanceOf(Response)
    })

    it('应返回 JSON Content-Type', () => {
      const result = jsonResponse(success({ foo: 'bar' }))
      expect(result.headers.get('Content-Type')).toContain('application/json')
    })

    it('应支持自定义 status code', async () => {
      const result = jsonResponse(error('ERR', 'msg'), { status: 400 })
      expect(result.status).toBe(400)
    })

    it('应正确序列化 body', async () => {
      const body = success({ data: 'test' })
      const result = jsonResponse(body)
      const json = await result.json()
      expect(json).toEqual({ status: 'success', data: { data: 'test' } })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. 类型守卫
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('类型守卫', () => {
    it('isSuccess() 应正确识别成功响应', () => {
      expect(isSuccess({ status: 'success', data: {} })).toBe(true)
      expect(isSuccess({ status: 'error', code: 'X', message: '' })).toBe(false)
    })

    it('isApiError() 应正确识别错误响应', () => {
      expect(isApiError({ status: 'error', code: 'X', message: '' })).toBe(true)
      expect(isApiError({ status: 'success', data: {} })).toBe(false)
    })

    it('isArticleSuccess() 应正确识别文章成功响应', () => {
      expect(isArticleSuccess({ status: 'success', data: { title: 'Test' } })).toBe(true)
      expect(isArticleSuccess({ status: 'error', code: 'NOT_FOUND' as any, message: '' })).toBe(false)
    })

    it('isArticleError() 应正确识别文章错误响应', () => {
      expect(isArticleError({ status: 'error', code: 'LIMIT_EXCEEDED', message: '' })).toBe(true)
      expect(isArticleError({ status: 'success', data: {} })).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. 综合测试
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('综合测试', () => {
    it('success + isSuccess 应正确配合', () => {
      const resp = success({ count: 42 })
      if (isSuccess(resp)) {
        expect(resp.data.count).toBe(42)
      }
    })

    it('error + isApiError 应正确配合', () => {
      const resp = error('ERR', '失败')
      if (isApiError(resp)) {
        expect(resp.code).toBe('ERR')
      }
    })

    it('articleSuccess + isArticleSuccess 应正确配合', () => {
      const resp = articleSuccess({ title: 'Article', remaining: 10 })
      if (isArticleSuccess(resp)) {
        expect(resp.data.remaining).toBe(10)
      }
    })

    it('articleError + isArticleError 应正确配合', () => {
      const resp = articleError('YEARLY_REQUIRED', '需要年卡')
      if (isArticleError(resp)) {
        expect(resp.code).toBe('YEARLY_REQUIRED')
        expect(resp.message).toBe('需要年卡')
      }
    })

    it('isSuccess 与 isApiError 应互斥', () => {
      const successResp = success({})
      const errorResp = error('CODE', 'msg')
      expect(isSuccess(successResp) && isApiError(successResp)).toBe(false)
      expect(isApiError(errorResp) && isSuccess(errorResp)).toBe(false)
    })
  })
})
