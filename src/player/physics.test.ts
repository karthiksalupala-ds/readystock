// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import type { RoomEnvironment } from '../room/types'
import { loadRoomFile, normalizeRoom } from '../room/importRoom'
import { createRoomFixtureGlb } from '../room/roomFixture'
import { createPlayerSession, initializePhysics, PHYSICS_STEP, validateEnvironmentSpawn } from './physics'

const room = (): RoomEnvironment => ({
  id: 'test-room', bounds: { min: [-5, 0, -5], max: [5, 3, 5] }, spawn: [0, 0.02, 0],
  colliders: [{ kind: 'box', center: [0, -0.1, 0], halfExtents: [5, 0.1, 5] }],
})
beforeAll(initializePhysics)

describe('real Rapier room movement', () => {
  it('accepts supported clearance and rejects missing floors, walls, and low ceilings', async () => {
    expect(await validateEnvironmentSpawn(room())).toEqual({ valid: true })
    expect((await validateEnvironmentSpawn({ ...room(), colliders: [] })).valid).toBe(false)
    const blocked = room()
    blocked.colliders.push({ kind: 'box', center: [0, 1, 0], halfExtents: [0.3, 1, 0.3] })
    expect((await validateEnvironmentSpawn(blocked)).valid).toBe(false)
    const ceiling = room()
    ceiling.colliders.push({ kind: 'box', center: [0, 1.6, 0], halfExtents: [5, 0.1, 5] })
    expect((await validateEnvironmentSpawn(ceiling)).valid).toBe(false)
  })

  it('grounds the capsule, walks at the chosen speed, and stops at furniture', () => {
    const environment = room()
    environment.colliders.push({ kind: 'box', center: [0, 0.5, -2], halfExtents: [1, 0.5, 0.3] })
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const session = createPlayerSession(world, environment)
    try {
      for (let i = 0; i < 60; i++) { session.beforeStep({ x: 1, z: 0, run: false }, 0); world.step() }
      expect(session.feet()[0]).toBeCloseTo(1.6, 1)
      expect(session.feet()[1]).toBeGreaterThanOrEqual(-0.01)
      expect(session.feet()[1]).toBeLessThan(0.08)
      expect(session.grounded()).toBe(true)
      session.reset()
      for (let i = 0; i < 120; i++) { session.beforeStep({ x: 0, z: -1, run: true }, 0); world.step() }
      expect(session.feet()[2]).toBeGreaterThan(-1.5)
      expect(session.feet()[2]).toBeLessThan(-1.4)
      expect(session.animation()).toBe('idle')
    } finally { session.dispose(); world.free() }
  })

  it('slides along walls and shortens the camera before an obstruction', () => {
    const environment = room()
    environment.colliders.push({ kind: 'box', center: [1, 1.5, 0], halfExtents: [0.1, 1.5, 5] })
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const session = createPlayerSession(world, environment)
    try {
      for (let i = 0; i < 90; i++) { session.beforeStep({ x: 1, z: -1, run: false }, 0); world.step() }
      expect(session.feet()[0]).toBeLessThan(0.7)
      expect(session.feet()[2]).toBeLessThan(-1.5)
      expect(session.cameraDistance([0, 1.3, 0], [1, 0, 0], 3)).toBeLessThan(0.85)
      expect(session.cameraDistance([0, 1.3, 0], [-1, 0, 0], 3)).toBe(3)
      expect(world.timestep).toBeCloseTo(PHYSICS_STEP)
    } finally { session.dispose(); world.free() }
  })

  it('can search a blocked demo spawn but never relocates an imported spawn silently', () => {
    const environment = room()
    environment.colliders.push({ kind: 'box', center: [0, 0.5, 0], halfExtents: [0.5, 0.5, 0.5] })
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    try {
      expect(() => createPlayerSession(world, environment)).toThrow(/clear floor/i)
      const session = createPlayerSession(world, environment, true)
      expect(Math.hypot(session.feet()[0], session.feet()[2])).toBeGreaterThan(0.7)
      session.dispose()
    } finally { world.free() }
  })

  it('uses normalized imported triangles, preserves a doorway, and resets after falling beyond the measured floor', async () => {
    const loaded = await loadRoomFile(new File([createRoomFixtureGlb()], 'room.glb'))
    const environment = normalizeRoom(loaded, 0.5, [10, 2, 20]).environment
    expect((await validateEnvironmentSpawn(environment)).valid).toBe(true)
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const session = createPlayerSession(world, environment)
    try {
      for (let i = 0; i < 65; i++) { session.beforeStep({ x: 0, z: -1, run: true }, 0); world.step() }
      expect(session.feet()[2]).toBeLessThan(-3.1)
      for (let i = 0; i < 90; i++) { session.beforeStep({ x: 0, z: 0, run: false }, 0); world.step() }
      expect(session.feet()[2]).toBeCloseTo(0)
      expect(session.feet()[1]).toBeGreaterThanOrEqual(0)
      session.dispose()
      const againstWall = createPlayerSession(world, { ...environment, spawn: [-1, 0.02, 0] })
      try {
        for (let i = 0; i < 100; i++) { againstWall.beforeStep({ x: 0, z: -1, run: true }, 0); world.step() }
        expect(againstWall.feet()[2]).toBeGreaterThan(-2.8)
        expect(againstWall.feet()[2]).toBeLessThan(-2.7)
      } finally { againstWall.dispose() }
    } finally { world.free(); loaded.dispose() }
  })
})
