// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import type { RoomEnvironment } from '../room/types'
import type { SeatInteraction } from '../interaction/types'
import { createPlayerSession, initializePhysics, PHYSICS_STEP } from './physics'
import { demoEnvironment } from '../room/demoEnvironment'

const seat: SeatInteraction = { kind: 'seat', id: 'chair:0', objectId: 'chair', label: 'chair', point: [0, .46, .8], seat: [0, .46, .8], approach: [0, 0, .15], heading: Math.PI, floorY: 0 }
const room = (): RoomEnvironment => ({ id: 'seating-test', bounds: { min: [-3, 0, -3], max: [3, 3, 3] }, spawn: [0, .02, -.5], interactions: [seat], colliders: [
  { kind: 'box', center: [0, -.1, 0], halfExtents: [3, .1, 3] },
  { kind: 'box', objectId: 'chair', center: [0, .45, .8], halfExtents: [.25, .45, .25] },
] })
beforeAll(initializePhysics)
function run(environment: RoomEnvironment, test: (session: ReturnType<typeof createPlayerSession>, step: (n: number) => void, world: RAPIER.World) => void) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  const player = createPlayerSession(world, environment)
  player.setHeading(0)
  const step = (n: number) => { for (let i = 0; i < n; i++) { player.beforeStep({ x: 0, z: 0, run: false }, 0); world.step() } }
  try { step(1); test(player, step, world) } finally { player.dispose(); world.free() }
}
describe('real Rapier seating safety', () => {
  it('sits, ignores movement, freezes without physics steps, and stands on supported floor', () => run(room(), (player, step, world) => {
    player.interact(); expect(player.interaction().phase).toBe('aligning')
    step(70); expect(player.interaction().phase).toBe('seated')
    expect(player.cameraDistance([0, .65, .8], [0, .17, 1], 2)).toBe(2)
    const position = player.feet()
    for (let i = 0; i < 20; i++) { player.beforeStep({ x: 1, z: 1, run: true }, 0); world.step() }
    expect(player.feet()).toEqual(position)
    player.interact(); step(10)
    const frozen = player.feet()
    expect(player.interaction().phase).toBe('standing_up')
    expect(player.feet()).toEqual(frozen)
    step(60); expect(player.interaction().phase).toBe('standing')
    expect(player.feet()[1]).toBeCloseTo(.02, 1)
    expect(player.grounded()).toBe(true)
    expect(world.timestep).toBeCloseTo(PHYSICS_STEP)
  }))
  it('rejects an obstructed short approach and insufficient headroom around a seat', () => {
    for (const obstacle of [
      { kind: 'box' as const, center: [0, .3, -.05] as [number, number, number], halfExtents: [.4, .3, .1] as [number, number, number] },
      { kind: 'box' as const, center: [0, 1.7, .8] as [number, number, number], halfExtents: [.5, .1, .5] as [number, number, number] },
    ]) {
      const environment = room(); environment.colliders.push(obstacle)
      run(environment, player => { player.interact(); expect(player.interaction().phase).toBe('standing'); expect(player.interaction().available).toBe(false) })
    }
  })
  it('rejects missing floor at the exit and keeps other furniture as visibility blockers', () => {
    const environment = room(); environment.colliders[0] = { kind: 'box', center: [0, -.1, -1], halfExtents: [3, .1, .8] }
    run(environment, player => { player.interact(); expect(player.interaction()).toMatchObject({ phase: 'standing', available: false }) })
    const blocked = room(); blocked.colliders.push({ kind: 'box', center: [0, 1, .05], halfExtents: [1, 1, .06] })
    run(blocked, player => expect(player.interaction().targetId).toBeNull())
  })
  it('clears seat attachment on reset and handles a rotated seat', () => {
    run(room(), (player, step) => { player.interact(); step(18); player.reset(); step(1); expect(player.interaction().phase).toBe('standing'); expect(player.feet()[2]).toBeCloseTo(-.5) })
    const rotated = room(); rotated.spawn = [-.5, .02, 0]
    rotated.interactions = [{ ...seat, point: [.8, .46, 0], seat: [.8, .46, 0], approach: [.15, 0, 0], heading: -Math.PI / 2 }]
    rotated.colliders[1] = { kind: 'box', objectId: 'chair', center: [.8, .45, 0], halfExtents: [.25, .45, .25], rotation: [0, Math.PI / 2, 0] }
    run(rotated, (player, step) => { player.setHeading(Math.PI / 2); step(1); player.interact(); step(70); expect(player.interaction().phase).toBe('seated'); player.interact(); step(50); expect(player.feet()[0]).toBeCloseTo(.15, 1) })
  })
  it('uses a clear side entry when the front is blocked and refuses a newly blocked exit', () => {
    const environment = room()
    environment.interactions = [{ ...seat, approach: [0, 0, 1.5], approaches: [[.7, 0, .3]] }]
    environment.colliders.push({ kind: 'box', center: [0, .5, 1.6], halfExtents: [.4, .5, .2] })
    run(environment, (player, step, world) => {
      player.interact(); step(70); expect(player.interaction().phase).toBe('seated')
      world.createCollider(RAPIER.ColliderDesc.cuboid(.3, 1, .3).setTranslation(.7, 1, .3)); world.step()
      player.interact(); expect(player.interaction()).toMatchObject({ phase: 'seated', available: false })
      player.reset(); expect(player.interaction().phase).toBe('standing')
    })
  })
  it('can use the original demo chair beside its conference table', () => {
    const environment = demoEnvironment({ room: { id: 'demo', name: 'Demo', width: 7.4, depth: 5.2, height: 2.8, units: 'm' }, objects: [
      { id: 'table-1', type: 'table', label: 'Table', category: 'furniture', position: [0, .38, .15], size: [2.4, .76, 1.2] },
      { id: 'chair-4', type: 'chair', label: 'Chair', category: 'furniture', position: [.7, .46, -.85], size: [.48, .92, .52], rotation: [0, 0, 0], shape: 'task' },
    ] })
    environment.spawn = [1.65, .02, -.85]
    run(environment, (player, step) => {
      player.setHeading(-Math.PI / 2); step(1)
      expect(player.interaction()).toMatchObject({ targetId: 'chair-4', available: true })
      player.interact(); step(70); expect(player.interaction().phase).toBe('seated')
      player.interact(); step(50); expect(player.feet()[0]).toBeCloseTo(1.44, 1)
    })
  })
  it('rejects low furniture in the seated feet space even when a side entry is clear', () => {
    const environment = room()
    environment.spawn = [.7, .02, -.4]
    environment.interactions = [{ ...seat, approaches: [[.7, 0, .8]] }]
    environment.colliders.push({ kind: 'box', center: [0, .15, .35], halfExtents: [.25, .15, .08] })
    run(environment, (player, step) => {
      player.setHeading(Math.atan2(-.7, 1.2)); step(1)
      expect(player.interaction()).toMatchObject({ targetId: 'chair', available: false })
      player.interact(); expect(player.interaction().phase).toBe('standing')
    })
  })
})
