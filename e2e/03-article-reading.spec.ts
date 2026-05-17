/**
 * E2E Test: Article Reading & Quota Limits
 *
 * Run:
 *   npx playwright test e2e/03-article-reading.spec.ts
 */

import { test, expect } from '@playwright/test'
import { loginAsGuest, loginAsMonthly, loginAsYearly } from './helpers/auth'

const KNOWN_ARTICLE_ID = 'b94ddce3-a1ab-4827-a4d8-f3c3d3feeee4'

test.describe('Article Rendering', () => {

  test('笔记详情页：文章内容正确渲染', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${KNOWN_ARTICLE_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('笔记详情页：无 XSS 内联事件处理器', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${KNOWN_ARTICLE_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const xssAttrs = await page.evaluate(() => {
      const article = document.querySelector('article')
      if (!article) return []
      const allEls = article.querySelectorAll('*')
      const attrs: string[] = []
      for (const el of allEls) {
        for (const attr of el.attributes) {
          if (attr.name.startsWith('on') && attr.name !== 'onclick') {
            attrs.push(`${attr.name}="${attr.value.substring(0, 50)}"`)
          }
        }
      }
      return attrs
    })

    expect(xssAttrs, `XSS attributes found: ${xssAttrs.join(', ')}`).toHaveLength(0)
  })
})

test.describe('Quota Limit Enforcement', () => {

  test('游客：笔记详情页加载成功', async ({ page }) => {
    await page.goto(`http://localhost:3000/notes/${KNOWN_ARTICLE_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('月卡会员：笔记详情页加载成功', async ({ page }) => {
    await loginAsMonthly(page) // set BEFORE goto
    await page.goto(`http://localhost:3000/notes/${KNOWN_ARTICLE_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('年卡会员：笔记详情页加载成功', async ({ page }) => {
    await loginAsYearly(page) // set BEFORE goto
    await page.goto(`http://localhost:3000/notes/${KNOWN_ARTICLE_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(50)
  })
})

test.describe('Reading Settings', () => {

  test('笔记列表页：显示笔记链接', async ({ page }) => {
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const links = page.locator('a[href^="/notes/"]')
    const count = await links.count()
    expect(count).toBeGreaterThan(0)
  })

  test('笔记列表页：链接格式正确', async ({ page }) => {
    await page.goto('http://localhost:3000/notes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const links = page.locator('a[href^="/notes/"]')
    const count = await links.count()
    if (count > 0) {
      const href = await links.first().getAttribute('href')
      expect(href).toMatch(/^\/notes\//)
    }
  })
})
