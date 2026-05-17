/**
 * API 响应类型定义
 * 统一管理所有 API 的响应格式
 *
 * 修复记录：
 * - P2: 使用 lib/member-tiers.ts 中的统一 MemberTier 类型
 */

// ========================
// 基础响应类型
// ========================

/**
 * API 成功响应
 */
export interface ApiSuccess<T = unknown> {
  status: 'success'
  data: T
}

/**
 * API 错误响应
 */
export interface ApiError {
  status: 'error'
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * API 响应类型
 */
export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

// ========================
// 文章相关响应
// ========================

/**
 * 文章数据
 */
export interface ArticleData {
  content?: string
  title?: string
  html_url?: string | null
  articleId?: string
}

/**
 * 文章访问类型
 */
export type ArticleAccessType = 'free' | 'monthly' | 'yearly'

/**
 * 文章成功响应
 */
export interface ArticleSuccessResponse extends ApiSuccess<ArticleData> {
  data: ArticleData & {
    accessType?: ArticleAccessType
    readCount?: number
    limit?: number
    remaining?: number
    isUnlimited?: boolean
    effectiveDailyLimit?: number
    bonusCount?: number
    dailyBonusCount?: number
    isFreeArticle?: boolean
    isFreeReferralArticle?: boolean
  }
}

/**
 * 文章错误码
 */
export type ArticleErrorCode =
  | 'REQUIRE_LOGIN'
  | 'YEARLY_REQUIRED'
  | 'MEMBERSHIP_REQUIRED'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'LIMIT_EXCEEDED'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'

/**
 * 文章错误响应
 */
export interface ArticleErrorResponse extends ApiError {
  code: ArticleErrorCode
  articleId?: string
  requiredLevel?: 'monthly' | 'yearly'
  readCount?: number
  limit?: number
  effectiveDailyLimit?: number
  bonusCount?: number
  dailyBonusCount?: number
}

/**
 * 文章完整响应类型
 */
export type ArticleApiResponse = ArticleSuccessResponse | ArticleErrorResponse

// ========================
// 会员相关响应
// ========================

/**
 * 会员状态
 * P2 修复：使用 lib/member-tiers.ts 中的 MemberTier
 */
import { MemberTier } from './member-tiers'

export interface MembershipStatus {
  isMember: boolean
  tier?: MemberTier
  startDate?: string
  endDate?: string
  daysRemaining?: number
}

/**
 * 会员状态成功响应
 */
export interface MembershipSuccessResponse extends ApiSuccess<MembershipStatus> {
  data: MembershipStatus
}

/**
 * 会员错误响应
 */
export interface MembershipErrorResponse extends ApiError {
  code: 'NOT_MEMBER' | 'EXPIRED' | 'SERVER_ERROR'
}

/**
 * 会员完整响应类型
 */
export type MembershipApiResponse = MembershipSuccessResponse | MembershipErrorResponse

// ========================
// 阅读限制相关响应
// ========================

/**
 * 阅读配额数据
 */
export interface QuotaData {
  dailyReadCount: number
  effectiveDailyLimit: number
  baseDailyLimit: number
  bonusDailyCount: number
  readIds: string[]
  remaining: number
}

/**
 * 阅读限制成功响应
 */
export interface QuotaSuccessResponse extends ApiSuccess<QuotaData> {
  data: QuotaData
}

/**
 * 阅读限制错误响应
 */
export interface QuotaErrorResponse extends ApiError {
  code: 'QUOTA_EXCEEDED' | 'SERVER_ERROR'
  readCount?: number
  limit?: number
}

/**
 * 阅读限制完整响应类型
 */
export type QuotaApiResponse = QuotaSuccessResponse | QuotaErrorResponse

// ========================
// 通用响应创建函数
// ========================

/**
 * 创建成功响应
 */
export function success<T>(data: T): ApiSuccess<T> {
  return { status: 'success', data }
}

/**
 * 创建错误响应
 */
export function error(code: string, message: string, details?: Record<string, unknown>): ApiError {
  return { status: 'error', code, message, details }
}

/**
 * 创建文章成功响应（向后兼容）
 */
export function articleSuccess(data: ArticleSuccessResponse['data']): ArticleSuccessResponse {
  return { status: 'success', data }
}

/**
 * 创建文章错误响应（向后兼容）
 */
export function articleError(
  code: ArticleErrorCode,
  message: string,
  extra: Partial<ArticleErrorResponse> = {}
): ArticleErrorResponse {
  return { status: 'error', code, message, ...extra }
}

/**
 * 创建 NextResponse JSON 响应
 */
export function jsonResponse<T extends ApiResponse>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init)
}

// ========================
// 类型守卫
// ========================

/**
 * 判断是否为成功响应
 */
export function isSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.status === 'success'
}

/**
 * 判断是否为错误响应
 */
export function isApiError(response: ApiResponse): response is ApiError {
  return response.status === 'error'
}

/**
 * 判断是否为文章成功响应
 */
export function isArticleSuccess(response: ArticleApiResponse): response is ArticleSuccessResponse {
  return response.status === 'success'
}

/**
 * 判断是否为文章错误响应
 */
export function isArticleError(response: ArticleApiResponse): response is ArticleErrorResponse {
  return response.status === 'error'
}
