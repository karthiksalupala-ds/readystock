import { expect, test } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

test('simulated floor: load without a device, reconstruct, ask, then renovate', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: /AI Reconstruct/ })).toBeEnabled({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Import scan', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Bring your room into InteLiDar' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /load simulated scan/i }).click()
  await expect(dialog).not.toBeVisible()

  // The bigger room arrives as raw geometry, and says what produced it.
  await expect(page.locator('.app')).toHaveAttribute('data-source', 'simulated')
  await expect(page.locator('.tag')).toHaveText('Simulated LiDAR · no device')
  await expect(page.getByText('Simulated scan · no device')).toBeVisible()
  await expect(page.getByText('18 × 11.6 × 3.1 m')).toBeVisible()
  await expect(page.getByText('Unlabelled scan')).toBeVisible()

  // Nothing is named until the reconstructor names it.
  await expect(page.getByText('Office chair')).toHaveCount(0)
  await expect(page.locator('.obj-label', { hasText: 'Unknown object' }).first()).toBeVisible()

  const reconstruct = page.getByRole('button', { name: /AI Reconstruct/ })
  await expect(reconstruct).toBeEnabled()
  const request = page.waitForRequest('**/scene/reconstruct')
  await reconstruct.click()
  expect((await request).postDataJSON().graph.source).toBe('simulated')

  await expect(page.getByText('Semantic twin')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'open-plan office floor' })).toBeVisible()
  // Generated labels survive reconstruction instead of being re-guessed by size.
  await expect(page.locator('.obj-label', { hasText: 'Office chair' }).first()).toBeVisible()
  await expect(page.locator('.obj-label', { hasText: 'Bookshelf' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Show me all the chairs.' }).click()
  await expect(page.locator('.reply')).toContainText(/chair/i)

  await page.getByRole('button', { name: 'Where is the door?' }).click()
  await expect(page.locator('.reply')).toContainText(/door|exit/i)

  // The floor is editable like any other scene.
  await page.getByRole('button', { name: 'Renovate' }).click()
  await expect(page.getByRole('complementary', { name: /renovat/i })).toBeVisible()

  expect(errors).toEqual([])
})

test('the simulated scan is offered as a file a presenter can keep', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import scan', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Bring your room into InteLiDar' })

  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: /save the scan file/i }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('simulated-office-floor.intelidar.json')

  // And the file it saves is a scan the importer accepts.
  await dialog.getByLabel('Choose scan from Files').setInputFiles(await file.path())
  await expect(page.locator('.app')).toHaveAttribute('data-source', 'simulated')
})
