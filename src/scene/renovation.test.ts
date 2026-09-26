import { describe, expect, it } from 'vitest'
import { FURNITURE_CATALOG, furnitureAsset } from './furnitureCatalog'
import { addFurniture, removeFurniture, undoRenovation } from './renovation'
import { moveObject } from './editScene'
import { sampleGraph } from '../test/sampleGraph'

describe('renovation', () => {
  it('uses the original library and photo-demo props from the model manifest', () => {
    expect(FURNITURE_CATALOG).toHaveLength(38)
    expect(FURNITURE_CATALOG.every((asset) => asset.url && asset.size.every((n) => n > 0))).toBe(true)
    expect(furnitureAsset('sofa_2seat')?.size).toEqual([1.62, 0.86, 0.86])
    expect(furnitureAsset('avatar_casual')).toBeUndefined()
    expect(furnitureAsset('door_simple')).toBeUndefined()
  })
  it('can place furniture on the photo demo’s decorative floor', () => {
    const graph = { ...sampleGraph, objects: [{ id: 'oak', type: 'floor', label: 'Oak', category: 'structure', position: [0, .004, 0] as [number, number, number], size: [7.4, .008, 5.2] as [number, number, number] }] }
    expect(addFurniture(graph, 'chair_cafe', 'new-chair').graph.objects.at(-1)?.id).toBe('new-chair')
  })
  it('adds a model at its real dimensions and finds space away from existing furniture', () => {
    const added = addFurniture(sampleGraph, 'sofa_2seat', 'new-sofa')
    const object = added.graph.objects.at(-1)!
    expect(object).toMatchObject({ id: 'new-sofa', assetId: 'sofa_2seat', type: 'sofa', category: 'furniture', size: [1.62, 0.86, 0.86] })
    expect(object.position[1]).toBe(0.43)
    expect(Math.abs(object.position[0]) > 2 || Math.abs(object.position[2]) > 1).toBe(true)
    expect(sampleGraph.objects).toHaveLength(2)
    expect(undoRenovation(added.graph, added.undo).objects).toEqual(sampleGraph.objects)
  })
  it('gives repeated additions separate positions and ids', () => {
    const one = addFurniture(sampleGraph, 'chair_standard', 'chair-a')
    const two = addFurniture(one.graph, 'chair_standard', 'chair-b')
    expect(two.graph.objects.at(-1)?.position).not.toEqual(one.graph.objects.at(-1)?.position)
    expect(() => addFurniture(two.graph, 'chair_standard', 'chair-b')).toThrow(/id/i)
  })
  it('removes existing furniture and restores it in order without reverting other moves', () => {
    const added = addFurniture(sampleGraph, 'chair_standard', 'chair-a')
    const removed = removeFurniture(added.graph, 'table-1')
    expect(removed.graph.objects.some((object) => object.id === 'table-1')).toBe(false)
    const moved = moveObject(removed.graph, 'chair-a', [1, 0, 1])
    const restored = undoRenovation(moved, removed.undo)
    expect(restored.objects[0]).toEqual(sampleGraph.objects[0])
    expect(restored.objects.at(-1)?.position).toEqual([1, 0.44, 1])
  })
  it('protects openings and rejects unknown assets and oversized placements', () => {
    expect(() => removeFurniture(sampleGraph, 'door-1')).toThrow(/furniture|equipment/i)
    expect(() => addFurniture(sampleGraph, 'missing', 'a')).toThrow(/model/i)
    expect(() => addFurniture({ ...sampleGraph, room: { ...sampleGraph.room, width: 0.5 } }, 'sofa_2seat', 'a')).toThrow(/fit/i)
  })
  it('allows electronics on a specified support height, within the room height', () => {
    const added = addFurniture(sampleGraph, 'monitor_desktop', 'monitor-a', 0.8)
    expect(added.graph.objects.at(-1)?.position[1]).toBeCloseTo(0.8 + furnitureAsset('monitor_desktop')!.size[1] / 2)
    expect(() => addFurniture(sampleGraph, 'monitor_desktop', 'a', 3)).toThrow(/height|fit/i)
    expect(() => addFurniture(sampleGraph, 'chair_standard', 'a', NaN)).toThrow()
  })
})
