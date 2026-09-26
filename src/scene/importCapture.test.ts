import { describe, expect, it } from 'vitest'
import { parseCapture } from './importCapture'
import { roomPlanCapture } from '../test/roomPlanCapture'

describe('RoomPlan file import', () => {
  it('retains captured geometry, orientation, labels, and provenance', () => {
    const graph = parseCapture(JSON.stringify(roomPlanCapture))
    expect(graph).toMatchObject({ source: 'roomplan', room: roomPlanCapture.room, objects: roomPlanCapture.objects })
    expect(graph.objects[0].id).toBe('rp:chair')
  })
  it('accepts an empty room with no recognized furniture', () => {
    expect(parseCapture(JSON.stringify({ ...roomPlanCapture, objects: [] })).objects).toEqual([])
  })
  it.each([
    { ...roomPlanCapture, version: 9 },
    { ...roomPlanCapture, format: 'usdz' },
    { ...roomPlanCapture, room: { ...roomPlanCapture.room, units: 'ft' } },
    { ...roomPlanCapture, room: { ...roomPlanCapture.room, width: 0 } },
    { ...roomPlanCapture, room: { ...roomPlanCapture.room, width: 10000 } },
    { ...roomPlanCapture, objects: [roomPlanCapture.objects[0], roomPlanCapture.objects[0]] },
    { ...roomPlanCapture, objects: [{ ...roomPlanCapture.objects[0], size: [-1, 1, 1] }] },
    { ...roomPlanCapture, objects: [{ ...roomPlanCapture.objects[0], position: [1, null, 1] }] },
    { ...roomPlanCapture, objects: [{ ...roomPlanCapture.objects[0], position: [1000, 1, 1] }] },
    { ...roomPlanCapture, objects: [{ ...roomPlanCapture.objects[0], rotation: [0, 0] }] },
    { ...roomPlanCapture, objects: Array.from({ length: 501 }, (_, i) => ({ ...roomPlanCapture.objects[0], id: `rp:${i}` })) },
  ])('rejects incompatible or malformed geometry', (capture) => {
    expect(() => parseCapture(JSON.stringify(capture))).toThrow()
  })
  it('reports malformed JSON and oversized files clearly', () => {
    expect(() => parseCapture('{bad')).toThrow(/JSON/i)
    expect(() => parseCapture(' '.repeat(5 * 1024 * 1024 + 1))).toThrow(/5 MB/)
  })
})
