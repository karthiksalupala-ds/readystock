import { expect, test, type Download, type Page } from '@playwright/test'
import path from 'node:path'

test.use({ reducedMotion: 'reduce' })

/**
 * Keep a download under its real name.
 *
 * `download.path()` hands back an extensionless temp file, and the room importer
 * reads the extension, so re-uploading that path would test the wrong thing.
 */
async function saveAs(download: Download, testInfo: import('@playwright/test').TestInfo): Promise<string> {
  const target = path.join(testInfo.outputDir, download.suggestedFilename())
  await download.saveAs(target)
  return target
}

/** Load the simulated floor and reconstruct it, so there is a labelled room to export. */
async function twinFloor(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /AI Reconstruct/ })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Import scan', exact: true }).click()
  await page.getByRole('button', { name: /load simulated scan/i }).click()
  await page.getByRole('button', { name: /AI Reconstruct/ }).click()
  await expect(page.getByText('Semantic twin')).toBeVisible({ timeout: 30_000 })
}

test('every export saves a real file named after the room', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await twinFloor(page)

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Take this room with you' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/open-plan office floor · 18 × 11.6 m · 106 objects/)).toBeVisible()

  for (const [label, filename] of [
    [/Scan file/, 'open-plan-office-floor.intelidar.json'],
    [/Object schedule/, 'open-plan-office-floor.csv'],
    [/Floor plan/, 'open-plan-office-floor.svg'],
    [/3D model/, 'open-plan-office-floor.glb'],
  ] as const) {
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: label }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe(filename)
    await expect(dialog.getByRole('status')).toContainText(filename)
  }
  expect(errors).toEqual([])
})

test('an exported scan file re-imports with the edits that were in it', async ({ page }, testInfo) => {
  await twinFloor(page)

  // Add a sofa, then export: the file must carry the renovation, not the original floor.
  await page.getByRole('button', { name: 'Renovate', exact: true }).click()
  const panel = page.getByRole('complementary', { name: 'Renovation', exact: true })
  await page.getByLabel('Search furniture').fill('sofa')
  await panel.getByRole('button', { name: 'Add Two-seat sofa', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Furniture added')

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Scan file/ }).click()
  const saved = await saveAs(await download, testInfo)

  await page.reload()
  await expect(page.getByRole('button', { name: /AI Reconstruct/ })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Import scan', exact: true }).click()
  await page.getByLabel('Choose scan from Files').setInputFiles(saved)

  await expect(page.locator('.app')).toHaveAttribute('data-source', 'simulated')
  // 106 from the generated floor, plus the sofa that was added before exporting.
  await expect(page.getByText('107', { exact: true })).toBeVisible()
})

test('an exported model opens again as a playable room', async ({ page }, testInfo) => {
  await twinFloor(page)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /3D model/ }).click()
  const glb = await saveAs(await download, testInfo)

  await page.reload()
  await page.getByLabel('Import room file').setInputFiles(glb)
  await expect(page.getByRole('heading', { name: 'Choose where to start' })).toBeVisible({ timeout: 30_000 })
  // Written in metres, so the importer needs no unit correction to read the room back.
  await expect(page.getByLabel('Model units')).toHaveValue('1')
  await expect(page.locator('.room-dimensions')).toContainText('18.10 × 3.20 × 11.70')
})
