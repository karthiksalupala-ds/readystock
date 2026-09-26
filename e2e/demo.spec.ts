import { expect, test } from '@playwright/test'

test('demo path: sweep, reconstruct, ask chairs, then enable edit', async ({ page }) => {
  // Exercise the speech controls without relying on an installed audio device.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(utterance: SpeechSynthesisUtterance) {
          document.documentElement.dataset.spokenText = utterance.text
        },
        cancel() { delete document.documentElement.dataset.spokenText },
      },
    })
  })
  await page.goto('/')

  // The sensor sweeps before anything can be reconstructed.
  const meter = page.getByRole('progressbar', { name: /demo playback/i })
  await expect(meter).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Demo playback')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: /^skip$/i }).click()

  const reconstruct = page.getByRole('button', { name: /AI Reconstruct/ })
  await expect(reconstruct).toBeEnabled({ timeout: 20_000 })
  await expect(page.getByText('Raw mesh')).toBeVisible()
  await expect(meter).toHaveCount(0)

  await reconstruct.click()
  await expect(page.getByText('Semantic twin')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('textbox', { name: /ask the spatial assistant/i })).toBeEnabled()

  await page.getByRole('button', { name: 'Show me all the chairs.' }).click()
  await expect(page.locator('.reply')).toContainText(/chair/i)
  await page.getByRole('button', { name: 'Read aloud', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-spoken-text', (await page.locator('.reply').innerText()).trim())
  await page.getByRole('button', { name: 'Stop reading', exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-spoken-text')
  await expect(page.getByRole('button', { name: /Chair/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('button', { name: 'Editing' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/drag tables, chairs, and equipment/i)).toBeVisible()

  await page.getByLabel('Object', { exact: true }).selectOption('table-1')
  await expect(page.getByLabel('Shape', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Use color #467568' }).click()
  await expect(page.getByLabel('Color', { exact: true })).toHaveValue('#467568')
  await page.getByLabel('Object', { exact: true }).selectOption('chair-2')
  await expect(page.getByRole('button', { name: 'Restore model colors' })).toBeVisible()
  await page.getByLabel('Object', { exact: true }).selectOption('table-1')
  await expect(page.getByLabel('Color', { exact: true })).toHaveValue('#467568')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Read aloud', exact: true })).toBeInViewport()
  await expect(page.getByRole('complementary', { name: 'Object appearance' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore model colors' }).click()
  await expect(page.getByLabel('Color', { exact: true })).toHaveValue('#a58a68')
})

test('graphics menu turns the expensive effects off, and remembers', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^skip$/i }).click({ timeout: 20_000 })

  await page.getByRole('button', { name: /graphics/i }).click()
  await expect(page.getByRole('switch', { name: /point cloud/i })).toHaveAttribute(
    'aria-checked',
    'true',
  )

  await page.getByRole('button', { name: /^low$/i }).click()
  for (const setting of [/point cloud/i, /shadows/i, /glass blur/i, /animation/i]) {
    await expect(page.getByRole('switch', { name: setting })).toHaveAttribute('aria-checked', 'false')
  }
  await expect(page.locator('.app')).toHaveAttribute('data-glass', 'off')
  await expect(page.locator('.app')).toHaveAttribute('data-motion', 'off')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('switch', { name: /point cloud/i })).toHaveCount(0)

  // The choice survives a reload, and with animation off there is no sweep to sit through.
  await page.reload()
  await expect(page.getByRole('button', { name: /AI Reconstruct/ })).toBeEnabled({ timeout: 20_000 })
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.locator('.app')).toHaveAttribute('data-glass', 'off')

  // Low quality is still the whole product: reconstruct and ask both work.
  await page.getByRole('button', { name: /AI Reconstruct/ }).click()
  await expect(page.getByText('Semantic twin')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Show me all the chairs.' }).click()
  await expect(page.locator('.reply')).toContainText(/chair/i)
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('hands over the finished scan without playing the sweep', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('button', { name: /AI Reconstruct/ })).toBeEnabled({
      timeout: 20_000,
    })
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    await expect(page.getByText('Raw mesh')).toBeVisible()
  })
})
