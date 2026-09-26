import { expect, test, type Page } from '@playwright/test'
import type { SceneObject, Vec3 } from '../src/scene/types'

test.use({ viewport: { width: 960, height: 640 } })

type PlayState = {
  position: Vec3; animation: string; grounded: boolean; yaw: number; toggles: Record<string, boolean>
  interaction: { phase: string; targetId: string | null; interactionId: string | null; label: string; available: boolean; reason?: string }
}

const capture = (objects: SceneObject[]) => ({
  format: 'intelidar.roomplan', version: 1, source: 'roomplan',
  room: { id: 'rp:sandbox', name: 'Interaction test room', width: 6, depth: 6, height: 2.8, units: 'm' }, objects,
})
const chair: SceneObject = { id: 'rp:chair', type: 'chair', label: 'Chair', category: 'furniture',
  position: [-1, .45, 0], size: [.5, .9, .5], rotation: [0, 0, 0], material: 'fabric', color: '#467568' }

async function state(page: Page): Promise<PlayState> {
  return page.evaluate(() => (window as unknown as { __intelidarPlay: PlayState }).__intelidarPlay)
}
async function objects(page: Page): Promise<SceneObject[]> {
  return page.evaluate(() => (window as unknown as { __intelidarScene: { graph: { objects: SceneObject[] } } }).__intelidarScene.graph.objects)
}
async function importScan(page: Page, scene: ReturnType<typeof capture>) {
  await page.getByRole('button', { name: 'Import scan', exact: true }).click()
  await page.getByLabel('Choose scan from Files').setInputFiles({ name: 'sandbox.intelidar.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(scene)) })
  await expect(page.locator('.app')).toHaveAttribute('data-source', 'roomplan')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
}
async function enterPlay(page: Page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Exit play' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Preparing your character' })).toHaveCount(0, { timeout: 20_000 })
  await expect.poll(async () => (await state(page))?.grounded).toBe(true)
}
async function gameplayQuality(page: Page, motion = false) {
  await page.getByRole('button', { name: 'Graphics', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Graphics', exact: true })
  await menu.getByRole('button', { name: 'Low', exact: true }).click()
  if (motion) await menu.getByRole('switch', { name: /^Animation/ }).click()
  await page.getByRole('button', { name: 'Graphics', exact: true }).click()
}

/** Move through clear fixture waypoints with real WASD. Telemetry is read-only. */
async function walkTo(page: Page, x: number, z: number) {
  for (let step = 0; step < 100; step++) {
    const player = await state(page)
    const dx = x - player.position[0], dz = z - player.position[2]
    if (Math.hypot(dx, dz) < .18) return
    const localX = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)
    const localZ = dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw)
    const threshold = Math.max(Math.abs(localX), Math.abs(localZ)) * .45
    const keys = [Math.abs(localX) >= threshold ? localX > 0 ? 'd' : 'a' : null,
      Math.abs(localZ) >= threshold ? localZ > 0 ? 's' : 'w' : null].filter((key): key is string => key !== null)
    try {
      for (const key of keys) await page.keyboard.down(key)
      await page.waitForTimeout(120)
    } finally { for (const key of keys) await page.keyboard.up(key) }
  }
  throw new Error(`Could not walk to (${x}, ${z}); player is ${JSON.stringify(await state(page))}`)
}

async function faceObject(page: Page, objectId: string, point: [number, number]) {
  const player = await state(page)
  const desiredYaw = Math.atan2(player.position[0] - point[0], player.position[2] - point[1])
  let turn = Math.atan2(Math.sin(desiredYaw - player.yaw), Math.cos(desiredYaw - player.yaw))
  const canvas = await page.locator('canvas').first().boundingBox()
  if (!canvas) throw new Error('The play canvas is missing')
  while (Math.abs(turn) > .001) {
    const part = Math.max(-.7, Math.min(.7, turn))
    const x = canvas.x + canvas.width * .5, y = canvas.y + canvas.height * .45
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - part / .004, y, { steps: 4 })
    await page.mouse.up()
    turn -= part
  }
  // Avatar heading follows actual movement, independently of the camera.
  await expect.poll(async () => {
    const yaw = (await state(page)).yaw
    return Math.abs(Math.atan2(Math.sin(yaw - desiredYaw), Math.cos(yaw - desiredYaw)))
  }).toBeLessThan(.03)
  const start = (await state(page)).position
  await page.keyboard.down('w')
  try {
    await expect.poll(async () => {
      const current = (await state(page)).position
      return Math.hypot(current[0] - start[0], current[2] - start[2])
    }, { timeout: 3_000, intervals: [25] }).toBeGreaterThan(.025)
  }
  finally { await page.keyboard.up('w') }
  try { await expect.poll(async () => (await state(page)).interaction.targetId, { timeout: 3_000, intervals: [50] }).toBe(objectId) }
  catch (cause) { throw new Error(`Could not target ${objectId}; final player ${JSON.stringify(await state(page))}`, { cause }) }
}

async function addFurniture(page: Page, name: string, search: string) {
  const panel = page.getByRole('complementary', { name: 'Renovation', exact: true })
  await page.getByLabel('Search furniture').fill(search)
  await panel.getByRole('button', { name: new RegExp(`^${name} \\d`) }).click()
  await panel.getByRole('button', { name: `Add ${name}`, exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Furniture added')
  await expect(page.locator('[data-loading-model]')).toHaveCount(0)
  return page.getByLabel('Selected in room').inputValue()
}

test('photo café chair can be reached from the main aisle', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.getByRole('button', { name: /^skip$/i }).click({ timeout: 20_000 })
  await page.getByRole('button', { name: /AI Reconstruct/ }).click()
  await expect(page.getByText('Semantic twin')).toBeVisible({ timeout: 20_000 })
  await gameplayQuality(page, true)
  await enterPlay(page)
  await walkTo(page, 1.6, 2.05)
  await walkTo(page, .36, 1.95)
  await faceObject(page, 'chair-2', [.36, 1.15])
  await expect(page.getByRole('button', { name: 'Sit on chair', exact: true })).toBeEnabled()
  await page.keyboard.press('e')
  await expect.poll(async () => (await state(page)).interaction.phase).toBe('seated')
  await expect.poll(async () => (await state(page)).animation).toBe('seated_idle')
  await page.screenshot({ path: testInfo.outputPath('demo-chair-seated.png') })
  await page.getByRole('button', { name: 'Stand up', exact: true }).click()
  await expect.poll(async () => (await state(page)).interaction.phase).toBe('standing')
  await expect.poll(async () => (await state(page)).grounded).toBe(true)
})

test('RoomPlan chair supports sit/stand, held E, seated camera, pause, reset, and Escape', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await gameplayQuality(page, true)
  await importScan(page, capture([chair]))
  await enterPlay(page)
  const spawn = (await state(page)).position
  await walkTo(page, 1.5, 1.05)
  await walkTo(page, -1, 1.05)
  await faceObject(page, chair.id, [-1, 0])
  await expect(page.getByRole('button', { name: 'Sit on chair', exact: true })).toBeEnabled()
  await page.keyboard.down('e')
  await expect.poll(async () => (await state(page)).interaction.phase).toBe('seated')
  await expect.poll(async () => (await state(page)).animation).toBe('seated_idle')
  await page.keyboard.down('e')
  await page.waitForTimeout(250)
  expect((await state(page)).interaction.phase).toBe('seated')
  await page.keyboard.up('e')
  const seated = await state(page)
  await page.keyboard.down('d')
  await page.waitForTimeout(250)
  await page.keyboard.up('d')
  expect((await state(page)).position).toEqual(seated.position)
  const oldYaw = seated.yaw
  await page.mouse.move(640, 320)
  await page.mouse.down()
  await page.mouse.move(750, 320, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => Math.abs((await state(page)).yaw - oldYaw)).toBeGreaterThan(.2)
  await expect.poll(() => page.evaluate(() => {
    const debug = window as unknown as { __intelidarPlay: PlayState; __intelidarScene: { project: (point: Vec3) => { x: number; y: number } } }
    const [x, y, z] = debug.__intelidarPlay.position
    const low = debug.__intelidarScene.project([x, y, z])
    const high = debug.__intelidarScene.project([x, y + 1.4, z])
    return Math.abs(high.y - low.y) / window.innerHeight
  })).toBeLessThan(.95)
  await page.screenshot({ path: testInfo.outputPath('roomplan-seated.png') })

  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stand up', exact: true })).toHaveCount(0)
  await page.keyboard.press('e')
  await page.waitForTimeout(250)
  expect((await state(page)).position).toEqual(seated.position)
  expect((await state(page)).animation).toBe('seated_idle')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.getByRole('button', { name: 'Stand up', exact: true }).click()
  await expect.poll(async () => (await state(page)).interaction.phase).toBe('standing')
  await expect.poll(async () => (await state(page)).grounded).toBe(true)

  await faceObject(page, chair.id, [-1, 0])
  await page.getByRole('button', { name: 'Sit on chair', exact: true }).click()
  await page.waitForFunction(() => window.__intelidarPlay?.interaction.phase === 'sitting_down', undefined, { polling: 'raf' })
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible()
  const transition = await state(page)
  expect(transition.interaction.phase).toBe('sitting_down')
  expect(transition.animation).toBe('sit_down')
  await page.keyboard.press('e')
  await page.waitForTimeout(250)
  const frozen = await state(page)
  expect(frozen.interaction.phase).toBe(transition.interaction.phase)
  expect(frozen.position).toEqual(transition.position)
  expect(frozen.animation).toBe(transition.animation)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect.poll(async () => (await state(page)).interaction.phase).toBe('seated')
  await page.getByRole('button', { name: 'Reset position' }).click()
  await expect.poll(async () => (await state(page)).interaction.phase).toBe('standing')
  await expect.poll(async () => Math.hypot(...(await state(page)).position.map((v, i) => v - spawn[i]))).toBeLessThan(.1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => '__intelidarPlay' in window)).toBe(false)
})

test('rotated renovation sofa has independent cushions and preserves its layout after play', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await gameplayQuality(page)
  await importScan(page, capture([]))
  await page.getByRole('button', { name: 'Renovate', exact: true }).click()
  const sofaId = await addFurniture(page, 'Two-seat sofa', 'sofa')
  const panel = page.getByRole('complementary', { name: 'Renovation', exact: true })
  await panel.getByRole('button', { name: 'Rotate 90°' }).click()
  const edited = (await objects(page)).find(object => object.id === sofaId)!
  expect(edited.rotation).toEqual([0, Math.PI / 2, 0])
  await enterPlay(page)
  await expect(panel).toHaveCount(0)
  await walkTo(page, 1.05, .3275)
  await faceObject(page, sofaId, [0, .3275])
  await page.getByRole('button', { name: 'Sit on sofa', exact: true }).click()
  await expect.poll(async () => (await state(page)).interaction.phase).toBe('seated')
  const firstSeat = (await state(page)).interaction.interactionId
  await page.screenshot({ path: testInfo.outputPath('rotated-catalog-sofa-seated.png') })
  await page.keyboard.press('e')
  await expect.poll(async () => (await state(page)).interaction.phase).toBe('standing')
  await walkTo(page, 1.05, -.3275)
  await faceObject(page, sofaId, [0, -.3275])
  await page.getByRole('button', { name: 'Sit on sofa', exact: true }).click()
  await expect.poll(async () => (await state(page)).interaction.phase).toBe('seated')
  expect((await state(page)).interaction.interactionId).not.toBe(firstSeat)
  await page.keyboard.press('Escape')
  expect((await objects(page)).find(object => object.id === sofaId)).toEqual(edited)
  await enterPlay(page)
  expect((await state(page)).interaction.phase).toBe('standing')
})

test('duplicate catalog lamps and a screen toggle independently and persist until the semantic room is replaced', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await gameplayQuality(page)
  const screenObject: SceneObject = { id: 'rp:screen', type: 'monitor', label: 'Monitor', category: 'equipment',
    position: [-2, 1.05, 1.5], size: [.6, .5, .2], rotation: [0, 0, 0], material: 'plastic' }
  const fixture = capture([screenObject])
  await importScan(page, fixture)
  await page.getByRole('button', { name: 'Renovate', exact: true }).click()
  const lampA = await addFurniture(page, 'Floor lamp', 'lamp')
  const lampB = await addFurniture(page, 'Floor lamp', 'lamp')
  const allObjects = await objects(page)
  const first = allObjects.find(object => object.id === lampA)!, second = allObjects.find(object => object.id === lampB)!
  await enterPlay(page)
  expect((await state(page)).toggles[lampA] ?? false).toBe(false)
  expect((await state(page)).toggles[lampB] ?? false).toBe(false)

  for (const [lamp, neighbor] of [[first, second], [second, first]]) {
    await page.getByRole('button', { name: 'Reset position' }).click()
    await walkTo(page, 2, -2)
    const dx = lamp.position[0] - neighbor.position[0], dz = lamp.position[2] - neighbor.position[2]
    const alongX = Math.abs(dx) >= Math.abs(dz), sign = Math.sign(alongX ? dx : dz)
    if (alongX) {
      await walkTo(page, sign * 2, -2)
      await walkTo(page, sign * 2, lamp.position[2])
      await walkTo(page, lamp.position[0] + sign * .95, lamp.position[2])
    } else {
      await walkTo(page, 2, sign * 2)
      await walkTo(page, lamp.position[0], sign * 2)
      await walkTo(page, lamp.position[0], lamp.position[2] + sign * .95)
    }
    await faceObject(page, lamp.id, [lamp.position[0], lamp.position[2]])
    await page.getByRole('button', { name: 'Turn on lamp', exact: true }).click()
    await expect.poll(async () => (await state(page)).toggles[lamp.id]).toBe(true)
    await expect(page.getByRole('button', { name: 'Turn off lamp', exact: true })).toBeVisible()
    if (lamp.id === lampA) expect((await state(page)).toggles[lampB] ?? false).toBe(false)
    else expect((await state(page)).toggles[lampA]).toBe(true)
  }
  await page.getByRole('button', { name: 'Turn off lamp', exact: true }).click()
  await expect.poll(async () => (await state(page)).toggles[lampB]).toBe(false)
  expect((await state(page)).toggles[lampA]).toBe(true)

  await page.getByRole('button', { name: 'Reset position' }).click()
  await walkTo(page, 2, -2)
  await walkTo(page, 2, 2.35)
  await walkTo(page, -2, 2.35)
  await faceObject(page, screenObject.id, [-2, 1.5])
  await page.keyboard.press('e')
  await expect(page.getByRole('button', { name: 'Turn off screen', exact: true })).toBeVisible()
  await expect.poll(async () => (await state(page)).toggles[screenObject.id]).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('lamps-and-screen.png') })
  await page.keyboard.press('Escape')
  await enterPlay(page)
  expect((await state(page)).toggles).toMatchObject({ [lampA]: true, [lampB]: false, [screenObject.id]: true })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Renovate', exact: true }).click()
  const panel = page.getByRole('complementary', { name: 'Renovation', exact: true })
  await page.getByLabel('Selected in room').selectOption(lampA)
  await panel.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByLabel('Selected in room').locator(`option[value="${lampA}"]`)).toHaveCount(0)
  await panel.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByLabel('Selected in room')).toHaveValue(lampA)
  await enterPlay(page)
  expect((await state(page)).toggles[lampA] ?? false).toBe(false)
  expect((await state(page)).toggles[screenObject.id]).toBe(true)
  await page.keyboard.press('Escape')
  await importScan(page, fixture)
  await enterPlay(page)
  expect((await state(page)).toggles).toEqual({})
})
