import { describe, expect, it } from 'vitest'
import { buildObjectCloud, buildRoomCloud } from './scanCloud'
import { revealWindowFor, scanBearing, sensorOrigin } from './scanReveal'
import { sampleGraph } from '../test/sampleGraph'

const room = sampleGraph.room
const origin = sensorOrigin(room)
const table = sampleGraph.objects[0]

function points(cloud: { positions: Float32Array; count: number }) {
  return Array.from({ length: cloud.count }, (_, index) => [
    cloud.positions[index * 3],
    cloud.positions[index * 3 + 1],
    cloud.positions[index * 3 + 2],
  ])
}

describe('buildObjectCloud', () => {
  const cloud = buildObjectCloud(table, origin)

  it('packs one position, one window and one seed per return', () => {
    expect(cloud.count).toBeGreaterThan(50)
    expect(cloud.positions).toHaveLength(cloud.count * 3)
    expect(cloud.windows).toHaveLength(cloud.count * 2)
    expect(cloud.seeds).toHaveLength(cloud.count)
  })

  it('lays the returns on the surface of the box, in local space', () => {
    const half = table.size.map((value) => value / 2)
    for (const [x, y, z] of points(cloud)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(half[0] + 1e-6)
      expect(Math.abs(y)).toBeLessThanOrEqual(half[1] + 1e-6)
      expect(Math.abs(z)).toBeLessThanOrEqual(half[2] + 1e-6)
      const onAFace =
        Math.abs(Math.abs(x) - half[0]) < 1e-6 ||
        Math.abs(Math.abs(y) - half[1]) < 1e-6 ||
        Math.abs(Math.abs(z) - half[2]) < 1e-6
      expect(onAFace).toBe(true)
    }
  })

  it('repeats exactly, so a re-render never reshuffles the scan', () => {
    const again = buildObjectCloud(table, origin)
    expect(Array.from(again.positions)).toEqual(Array.from(cloud.positions))
    expect(Array.from(again.seeds)).toEqual(Array.from(cloud.seeds))
  })

  it('opens each return at the bearing the beam finds it', () => {
    for (let index = 0; index < cloud.count; index += 1) {
      const start = cloud.windows[index * 2]
      const end = cloud.windows[index * 2 + 1]
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeLessThanOrEqual(1)
      expect(end).toBeGreaterThan(start)
    }

    const centre = revealWindowFor(scanBearing(table.position[0], table.position[2], origin))
    const starts = Array.from({ length: cloud.count }, (_, index) => cloud.windows[index * 2])
    expect(Math.min(...starts)).toBeLessThanOrEqual(centre.start + 0.3)
    expect(Math.max(...starts)).toBeGreaterThanOrEqual(centre.start - 0.3)
  })

  it('gives every return its own jitter seed', () => {
    const unique = new Set(Array.from(cloud.seeds))
    expect(unique.size).toBeGreaterThan(cloud.count / 2)
  })

  it('times rotated local returns using their world-space bearing', () => {
    const rotated = buildObjectCloud({ ...table, rotation: [0, Math.PI / 2, 0] }, origin)
    for (let index = 0; index < rotated.count; index += 1) {
      const x = table.position[0] + rotated.positions[index * 3 + 2]
      const z = table.position[2] - rotated.positions[index * 3]
      const expected = revealWindowFor(scanBearing(x, z, origin))
      expect(rotated.windows[index * 2 + 1]).toBeCloseTo(expected.end, 5)
    }
  })
})

describe('buildRoomCloud', () => {
  const cloud = buildRoomCloud(room, origin)

  it('covers the shell far more densely than a single object', () => {
    expect(cloud.count).toBeGreaterThan(buildObjectCloud(table, origin).count)
  })

  it('keeps every return on the room shell', () => {
    for (const [x, y, z] of points(cloud)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(room.width / 2 + 1e-6)
      expect(Math.abs(z)).toBeLessThanOrEqual(room.depth / 2 + 1e-6)
      expect(y).toBeGreaterThanOrEqual(-1e-6)
      expect(y).toBeLessThanOrEqual(room.height + 1e-6)
    }
  })

  it('spreads the reveal across the whole turn', () => {
    const starts = Array.from({ length: cloud.count }, (_, index) => cloud.windows[index * 2])
    expect(Math.min(...starts)).toBeLessThan(0.1)
    expect(Math.max(...starts)).toBeGreaterThan(0.7)
  })
})
