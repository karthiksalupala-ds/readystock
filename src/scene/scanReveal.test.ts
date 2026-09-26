import { describe, expect, it } from 'vitest'
import {
  MATERIALISE_SPAN,
  REVEAL_SPAN,
  SCAN_POINT_TOTAL,
  SWEEP_SPAN,
  beamRotationY,
  capturedPoints,
  materialiseWindow,
  revealAmount,
  revealWindowFor,
  revealedObjects,
  scanBearing,
  scanSchedule,
  sensorOrigin,
} from './scanReveal'
import { sampleGraph } from '../test/sampleGraph'

const TAU = Math.PI * 2
const ORIGIN: [number, number, number] = [0, 1.5, 0]

describe('sensorOrigin', () => {
  it('parks the sensor at eye height in the middle of the room', () => {
    const origin = sensorOrigin(sampleGraph.room)
    expect(origin[0]).toBe(0)
    expect(origin[2]).toBe(0)
    expect(origin[1]).toBeGreaterThan(1)
    expect(origin[1]).toBeLessThan(sampleGraph.room.height)
  })
})

describe('scanBearing', () => {
  it('measures a clockwise turn starting at +Z', () => {
    expect(scanBearing(0, 1, ORIGIN)).toBeCloseTo(0)
    expect(scanBearing(1, 0, ORIGIN)).toBeCloseTo(0.25)
    expect(scanBearing(0, -1, ORIGIN)).toBeCloseTo(0.5)
    expect(scanBearing(-1, 0, ORIGIN)).toBeCloseTo(0.75)
  })

  it('stays inside a single turn and ignores distance', () => {
    for (const [x, z] of [
      [3, 4],
      [-2, 5],
      [-6, -1],
      [0.2, -0.3],
    ]) {
      const near = scanBearing(x, z, ORIGIN)
      const far = scanBearing(x * 8, z * 8, ORIGIN)
      expect(near).toBeGreaterThanOrEqual(0)
      expect(near).toBeLessThan(1)
      expect(far).toBeCloseTo(near)
    }
  })

  it('is measured from the sensor, not the world origin', () => {
    expect(scanBearing(2, 1, [2, 1.5, 0])).toBeCloseTo(0)
  })
})

describe('beamRotationY', () => {
  it('aims the beam at a target when the sweep reaches its bearing', () => {
    for (const [x, z] of [
      [0, 1],
      [1, 0],
      [-3, 2],
      [2.5, -1.5],
    ]) {
      const bearing = scanBearing(x, z, ORIGIN)
      const rotation = beamRotationY(bearing * SWEEP_SPAN)
      // A group rotated by `rotation` maps its local +X axis to this world heading.
      const heading = [Math.cos(rotation), -Math.sin(rotation)]
      const length = Math.hypot(x, z)
      expect(heading[0]).toBeCloseTo(x / length)
      expect(heading[1]).toBeCloseTo(z / length)
    }
  })

  it('completes exactly one turn across the sweep span', () => {
    expect(beamRotationY(SWEEP_SPAN) - beamRotationY(0)).toBeCloseTo(TAU)
  })
})

describe('revealWindowFor', () => {
  it('opens when the beam arrives and closes a fixed span later', () => {
    expect(revealWindowFor(0)).toEqual({ start: 0, end: REVEAL_SPAN })
    const late = revealWindowFor(1)
    expect(late.start).toBeCloseTo(SWEEP_SPAN)
    expect(late.end).toBeCloseTo(1)
  })

  it('never reveals anything after the scan ends', () => {
    for (const bearing of [0, 0.13, 0.5, 0.87, 0.999]) {
      expect(revealWindowFor(bearing).end).toBeLessThanOrEqual(1)
    }
  })
})

describe('revealAmount', () => {
  const window = { start: 0.2, end: 0.6 }

  it('is hidden before the beam and complete after it', () => {
    expect(revealAmount(0, window)).toBe(0)
    expect(revealAmount(0.2, window)).toBe(0)
    expect(revealAmount(0.6, window)).toBe(1)
    expect(revealAmount(1, window)).toBe(1)
  })

  it('eases out so objects snap in then settle', () => {
    const mid = revealAmount(0.4, window)
    expect(mid).toBeGreaterThan(0.5)
    expect(mid).toBeLessThan(1)
    expect(revealAmount(0.3, window)).toBeLessThan(mid)
  })

  it('survives a zero-length window', () => {
    expect(revealAmount(0.5, { start: 0.5, end: 0.5 })).toBe(1)
  })
})

describe('scanSchedule', () => {
  it('gives every object a window inside the scan', () => {
    const schedule = scanSchedule(sampleGraph)
    expect(schedule.size).toBe(sampleGraph.objects.length)
    for (const object of sampleGraph.objects) {
      const window = schedule.get(object.id)
      expect(window).toBeDefined()
      expect(window!.start).toBeGreaterThanOrEqual(0)
      expect(window!.end).toBeLessThanOrEqual(1)
    }
  })

  it('places each window at its own bearing', () => {
    const schedule = scanSchedule(sampleGraph)
    const door = sampleGraph.objects.find((object) => object.id === 'door-1')!
    const origin = sensorOrigin(sampleGraph.room)
    const bearing = scanBearing(door.position[0], door.position[2], origin)
    expect(schedule.get('door-1')).toEqual(revealWindowFor(bearing))
  })
})

describe('revealedObjects', () => {
  it('starts empty and ends with the whole graph in graph order', () => {
    expect(revealedObjects(sampleGraph, 0)).toEqual([])
    expect(revealedObjects(sampleGraph, 1)).toEqual(sampleGraph.objects)
  })

  it('grows as the sweep goes round', () => {
    const counts = [0, 0.25, 0.5, 0.75, 1].map(
      (progress) => revealedObjects(sampleGraph, progress).length,
    )
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeGreaterThanOrEqual(counts[index - 1])
    }
    expect(counts.at(-1)).toBe(sampleGraph.objects.length)
  })

  it('has nothing to reveal without a graph', () => {
    expect(revealedObjects(null, 1)).toEqual([])
  })
})

describe('capturedPoints', () => {
  it('counts up to a full sweep of returns', () => {
    expect(capturedPoints(0)).toBe(0)
    expect(capturedPoints(1)).toBe(SCAN_POINT_TOTAL)
    expect(capturedPoints(0.5)).toBeGreaterThan(0)
    expect(capturedPoints(0.5)).toBeLessThan(SCAN_POINT_TOTAL)
  })
})

describe('materialiseWindow', () => {
  it('staggers objects across the twin transition', () => {
    const first = materialiseWindow(0, 4)
    const last = materialiseWindow(3, 4)
    expect(first.start).toBe(0)
    expect(first.end).toBeCloseTo(MATERIALISE_SPAN)
    expect(last.end).toBeCloseTo(1)
    expect(last.start).toBeGreaterThan(first.start)
  })

  it('materialises a lone object across the whole transition', () => {
    expect(materialiseWindow(0, 1)).toEqual({ start: 0, end: 1 })
  })
})
