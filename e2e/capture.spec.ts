import { expectdo, test } from '@playwright/test'
import { roomPlanCapture } from '../src/test/roomPlanCapture'

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })

test('imports a real-format scan on a phone viewport without the demo API, then edits and asks', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/scene/ingest', (route) => route.fulfill({ status: 503, body: 'Unavailable' }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Import scan', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Bring your room into InteLiDar' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Choose scan from Files').setInputFiles({ name: 'room.intelidar.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(roomPlanCapture)) })
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.app')).toHaveAttribute('data-source', 'roomplan')
  await expect(page.locator('.tag')).toHaveText('iPhone LiDAR · RoomPlan')
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByText('Backend unavailable. Start the API on port 8000.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Object', { exact: true }).selectOption('rp:chair')
  await page.getByLabel('Shape', { exact: true }).selectOption('armchair')
  await page.getByRole('button', { name: 'Use color #b96348' }).click()
  const requestPromise = page.waitForRequest('**/scene/ask')
  await page.getByRole('button', { name: 'Show me all the chairs.' }).click()
  const request = await requestPromise
  expect(request.postDataJSON().graph.source).toBe('roomplan')
  expect(request.postDataJSON().graph.objects[0]).toMatchObject({ id: 'rp:chair', shape: 'armchair', color: '#b96348', rotation: [0, 1.2, 0] })
  await expect(page.locator('.reply')).toContainText(/chair/i)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('invalid import reports an error and keeps the current scene', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import scan', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Choose scan from Files').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  await expect(dialog.getByRole('alert')).toContainText('InteLiDar Capture')
  await expect(page.locator('.app')).toHaveAttribute('data-source', 'demo')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: /AI Reconstruct/ })).toBeEnabled()
})
