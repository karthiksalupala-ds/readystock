import { describe, expect, it } from 'vitest'
import { Box3, DataTexture, Raycaster, Vector3 } from 'three'
import { interactionsForObject } from '../interaction/profiles'
import { buildFurnitureModel } from './buildFurnitureModel'
import { SHAPES } from './appearance'
import { updateAppearance, moveObject } from './editScene'
import { sampleGraph } from '../test/sampleGraph'
import type { SceneObject } from './types'

describe('detailed furniture', () => {
  it('keeps a default chair fallback cushion aligned when its bundled model is unavailable', () => {
    const object: SceneObject = { id: 'chair', type: 'chair', label: 'Chair', category: 'furniture', position: [0, 0.44, 0], size: [0.46, 0.88, 0.46] }
    const model = buildFurnitureModel(object)
    model.root.position.set(...object.position)
    model.root.updateMatrixWorld(true)
    const seat = interactionsForObject(object)[0]
    if (seat.kind !== 'seat') throw new Error('Expected chair seat')
    const ray = new Raycaster(new Vector3(...seat.seat).add(new Vector3(0, 0.08, 0)), new Vector3(0, -1, 0))
    expect(ray.intersectObject(model.root, true)[0]?.point.y).toBeCloseTo(seat.seat[1], 4)
    model.dispose()
  })
  it('renders captured sofas with separate cushions exactly at their interactive contact points', () => {
    const object: SceneObject = { id: 'sofa', type: 'sofa', label: 'Sofa', category: 'furniture', position: [0, 0.45, 0], size: [2.2, 0.9, 0.9] }
    const model = buildFurnitureModel(object)
    model.root.position.set(...object.position)
    model.root.updateMatrixWorld(true)
    expect(model.root.children[0].children.length).toBeGreaterThan(8)
    for (const interaction of interactionsForObject(object)) {
      if (interaction.kind !== 'seat') throw new Error('Expected sofa seat')
      const ray = new Raycaster(new Vector3(...interaction.seat).add(new Vector3(0, 0.02, 0)), new Vector3(0, -1, 0))
      const hit = ray.intersectObject(model.root, true)[0]
      expect(hit?.point.y).toBeCloseTo(interaction.seat[1], 4)
    }
    model.dispose()
  })

  it('marks only procedural screen surfaces and floor lamp bulbs/shades as switchable', () => {
    for (const type of ['lamp', 'monitor']) {
      const model = buildFurnitureModel({ id: type, type, label: type, category: 'equipment', position: [0, 0.5, 0], size: [0.5, 1, 0.5] })
      expect(model.materials.some((material) => material.userData.powerSurface === (type === 'lamp' ? 'lamp' : 'screen'))).toBe(true)
      expect(model.materials.some((material) => !material.userData.powerSurface)).toBe(true)
      model.dispose()
    }
  })
  for (const [type, shapes] of Object.entries(SHAPES)) for (const shape of shapes) {
    it(`${type}/${shape} retains the measured bounding volume`, () => {
      const object: SceneObject = { id: 'test', type, shape, label: type, category: 'furniture', position: [0, 0, 0], size: [2, 1, 0.7], color: '#b96348' }
      const model = buildFurnitureModel(object)
      const bounds = new Box3().setFromObject(model.root)
      const size = bounds.getSize(new Vector3())
      expect(model.root.children[0].children.length).toBeGreaterThan(3)
      for (let axis = 0; axis < 3; axis++) {
        expect(size.getComponent(axis)).toBeLessThanOrEqual(object.size[axis] + 0.005)
        expect(bounds.min.getComponent(axis)).toBeGreaterThanOrEqual(-object.size[axis] / 2 - 0.005)
        expect(bounds.max.getComponent(axis)).toBeLessThanOrEqual(object.size[axis] / 2 + 0.005)
      }
      expect(model.materials[0].color.getHexString()).toBe('b96348')
      expect((model.materials[0].map as DataTexture).image.data?.length).toBe(128 * 128 * 4)
      model.dispose()
    })
  }

  it('orients a shelf along its long wall axis', () => {
    const model = buildFurnitureModel({ ...sampleGraph.objects[0], type: 'shelf', size: [0.38, 1.8, 1.6] })
    const size = new Box3().setFromObject(model.root).getSize(new Vector3())
    expect(size.x).toBeCloseTo(0.38)
    expect(size.z).toBeCloseTo(1.6)
    model.dispose()
  })

  it('changes one appearance without changing measured geometry or other objects', () => {
    const next = updateAppearance(sampleGraph, 'table-1', { color: '#467568', material: 'stone', shape: 'oval' })
    expect(next.objects[0]).toMatchObject({ color: '#467568', material: 'stone', shape: 'oval' })
    expect(next.objects[0].size).toBe(sampleGraph.objects[0].size)
    expect(next.objects[0].position).toBe(sampleGraph.objects[0].position)
    expect(next.objects[1]).toBe(sampleGraph.objects[1])
    expect(moveObject(next, 'table-1', [1, 0, 1]).objects[0].shape).toBe('oval')
  })

  it('rejects invalid colors, unsupported finishes, and shapes from another model', () => {
    expect(updateAppearance(sampleGraph, 'table-1', { color: 'bad', material: 'missing', shape: 'armchair' })).toBe(sampleGraph)
  })

  it('keeps a rotated table inside the room when dragged against a wall', () => {
    const graph = { ...sampleGraph, objects: [{ ...sampleGraph.objects[0], rotation: [0, Math.PI / 2, 0] as [number, number, number] }] }
    const moved = moveObject(graph, 'table-1', [100, 0, 100]).objects[0]
    expect(moved.position[0]).toBeCloseTo(sampleGraph.room.width / 2 - 0.6)
    expect(moved.position[2]).toBeCloseTo(sampleGraph.room.depth / 2 - 1.2)
  })
})
