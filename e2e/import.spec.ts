import { expect, test, type Page } from '@playwright/test'
import { createRoomFixtureGlb } from '../src/room/roomFixture'

const fixture = () => ({ name: 'textured-test-room.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from(createRoomFixtureGlb({ textured: true })) })

async function chooseFloor(page: Page) {
  // Read-only instrumentation projects a known clear floor point through the
  // live camera; the test still uses the real pointer picking and spawn checks.
  await expect.poll(() => page.evaluate(() => '__intelidarScene' in window)).toBe(true)
  // Let the unit change's camera fit and OrbitControls target reach the rendered frame.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const point = await page.evaluate(() => (window as unknown as {
    __intelidarScene: { project: (point: [number, number, number]) => { x: number; y: number } }
  }).__intelidarScene.project([12, 2, 21]))
  await page.mouse.click(point.x, point.y)
  await expect(page.getByRole('button', { name: 'Open room', exact: true })).toBeEnabled()
}

test('a textured local room can be set up and played without a backend', async ({ page }, testInfo) => {
  await page.route(/\/scene\/(ingest|reconstruct|ask)(\?.*)?$/, route => route.abort())
  await page.goto('/')
  await page.getByLabel('Import room file').setInputFiles(fixture())
  await expect(page.getByRole('heading', { name: 'Choose where to start' })).toBeVisible()
  await expect(page.getByLabel('Model units')).toHaveValue('1')
  await expect(page.getByRole('button', { name: 'Open room', exact: true })).toBeDisabled()
  await page.getByLabel('Model units').selectOption('0.01')
  await expect(page.locator('.room-dimensions')).toContainText('0.12 × 0.06 × 0.12')
  await page.getByLabel('Model units').selectOption('1')
  await expect(page.locator('.room-dimensions')).toContainText('12.00 × 6.00 × 12.00')
  await chooseFloor(page)
  await page.screenshot({ path: testInfo.outputPath('import-setup.png'), fullPage: true })
  await page.getByRole('button', { name: 'Open room', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Back to demo' })).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Preparing your character' })).toHaveCount(0, { timeout: 20_000 })
  await expect.poll(() => page.evaluate(() => (window as unknown as { __intelidarPlay?: { grounded: boolean; source: string } }).__intelidarPlay?.grounded)).toBe(true)
  expect(await page.evaluate(() => (window as unknown as { __intelidarPlay: { source: string } }).__intelidarPlay.source)).toBe('glb')
  await page.screenshot({ path: testInfo.outputPath('imported-play.png'), fullPage: true })
  await page.keyboard.down('d')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __intelidarPlay: { animation: string } }).__intelidarPlay.animation)).toBe('walk')
  await page.keyboard.up('d')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Back to demo' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Import room', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to demo' })).toHaveCount(0)
})

test('a rejected or cancelled import preserves the furnished demo', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^skip$/i }).click({ timeout: 20_000 })
  await page.getByRole('button', { name: /AI Reconstruct/ }).click()
  await expect(page.getByText('Semantic twin')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Import room file').setInputFiles({ name: 'broken.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('not a GLB') })
  await expect(page.getByText(/valid GLB version 2/i)).toBeVisible()
  await expect(page.getByText('Semantic twin')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
  await page.getByLabel('Import room file').setInputFiles(fixture())
  await expect(page.getByRole('heading', { name: 'Choose where to start' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click()
  await expect(page.getByText('Semantic twin')).toBeVisible()
  await page.getByRole('button', { name: 'Show me all the chairs.' }).click()
  await expect(page.locator('.reply')).toContainText(/chair/i)
})
