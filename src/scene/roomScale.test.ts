import { describe, expect, it } from 'vitest'
import { LABEL_BUDGET, ceilingLights, isMeasured, isSpacious, needsFraming, shadowExtent, showsLabel } from './roomScale'
import { SIMULATED_ROOM } from './simulatedCapture'
import { sampleGraph } from '../test/sampleGraph'
import type { SceneRoom } from './types'

const demo: SceneRoom = sampleGraph.room
const floor: SceneRoom = { id: 'sim', name: 'floor', units: 'm', ...SIMULATED_ROOM }

describe('scaling the viewer to the room', () => {
  it('treats the demo meeting room as small and a simulated floor as spacious', () => {
    expect(isSpacious(demo)).toBe(false)
    expect(isSpacious(floor)).toBe(true)
  })

  it('counts only a device capture as measured, so a simulated scan keeps its sweep', () => {
    expect(isMeasured({ ...sampleGraph, source: 'roomplan' })).toBe(true)
    expect(isMeasured({ ...sampleGraph, source: 'simulated' })).toBe(false)
    expect(isMeasured({ ...sampleGraph, source: 'demo' })).toBe(false)
    expect(isMeasured(null)).toBe(false)
  })

  it('frames any imported scan, and any room too big for the demo shot', () => {
    expect(needsFraming({ ...sampleGraph, source: 'demo' })).toBe(false)
    expect(needsFraming({ ...sampleGraph, source: 'roomplan' })).toBe(true)
    expect(needsFraming({ ...sampleGraph, source: 'simulated' })).toBe(true)
    expect(needsFraming({ room: floor, objects: [] })).toBe(true)
    expect(needsFraming(null)).toBe(false)
  })

  it('names every object in the demo room and only the answer in a crowded one', () => {
    expect(showsLabel({ total: 9, highlighted: false })).toBe(true)
    expect(showsLabel({ total: LABEL_BUDGET, highlighted: false })).toBe(true)
    expect(showsLabel({ total: 106, highlighted: false })).toBe(false)
    expect(showsLabel({ total: 106, highlighted: true })).toBe(true)
  })

  it('covers the whole floor with the shadow camera', () => {
    expect(shadowExtent(demo)).toBeGreaterThanOrEqual(demo.width / 2)
    expect(shadowExtent(floor)).toBeGreaterThanOrEqual(floor.width / 2)
  })

  it('lights a meeting room with one lamp and a long floor with a row of them', () => {
    const small = ceilingLights(demo)
    expect(small).toHaveLength(1)
    expect(small[0].position).toEqual([0, demo.height - 0.4, 0])

    const many = ceilingLights(floor)
    expect(many.length).toBeGreaterThan(1)
    for (const lamp of many) {
      expect(lamp.position[1]).toBeCloseTo(floor.height - 0.4)
      // Inside the room, and reaching far enough to meet its neighbour.
      expect(Math.abs(lamp.position[0])).toBeLessThan(floor.width / 2)
      expect(lamp.distance).toBeGreaterThan(floor.width / many.length)
    }
    // Spread along the long axis, not stacked in the middle.
    expect(new Set(many.map((lamp) => lamp.position[0])).size).toBe(many.length)
  })
})
