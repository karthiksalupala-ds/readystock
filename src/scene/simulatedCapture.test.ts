import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { SIMULATED_ROOM, simulatedCaptureFile, simulatedCaptureJson } from './simulatedCapture'
import { objectBounds } from './renovation'
import { furnitureAsset } from './furnitureCatalog'
import { parseCapture } from './importCapture'
import type { SceneObject } from './types'

const file = simulatedCaptureFile()
const graph = parseCapture(simulatedCaptureJson())

/** Same tolerance the renovation placer allows, so surfaces may touch but not interpenetrate. */
const TOUCH = 0.002

describe('the simulated capture file', () => {
  it('is a capture the real importer accepts, marked as simulated rather than measured', () => {
    expect(graph.source).toBe('simulated')
    expect(graph.room).toMatchObject({ ...SIMULATED_ROOM, units: 'm' })
    expect(graph.objects).toHaveLength(file.objects.length)
  })

  it('is a bigger, denser room than the demo fixture', () => {
    const demoFloor = 7.4 * 5.2
    expect(SIMULATED_ROOM.width * SIMULATED_ROOM.depth).toBeGreaterThan(demoFloor * 3)
    expect(graph.objects.length).toBeGreaterThan(80)
    expect(graph.objects.length).toBeLessThanOrEqual(500)
  })

  it('is deterministic, so a demo looks the same every run', () => {
    expect(simulatedCaptureJson()).toBe(simulatedCaptureJson())
  })

  it('uses unique ids', () => {
    expect(new Set(graph.objects.map((object) => object.id)).size).toBe(graph.objects.length)
  })

  it('renders from the bundled model library, never an arbitrary url', () => {
    const placed = graph.objects.filter((object) => object.assetId)
    expect(placed.length).toBeGreaterThan(70)
    for (const object of placed) expect(furnitureAsset(object.assetId), object.id).toBeDefined()
  })

  it('keeps every object inside the room shell', () => {
    const { width, depth, height } = SIMULATED_ROOM
    for (const object of graph.objects) {
      const box = objectBounds(object)
      expect(box.min.x, `${object.id} min x`).toBeGreaterThanOrEqual(-width / 2 - TOUCH)
      expect(box.max.x, `${object.id} max x`).toBeLessThanOrEqual(width / 2 + TOUCH)
      expect(box.min.z, `${object.id} min z`).toBeGreaterThanOrEqual(-depth / 2 - TOUCH)
      expect(box.max.z, `${object.id} max z`).toBeLessThanOrEqual(depth / 2 + TOUCH)
      expect(box.min.y, `${object.id} min y`).toBeGreaterThanOrEqual(-TOUCH)
      expect(box.max.y, `${object.id} max y`).toBeLessThanOrEqual(height + TOUCH)
    }
  })

  it('places nothing inside anything else', () => {
    // Rugs lie under the furniture, and openings sit within the wall plane.
    const solid = graph.objects.filter((object) => object.type !== 'rug' && object.category !== 'opening')
    const boxes = solid.map((object) => ({ id: object.id, box: objectBounds(object) }))
    const clashes: string[] = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].box.clone().expandByScalar(-TOUCH)
        if (a.intersectsBox(boxes[j].box)) clashes.push(`${boxes[i].id} ↔ ${boxes[j].id}`)
      }
    }
    expect(clashes).toEqual([])
  })

  it('rests every object on the floor, on a surface, or against a wall', () => {
    const supports = graph.objects.map((object) => ({ object, box: objectBounds(object) }))
    for (const { object, box } of supports) {
      if (object.category === 'opening' || box.min.y <= 0.02) continue
      // A wall-mounted display is carried by the wall it touches.
      const onWall = box.min.x <= -SIMULATED_ROOM.width / 2 + TOUCH || box.max.x >= SIMULATED_ROOM.width / 2 - TOUCH
        || box.min.z <= -SIMULATED_ROOM.depth / 2 + TOUCH || box.max.z >= SIMULATED_ROOM.depth / 2 - TOUCH
      if (onWall) continue
      const footprint = new Box3(
        new Vector3(box.min.x, 0, box.min.z),
        new Vector3(box.max.x, box.min.y, box.max.z),
      ).expandByScalar(-TOUCH)
      const held = supports.some(({ object: other, box: under }) =>
        other.id !== object.id && Math.abs(under.max.y - box.min.y) < 0.02 && under.intersectsBox(footprint))
      expect(held, `${object.id} floats at y=${box.min.y.toFixed(3)}`).toBe(true)
    }
  })

  it('describes a furnished floor the reconstructor and assistant can answer about', () => {
    const types = new Set(graph.objects.map((object) => object.type))
    for (const expected of ['table', 'chair', 'sofa', 'shelf', 'monitor', 'plant', 'door', 'window']) {
      expect(types, `missing ${expected}`).toContain(expected)
    }
    expect(count(graph.objects, 'chair')).toBeGreaterThanOrEqual(20)
    expect(count(graph.objects, 'door')).toBe(2)
    expect(count(graph.objects, 'window')).toBe(5)
  })

  it('leaves a walkable aisle between the desk bank and the meeting zone', () => {
    const aisle = new Box3(new Vector3(-3.2, 0, -1), new Vector3(-2.2, SIMULATED_ROOM.height, 1))
    const blocking = graph.objects
      .filter((object) => object.type !== 'rug' && objectBounds(object).intersectsBox(aisle))
      .map((object) => object.id)
    expect(blocking).toEqual([])
  })
})

function count(objects: SceneObject[], type: string): number {
  return objects.filter((object) => object.type === type).length
}
