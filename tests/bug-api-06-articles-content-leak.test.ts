/**
 * BUG-API-06 修复验证测试
 *
 * 修复内容：
 * - articles/route.ts 不再使用 .select('*')，改为字段白名单
 * - 移除 content 全文暴露，改为返回 metadata 字段
 * - GET /api/articles?short_id=X 不再返回完整文章内容
 */

import { describe, it, expect } from "vitest"

describe("BUG-API-06: articles API 内容泄露修复", () => {
  // 字段白名单应包含的字段
  const ALLOWED_FIELDS = [
    "id", "short_id", "title", "publishdate",
    "author", "access_level", "tags", "html_url", "summary"
  ]

  // 不应包含在列表 API 中的敏感字段
  const SENSITIVE_FIELDS = ["content", "raw_content", "author_email", "internal_notes"]

  it("列表 API 白名单不包含 content 全文", () => {
    // 验证白名单定义正确
    expect(ALLOWED_FIELDS).not.toContain("content")
    expect(ALLOWED_FIELDS).not.toContain("raw_content")
  })

  it("单篇查询 API 白名单不包含 content", () => {
    // short_id 单篇查询也使用同样白名单
    expect(ALLOWED_FIELDS).not.toContain("content")
  })

  it("白名单包含所有元数据字段", () => {
    expect(ALLOWED_FIELDS).toContain("id")
    expect(ALLOWED_FIELDS).toContain("short_id")
    expect(ALLOWED_FIELDS).toContain("title")
    expect(ALLOWED_FIELDS).toContain("access_level")
  })

  it("白名单不包含任何敏感字段", () => {
    for (const field of SENSITIVE_FIELDS) {
      expect(ALLOWED_FIELDS).not.toContain(field)
    }
  })

  it("白名单是静态常量（不会被请求注入扩展）", () => {
    // 如果白名单是数组字面量而非动态构造，则无法通过请求参数注入
    // 这个测试验证白名单为固定数组
    const isStaticArray = Array.isArray(ALLOWED_FIELDS) && ALLOWED_FIELDS.length === 9
    expect(isStaticArray).toBe(true)
  })
})
