/**
 * M11-01i: lib/html-sanitizer.ts - DOMPurify 初始化测试（jsdom 环境）
 *
 * 仅测试 initDOMPurify() / getDOMPurify() 等需要 DOM API 的功能。
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 在 jsdom 测试中，window 是存在的
// 必须在模块顶层 mock
const mockSanitize = vi.fn((html: string) => html)
const mockAddHook = vi.fn()
const mockDOMPurifyInstance = {
  sanitize: mockSanitize,
  addHook: mockAddHook,
}

vi.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: mockDOMPurifyInstance,
}))

describe('M11-01i: DOMPurify 初始化（jsdom）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initDOMPurify 应在浏览器环境正常初始化', async () => {
    // 动态导入以获得最新模块状态
    const { initDOMPurify, getDOMPurify } = await import('../lib/html-sanitizer')

    // 初始为 null
    expect(getDOMPurify()).toBeNull()

    // 初始化
    const instance = await initDOMPurify()
    expect(instance).toBeDefined()
    expect(instance.sanitize).toBeDefined()
  })

  it('getDOMPurify 应在初始化后返回实例', async () => {
    const { initDOMPurify, getDOMPurify } = await import('../lib/html-sanitizer')

    await initDOMPurify()
    expect(getDOMPurify()).toBeDefined()
    expect(getDOMPurify()).not.toBeNull()
  })

  it('多次调用 initDOMPurify 应返回同一实例', async () => {
    const { initDOMPurify, getDOMPurify } = await import('../lib/html-sanitizer')

    const instance1 = await initDOMPurify()
    const instance2 = await initDOMPurify()

    expect(instance1).toBe(instance2)
    expect(getDOMPurify()).toBe(instance1)
  })

  it('initDOMPurify 应注册全局 DOMPurify（供 sanitizeHtml 使用）', async () => {
    const { initDOMPurify } = await import('../lib/html-sanitizer')

    await initDOMPurify()

    // 检查全局 DOMPurify 是否注册
    const globalDP = (globalThis as unknown as { DOMPurify?: typeof mockDOMPurifyInstance }).DOMPurify
    expect(globalDP).toBeDefined()
    expect(globalDP).toBe(mockDOMPurifyInstance)
  })

  it('initDOMPurify 应添加 afterSanitizeAttributes hook', async () => {
    const { initDOMPurify } = await import('../lib/html-sanitizer')

    await initDOMPurify()

    expect(mockAddHook).toHaveBeenCalledWith('afterSanitizeAttributes', expect.any(Function))
  })
})
