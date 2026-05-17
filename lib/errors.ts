/**
 * 统一错误处理模块
 * 提供应用级别的错误类，支持错误链和堆栈追踪
 */

/**
 * 应用错误基类
 */
export class AppError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly originalError?: Error

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    originalError?: Error
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.originalError = originalError

    // 保留原始堆栈
    if (originalError?.stack) {
      this.stack = this.stack + '\nCaused by:\n' + originalError.stack
    }

    // 修复 Error 的 prototype chain（适用于 TypeScript 编译目标为 ES5）
    Object.setPrototypeOf(this, AppError.prototype)
  }

  /**
   * 转换为 JSON（用于 API 响应）
   */
  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
    }
  }

  /**
   * 转换为 API 响应格式
   */
  toResponse() {
    return {
      error: this.message,
      code: this.code,
    }
  }
}

/**
 * 资源未找到错误
 */
export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(message, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}

/**
 * 未认证错误
 */
export class UnauthorizedError extends AppError {
  constructor(message = '请先登录') {
    super(message, 'REQUIRE_LOGIN', 401)
    this.name = 'UnauthorizedError'
    Object.setPrototypeOf(this, UnauthorizedError.prototype)
  }
}

/**
 * 权限不足错误
 */
export class ForbiddenError extends AppError {
  constructor(message = '权限不足', code = 'FORBIDDEN') {
    super(message, code, 403)
    this.name = 'ForbiddenError'
    Object.setPrototypeOf(this, ForbiddenError.prototype)
  }
}

/**
 * 业务逻辑错误（如配额用完）
 */
export class BusinessError extends AppError {
  constructor(message: string, code: string, statusCode = 403) {
    super(message, code, statusCode)
    this.name = 'BusinessError'
    Object.setPrototypeOf(this, BusinessError.prototype)
  }
}

/**
 * 阅读限制超限错误
 */
export class QuotaExceededError extends BusinessError {
  public readonly quotaType: 'lifetime' | 'daily'

  constructor(quotaType: 'lifetime' | 'daily', message: string) {
    super(message, quotaType === 'daily' ? 'DAILY_LIMIT_EXCEEDED' : 'LIMIT_EXCEEDED')
    this.name = 'QuotaExceededError'
    this.quotaType = quotaType
    Object.setPrototypeOf(this, QuotaExceededError.prototype)
  }
}

/**
 * 会员权限不足错误
 */
export class MembershipRequiredError extends BusinessError {
  public readonly requiredLevel: 'monthly' | 'yearly'

  constructor(requiredLevel: 'monthly' | 'yearly', message?: string) {
    const defaultMessage =
      requiredLevel === 'yearly'
        ? '此文章为年卡专属内容，请升级为年卡会员'
        : '此文章需要月卡或年卡会员权限'

    super(message || defaultMessage, requiredLevel === 'yearly' ? 'YEARLY_REQUIRED' : 'MEMBERSHIP_REQUIRED')
    this.name = 'MembershipRequiredError'
    this.requiredLevel = requiredLevel
    Object.setPrototypeOf(this, MembershipRequiredError.prototype)
  }
}

/**
 * 参数验证错误
 */
export class ValidationError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message, code, 400)
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(`数据库操作失败: ${message}`, 'DB_ERROR', 500, originalError)
    this.name = 'DatabaseError'
    Object.setPrototypeOf(this, DatabaseError.prototype)
  }
}

/**
 * 文件上传错误
 */
export class UploadError extends AppError {
  constructor(message: string, code = 'UPLOAD_ERROR') {
    super(message, code, 500)
    this.name = 'UploadError'
    Object.setPrototypeOf(this, UploadError.prototype)
  }
}

/**
 * 判断是否为 AppError 实例
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * 安全地转换错误为 AppError
 * 如果已经是 AppError，直接返回
 * 如果是其他 Error，包装为 DatabaseError
 */
export function toAppError(error: unknown, defaultMessage = '操作失败'): AppError {
  if (isAppError(error)) {
    return error
  }

  if (error instanceof Error) {
    return new AppError(
      `${defaultMessage}: ${error.message}`,
      'INTERNAL_ERROR',
      500,
      error
    )
  }

  return new AppError(defaultMessage, 'INTERNAL_ERROR', 500)
}

/**
 * 从 Supabase 错误码判断错误类型
 */
export function fromSupabaseError(error: { code?: string; message?: string }): AppError {
  switch (error.code) {
    case 'PGRST116':
      return new NotFoundError('请求的资源不存在')

    case '23505': // unique_violation
      return new ValidationError('数据已存在，不能重复创建', 'DUPLICATE_ENTRY')

    case '23503': // foreign_key_violation
      return new ValidationError('关联的数据不存在', 'FOREIGN_KEY_VIOLATION')

    case '42P01': // undefined_table
      return new DatabaseError('数据表不存在，请检查配置')

    case '23502': // not_null_violation
      return new ValidationError('必填字段不能为空', 'NOT_NULL_VIOLATION')

    default:
      return new DatabaseError(error.message || '未知数据库错误')
  }
}
