import { expect, test, type Page } from '@playwright/test'

type PlayState = { position: [number, number, number]; animation: 'idle' | 'walk' | 'run'; grounded: boolean; source: 'demo' | 'glb' }

async function state(page: Page): Promise<PlayState> {
  return page.evaluate(() => (window as unknown as { __intelidarPlay: PlayState }).__intelidarPlay)
}

async function reconstructDemo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /^skip$/i }).click({ timeout: 20_000 })
  await page.getByRole('button', { name: /AI Reconstruct/ }).click()
  await expect(page.getByText('Semantic twin')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
}

async function enterPlay(page: Page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Exit play' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Preparing your character' })).toHaveCount(0, { timeout: 20_000 })
  await expect.poll(async () => (await state(page))?.grounded).toBe(true)
}

test('desktop avatar walks, runs, resets and stops at a wall on the floor', async ({ page }, testInfo) => {
  await reconstructDemo(page)
  await page.waitForTimeout(2_000)
  await page.screenshot({ path: testInfo.outputPath('furnished-room.png'), fullPage: true })
  await enterPlay(page)
  await page.screenshot({ path: testInfo.outputPath('desktop-play.png'), fullPage: true })
  await expect(page.getByRole('textbox', { name: /ask the spatial assistant/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  const start = await state(page)
  expect(start.source).toBe('demo')
  const avatarFrame = await page.evaluate(() => {
    const debug = window as unknown as {
      __intelidarPlay: PlayState
      __intelidarScene: { project: (point: [number, number, number]) => { x: number; y: number } }
    }
    const [x, y, z] = debug.__intelidarPlay.position
    const feet = debug.__intelidarScene.project([x, y, z])
    const head = debug.__intelidarScene.project([x, y + 1.8, z])
    return { height: Math.abs(feet.y - head.y), viewport: window.innerHeight }
  })
  expect(avatarFrame.height, 'The initial camera should show the character rather than filling the viewport with its torso').toBeLessThan(avatarFrame.viewport * 0.95)

  await page.keyboard.down('d')
  await expect.poll(async () => (await state(page)).animation).toBe('walk')
  await expect.poll(async () => (await state(page)).position[0] - start.position[0]).toBeGreaterThan(0.3)
  await page.keyboard.up('d')
  await expect.poll(async () => (await state(page)).animation).toBe('idle')

  const beforeRun = await state(page)
  await page.keyboard.down('Shift')
  await page.keyboard.down('s')
  await expect.poll(async () => (await state(page)).animation).toBe('run')
  await expect.poll(async () => (await state(page)).position[2] - beforeRun.position[2]).toBeGreaterThan(0.6)
  await page.keyboard.up('s')
  await page.keyboard.up('Shift')

  await page.getByRole('button', { name: 'Reset position' }).click()
  await expect.poll(async () => Math.hypot(...(await state(page)).position.map((value, index) => value - start.position[index]))).toBeLessThan(0.08)
  await page.keyboard.down('w')
  await expect.poll(async () => start.position[2] - (await state(page)).position[2]).toBeGreaterThan(0.2)
  await expect.poll(async () => (await state(page)).animation).toBe('idle')
  const blocked = await state(page)
  expect(blocked.grounded).toBe(true)
  expect(blocked.position[2]).toBeGreaterThanOrEqual(-4.8 + 0.21)
  expect(blocked.position[1]).toBeGreaterThan(-0.02)
  expect(blocked.position[1]).toBeLessThan(0.06)
  await page.keyboard.up('w')

  await page.keyboard.press('Escape')
  await expect(page.getByText('Semantic twin')).toBeVisible()
  await expect(page.getByRole('textbox', { name: /ask the spatial assistant/i })).toBeEnabled()
  await expect.poll(() => page.evaluate(() => '__intelidarPlay' in window)).toBe(false)
})

test('losing focus clears held movement and requires an explicit resume', async ({ page }) => {
  await reconstructDemo(page)
  await enterPlay(page)
  await page.keyboard.down('d')
  await expect.poll(async () => (await state(page)).animation).toBe('walk')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible()
  const paused = await state(page)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(250)
  expect((await state(page)).position).toEqual(paused.position)
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
  await page.keyboard.up('d')
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toHaveCount(0)
  await expect.poll(async () => (await state(page)).animation).toBe('idle')
  await page.waitForTimeout(250)
  expect((await state(page)).position[0]).toBeCloseTo(paused.position[0], 3)
  await page.getByRole('button', { name: 'Exit play' }).click()
  await expect(page.getByText('Semantic twin')).toBeVisible()
})

test('furniture edits survive a play session and mouse dragging turns the camera', async ({ page }) => {
  await reconstructDemo(page)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  // Allow the actual furniture materialisation to settle before picking a backrest.
  await page.waitForTimeout(2_000)
  const before = await page.evaluate(() => {
    const scene = (window as unknown as { __intelidarScene: {
      graph: { objects: { id: string; position: [number, number, number] }[] }
      project: (point: [number, number, number]) => { x: number; y: number }
    } }).__intelidarScene
    // Café chairs face across the table; their backrests are east of the seat.
    const chair = scene.graph.objects.find(object => object.id === 'chair-4')!
    return {
      position: chair.position,
      handle: scene.project([chair.position[0] + 0.20, chair.position[1] + 0.24, chair.position[2]]),
      target: scene.project([chair.position[0] + 0.5, 0, chair.position[2] + 0.3]),
    }
  })
  await page.mouse.move(before.handle.x, before.handle.y)
  await page.mouse.down()
  await page.mouse.move(before.target.x, before.target.y, { steps: 12 })
  await page.mouse.up()
  const chairPosition = () => page.evaluate(() => (window as unknown as {
    __intelidarScene: { graph: { objects: { id: string; position: [number, number, number] }[] } }
  }).__intelidarScene.graph.objects.find(object => object.id === 'chair-4')!.position)
  await expect.poll(async () => Math.hypot(...(await chairPosition()).map((value, index) => value - before.position[index]))).toBeGreaterThan(0.15)
  const edited = await chairPosition()
  await enterPlay(page)

  const pointBefore = await page.evaluate(() => (window as unknown as {
    __intelidarScene: { project: (point: [number, number, number]) => { x: number; y: number } }
  }).__intelidarScene.project([0, 1, 0]))
  const canvas = await page.locator('canvas').boundingBox()
  if (!canvas) throw new Error('The play canvas is missing')
  await page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.45)
  await page.mouse.down()
  await page.mouse.move(canvas.x + canvas.width * 0.6 + 120, canvas.y + canvas.height * 0.45, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => {
    const point = await page.evaluate(() => (window as unknown as {
      __intelidarScene: { project: (point: [number, number, number]) => { x: number; y: number } }
    }).__intelidarScene.project([0, 1, 0]))
    return Math.abs(point.x - pointBefore.x)
  }).toBeGreaterThan(20)
  await page.keyboard.press('Escape')
  await expect(page.getByText('Semantic twin')).toBeVisible()
  expect(await chairPosition()).toEqual(edited)
})
