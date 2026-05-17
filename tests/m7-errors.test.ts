/**
 * Module 7 - UI组件库：lib/errors.ts 测试套件
 *
 * 测试覆盖：
 * 1. AppError - 基础错误类
 * 2. NotFoundError / UnauthorizedError / ForbiddenError / BusinessError
 * 3. QuotaExceededError / MembershipRequiredError / ValidationError / DatabaseError
 * 4. isAppError() / toAppError() / fromSupabaseError()
 */
import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  BusinessError,
  QuotaExceededError,
  MembershipRequiredError,
  ValidationError,
  DatabaseError,
  isAppError,
  toAppError,
  fromSupabaseError,
// @ts-ignore
} from '../lib/errors.ts'

describe('M7-06: lib/errors.ts', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. AppError 基类
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('AppError - 基础错误类', () => {
    it('应正确设置 name/code/statusCode/message', () => {
      const err = new AppError('测试消息', 'TEST_CODE', 418)
      expect(err.name).toBe('AppError')
      expect(err.message).toBe('测试消息')
      expect(err.code).toBe('TEST_CODE')
      expect(err.statusCode).toBe(418)
    })

    it('statusCode 默认应为 500', () => {
      const err = new AppError('消息', 'CODE')
      expect(err.statusCode).toBe(500)
    })

    it('应保留原始错误的堆栈', () => {
      const original = new Error('原始错误')
      const err = new AppError('包装错误', 'WRAPPED', 500, original)
      expect(err.originalError).toBe(original)
      expect(err.stack).toContain('Caused by:')
    })

    it('toJSON() 应返回正确格式', () => {
      const err = new AppError('消息', 'CODE', 400)
      const json = err.toJSON()
      expect(json).toEqual({
        error: '消息',
        code: 'CODE',
        statusCode: 400,
      })
    })

    it('toResponse() 应返回正确格式', () => {
      const err = new AppError('消息', 'CODE', 400)
      const resp = err.toResponse()
      expect(resp).toEqual({
        error: '消息',
        code: 'CODE',
      })
    })

    it('应继承 Error', () => {
      const err = new AppError('消息', 'CODE')
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(AppError)
    })

    it('prototype chain 应正确', () => {
      const err = new AppError('消息', 'CODE')
      expect(Object.getPrototypeOf(err).constructor.name).toBe('AppError')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. NotFoundError
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('NotFoundError', () => {
    it('应默认 statusCode=404, code=NOT_FOUND', () => {
      const err = new NotFoundError()
      expect(err.statusCode).toBe(404)
      expect(err.code).toBe('NOT_FOUND')
      expect(err.name).toBe('NotFoundError')
    })

    it('应允许自定义消息', () => {
      const err = new NotFoundError('文章不存在')
      expect(err.message).toBe('文章不存在')
    })

    it('应继承 AppError', () => {
      expect(new NotFoundError()).toBeInstanceOf(AppError)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. UnauthorizedError
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('UnauthorizedError', () => {
    it('应默认 statusCode=401, code=REQUIRE_LOGIN', () => {
      const err = new UnauthorizedError()
      expect(err.statusCode).toBe(401)
      expect(err.code).toBe('REQUIRE_LOGIN')
      expect(err.name).toBe('UnauthorizedError')
    })

    it('应继承 AppError', () => {
      expect(new UnauthorizedError()).toBeInstanceOf(AppError)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. ForbiddenError
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('ForbiddenError', () => {
    it('应默认 statusCode=403, code=FORBIDDEN', () => {
      const err = new ForbiddenError()
      expect(err.statusCode).toBe(403)
      expect(err.code).toBe('FORBIDDEN')
      expect(err.name).toBe('ForbiddenError')
    })

    it('应允许自定义 code', () => {
      const err = new ForbiddenError('权限不足', 'CUSTOM_CODE')
      expect(err.code).toBe('CUSTOM_CODE')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. BusinessError
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('BusinessError', () => {
    it('应默认 statusCode=403', () => {
      const err = new BusinessError('业务错误', 'BUSINESS')
      expect(err.statusCode).toBe(403)
      expect(err.name).toBe('BusinessError')
    })

    it('应允许自定义 statusCode', () => {
      const err = new BusinessError('错误', 'CODE', 400)
      expect(err.statusCode).toBe(400)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. QuotaExceededError
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('QuotaExceededError', () => {
    it('daily 类型应设置正确的 code', () => {
      const err = new QuotaExceededError('daily', '今日配额已用完')
      expect(err.quotaType).toBe('daily')
      expect(err.code).toBe('DAILY_LIMIT_EXCEEDED')
      expect(err.statusCode).toBe(403)
    })

    it('lifetime 类型应设置正确的 code', () => {
      const err = new QuotaExceededError('lifetime', '配额已用完')
      expect(err.quotaType).toBe('lifetime')
      expect(err.code).toBe('LIMIT_EXCEEDED')
    })

    it('应继承 BusinessError', () => {
      expect(new QuotaExceededError('daily', 'msg')).toBeInstanceOf(BusinessError)
      expect(new QuotaExceededError('daily', 'msg')).toBeInstanceOf(AppError)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 7. MembershipRequiredError
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('MembershipRequiredError', () => {
    it('yearly 类型应设置 YEARLY_REQUIRED', () => {
      const err = new MembershipRequiredError('yearly')
      expect(err.requiredLevel).toBe('yearly')
      expect(err.code).toBe('YEARLY_REQUIRED')
    })

    it('monthly 类型应设置 MEMBERSHIP_REQUIRED', () => {
      const err = new MembershipRequiredError('monthly')
      expect(err.requiredLevel).toBe('monthly')
      expect(err.code).toBe('MEMBERSHIP_REQUIRED')
    })

    it('应使用默认消息', () => {
      const yearlyErr = new MembershipRequiredError('yearly')
      expect(yearlyErr.message).toContain('年卡')

      const monthlyErr = new MembershipRequiredError('monthly')
      expect(monthlyErr.message).toContain('月卡')
    })

    it('应继承 BusinessError', () => {
      expect(new MembershipRequiredError('yearly')).toBeInstanceOf(BusinessError)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 8. ValidationError / DatabaseError
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('ValidationError / DatabaseError', () => {
    it('ValidationError 默认 statusCode=400', () => {
      const err = new ValidationError('参数错误')
      expect(err.statusCode).toBe(400)
      expect(err.code).toBe('VALIDATION_ERROR')
    })

    it('DatabaseError 应包装原始错误', () => {
      const original = new Error('DB connection failed')
      const err = new DatabaseError('查询失败', original)
      expect(err.originalError).toBe(original)
      expect(err.message).toContain('数据库操作失败')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 9. isAppError() / toAppError() / fromSupabaseError()
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('辅助函数', () => {
    it('isAppError 应正确识别 AppError 实例', () => {
      expect(isAppError(new AppError('msg', 'code'))).toBe(true)
      expect(isAppError(new NotFoundError())).toBe(true)
      expect(isAppError(new QuotaExceededError('daily', 'msg'))).toBe(true)
      expect(isAppError(new Error('not app error'))).toBe(false)
      expect(isAppError('string')).toBe(false)
      expect(isAppError(null)).toBe(false)
      expect(isAppError(undefined)).toBe(false)
    })

    it('toAppError 应直接返回 AppError', () => {
      const appErr = new NotFoundError('已存在')
      const result = toAppError(appErr)
      expect(result).toBe(appErr)
    })

    it('toAppError 应包装 Error', () => {
      const err = new Error('原始错误')
      const result = toAppError(err, '操作失败')
      expect(result).toBeInstanceOf(AppError)
      expect(result.code).toBe('INTERNAL_ERROR')
      expect(result.originalError).toBe(err)
    })

    it('toAppError 应处理非 Error 值', () => {
      const result = toAppError('string error', '失败')
      expect(result).toBeInstanceOf(AppError)
    })

    it('fromSupabaseError 应正确识别 PGRST116', () => {
      const err = fromSupabaseError({ code: 'PGRST116' })
      expect(err).toBeInstanceOf(NotFoundError)
    })

    it('fromSupabaseError 应正确识别唯一约束 (23505)', () => {
      const err = fromSupabaseError({ code: '23505', message: 'duplicate key' })
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.code).toBe('DUPLICATE_ENTRY')
    })

    it('fromSupabaseError 应正确识别外键约束 (23503)', () => {
      const err = fromSupabaseError({ code: '23503' })
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.code).toBe('FOREIGN_KEY_VIOLATION')
    })

    it('fromSupabaseError 应正确识别表不存在 (42P01)', () => {
      const err = fromSupabaseError({ code: '42P01' })
      expect(err).toBeInstanceOf(DatabaseError)
    })

    it('fromSupabaseError 应正确识别非空约束 (23502)', () => {
      const err = fromSupabaseError({ code: '23502' })
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.code).toBe('NOT_NULL_VIOLATION')
    })

    it('fromSupabaseError 应处理未知错误码', () => {
      const err = fromSupabaseError({ code: 'UNKNOWN', message: 'unknown error' })
      expect(err).toBeInstanceOf(DatabaseError)
    })
  })
})
