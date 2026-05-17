/**
 * U0-01: DialogContent — React DOM 警告检测
 *
 * 这类测试必须在真实浏览器环境中运行。
 * React 在开发模式下会验证 DOM 元素的 props，
 * 只有真实浏览器 DOM 才触发 "Unknown event handler property" 警告。
 *
 * 测试目标：
 * - DialogContent 使用标准 Radix 模式（onOpenChange 在 Root 上）不应产生警告
 *
 * 注意：Radix 不转发 data-testid，只能用 data-slot。
 *
 * 运行：
 *   npx playwright test e2e/u0-dialog-props-warnings.spec.ts
 */

import { test, expect } from '@playwright/test'

test.describe('U0-01: DialogContent — React DOM 警告检测', () => {

  test('标准 Radix 用法：Dialog 不应产生 "Unknown event handler property" 警告', async ({ page }) => {
    const reactWarnings: string[] = []

    page.on('console', (msg) => {
      const text = msg.text()
      if (
        text.includes('Unknown event handler property') ||
        text.includes('Invalid prop')
      ) {
        reactWarnings.push(text)
      }
    })

    await page.goto('http://localhost:3000/test/dialog', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await page.click('#open-dialog')
    await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 5000 })
    await page.waitForTimeout(1000)

    const onOpenChangeWarnings = reactWarnings.filter(
      (w) => w.includes('onOpenChange')
    )

    console.log('onOpenChange warnings:', JSON.stringify(onOpenChangeWarnings))
    expect(onOpenChangeWarnings).toHaveLength(0)
  })

  test('DialogContent 打开后关闭按钮可点击', async ({ page }) => {
    await page.goto('http://localhost:3000/test/dialog', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await page.click('#open-dialog')
    await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 5000 })
    await page.waitForTimeout(500)

    const closeBtn = page.locator('[data-slot="dialog-close"]')
    await expect(closeBtn).toBeVisible()

    await closeBtn.click()
    await page.waitForTimeout(500)
    await expect(closeBtn).not.toBeVisible()
  })

  test('Dialog 打开和关闭循环两次正常', async ({ page }) => {
    await page.goto('http://localhost:3000/test/dialog', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    for (let i = 0; i < 2; i++) {
      await page.click('#open-dialog')
      await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 5000 })
      await page.waitForTimeout(300)
      await page.click('[data-slot="dialog-close"]')
      await page.waitForTimeout(500)
    }
    // Should still be closed
    const closeBtn = page.locator('[data-slot="dialog-close"]')
    await expect(closeBtn).not.toBeVisible()
  })
})
