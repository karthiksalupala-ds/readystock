import { describe, expect, it } from 'vitest'
import { Euler, Vector3 } from 'three'
import { interactionsForGraph, interactionsForObject } from './profiles'
import type { SceneObject } from '../scene/types'
import type { SeatInteraction } from './types'
import { sampleGraph } from '../test/sampleGraph'

const chair: SceneObject = { id: 'chair', type: 'chair', label: 'Chair', category: 'furniture', size: [0.46, 0.88, 0.46], position: [0, 0.44, 0] }

describe('furniture interaction profiles', () => {
  it('anchors a demo chair to the fitted cushion and a supported front approach', () => {
    expect(interactionsForObject(chair)).toEqual([expect.objectContaining({
      kind: 'seat', id: 'chair:seat:0', objectId: 'chair', label: 'chair', heading: 0,
      seat: [0, 0.48, 0], floorY: 0,
    })])
    const seat = interactionsForObject(chair)[0] as SeatInteraction
    expect(seat.approach[2]).toBeGreaterThan(chair.size[2] / 2 + 0.3)
    expect(seat.approach[1]).toBe(0)
  })

  it('uses procedural chair cushion heights only when the procedural renderer is selected', () => {
    for (const shape of ['visitor', 'armchair']) {
      const seat = interactionsForObject({ ...chair, shape })[0] as SeatInteraction
      expect(seat.seat[1]).toBeCloseTo(0.44 + 0.085 * 0.88)
      expect(seat.seat[2]).toBeCloseTo(0.03 * 0.46)
    }
    expect(interactionsForObject({ ...chair, shape: 'task' })).toEqual(interactionsForObject(chair))
  })

  it('transforms scaled anchors and headings through the same object rotation and position', () => {
    const object: SceneObject = { ...chair, size: [0.92, 1.76, 0.92], position: [2, 0.88, -1], rotation: [0, Math.PI / 2, 0] }
    const seat = interactionsForObject(object)[0] as SeatInteraction
    expect(seat.seat).toEqual([2, 0.96, -1])
    expect(seat.heading).toBeCloseTo(Math.PI / 2)
    const localApproach = new Vector3(...seat.approach).sub(new Vector3(...object.position)).applyEuler(new Euler(0, -Math.PI / 2, 0))
    expect(localApproach.z).toBeGreaterThan(object.size[2] / 2 + 0.3)
    expect(localApproach.x).toBeCloseTo(0)
  })

  it('offers transformed side-front approaches only for armless chairs and stools', () => {
    const object: SceneObject = { ...chair, rotation: [0, Math.PI / 2, 0], position: [2, 0.44, -1] }
    const seat = interactionsForObject(object)[0] as SeatInteraction
    expect(seat.approaches).toHaveLength(2)
    for (const approach of seat.approaches!) {
      const local = new Vector3(...approach).sub(new Vector3(...object.position)).applyEuler(new Euler(0, -Math.PI / 2, 0))
      expect(Math.abs(local.x)).toBeCloseTo(chair.size[0] / 2 + 0.50)
      expect(local.z).toBeCloseTo(0.02)
      expect(approach[1]).toBe(0)
    }
    expect((interactionsForObject({ ...chair, assetId: 'stool_round' })[0] as SeatInteraction).approaches).toHaveLength(2)
    for (const object of [{ ...chair, shape: 'armchair' }, { ...chair, assetId: 'chair_office' }, { ...chair, assetId: 'sofa_2seat' }]) {
      expect((interactionsForObject(object)[0] as SeatInteraction).approaches).toBeUndefined()
    }
  })

  it('does not advertise seats tipped onto their side or back', () => {
    expect(interactionsForObject({ ...chair, rotation: [Math.PI / 2, 0, 0] })).toEqual([])
    expect(interactionsForObject({ ...chair, rotation: [0, 0, Math.PI / 2] })).toEqual([])
  })

  it('provides one separate anchor for each catalog or captured sofa cushion', () => {
    for (const [assetId, count, width] of [['sofa_2seat', 2, 1.62], ['sofa_3seat', 3, 2.18]] as const) {
      const seats = interactionsForObject({ ...chair, type: 'sofa', assetId, size: [width, 0.86, 0.86], position: [0, 0.43, 0] }) as SeatInteraction[]
      expect(seats).toHaveLength(count)
      expect(new Set(seats.map((seat) => seat.id)).size).toBe(count)
      expect(new Set(seats.map((seat) => seat.seat[0])).size).toBe(count)
      for (const seat of seats) expect(seat.seat[1]).toBeCloseTo(0.455)
    }
    expect(interactionsForObject({ ...chair, type: 'sofa', size: [2.2, 0.9, 0.9] })).toHaveLength(3)
  })

  it('includes office chairs, stools, floor lamps, TVs, and desktop monitors but no arbitrary props', () => {
    for (const assetId of ['chair_standard', 'chair_office', 'stool_round']) expect(interactionsForObject({ ...chair, assetId })[0]?.kind).toBe('seat')
    for (const [assetId, toggle] of [['lamp_floor', 'lamp'], ['tv_flat', 'screen'], ['monitor_desktop', 'screen'], ['laptop', 'screen']] as const) {
      expect(interactionsForObject({ ...chair, assetId })).toEqual([expect.objectContaining({ kind: 'toggle', toggle, objectId: chair.id })])
    }
    expect(interactionsForObject({ ...chair, type: 'table' })).toEqual([])
    expect(interactionsForObject({ ...chair, assetId: 'bed_single' })).toEqual([])
    expect(interactionsForGraph({ ...sampleGraph, objects: [chair] })).toEqual(interactionsForObject(chair))
  })
})
