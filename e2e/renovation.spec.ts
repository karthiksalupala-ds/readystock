import { expect, test } from '@playwright/test'
import { roomPlanCapture } from '../src/test/roomPlanCapture'

test.use({ reducedMotion: 'reduce' })

test('renovates an imported room using the actual GLB library and supports remove/undo', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Renovate', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Import scan', exact: true }).click()
  await page.getByLabel('Choose scan from Files').setInputFiles({ name: 'room.intelidar.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(roomPlanCapture)) })
  const loaded = page.waitForResponse((response) => response.url().includes('sofa_2seat') && response.url().includes('.glb') && !response.url().includes('?import') && response.status() === 200)
  await page.getByRole('button', { name: 'Renovate', exact: true }).click()
  await loaded
  const panel = page.getByRole('complementary', { name: 'Renovation', exact: true })
  await expect(panel).toBeVisible()
  await page.getByLabel('Search furniture').fill('sofa')
  await expect(panel.getByRole('button', { name: /^Two-seat sofa/ })).toBeVisible()
  await panel.getByRole('button', { name: 'Add Two-seat sofa', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Furniture added')
  await expect(page.locator('[data-loading-model]')).toHaveCount(0)
  const id = await page.getByLabel('Selected in room').inputValue()
  expect(id).toMatch(/^renovation:/)
  await panel.getByRole('button', { name: 'Rotate 90°' }).click()
  const question = page.waitForRequest('**/scene/ask')
  await page.getByRole('button', { name: 'Show me all the chairs.' }).click()
  const objects = (await question).postDataJSON().graph.objects
  expect(objects).toHaveLength(2)
  expect(objects.find((object: { id: string }) => object.id === id)).toMatchObject({ assetId: 'sofa_2seat', size: [1.62, 0.86, 0.86], rotation: [0, Math.PI / 2, 0] })
  await expect(page.locator('.reply')).toContainText(/chair/i)
  await page.getByLabel('Selected in room').selectOption(id)
  await panel.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByLabel('Selected in room').locator('option')).toHaveCount(2)
  await panel.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByLabel('Selected in room')).toHaveValue(id)
  await page.getByLabel('Selected in room').selectOption('rp:chair')
  await panel.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByLabel('Selected in room').locator('option[value="rp:chair"]')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByLabel('Selected in room')).toHaveValue('rp:chair')
  if (testInfo.project.name === 'chromium') {
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Preparing your character' })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.__intelidarPlay?.grounded)).toBe(true)
    await page.getByRole('button', { name: 'Exit play' }).click()
    await page.getByRole('button', { name: 'Renovate', exact: true }).click()
    await expect(page.getByLabel('Selected in room').locator(`option[value="${id}"]`)).toHaveCount(1)
    await expect(page.getByLabel('Selected in room').locator('option[value="rp:chair"]')).toHaveCount(1)
  }
  expect(errors).toEqual([])
})
