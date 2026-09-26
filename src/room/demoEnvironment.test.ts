import { describe, expect, it } from 'vitest'
import cafe from '../../backend/app/cafe_scene.json'
import type { SceneGraph } from '../scene/types'
import { sampleGraph } from '../test/sampleGraph'
import { demoEnvironment } from './demoEnvironment'
import { Box3, Ray, Vector3 } from 'three'

describe('demoEnvironment', () => {
  it('starts the photo café in the aisle with the bar ahead and space behind the camera', () => {
    const environment = demoEnvironment(cafe as SceneGraph)
    expect(environment.spawn[0]).toBeGreaterThan(1)
    expect(environment.spawn[0]).toBeLessThan(2)
    expect(environment.spawn[2]).toBeGreaterThan(.5)
    expect(environment.spawn[2] + 3).toBeLessThan(cafe.room.depth / 2)
  })
  it('puts the floor surface at zero, contains the room, and preserves furniture poses', () => {
    const graph = structuredClone(sampleGraph)
    graph.objects[0].rotation = [0, Math.PI / 4, 0]
    const environment = demoEnvironment(graph)
    expect(environment.bounds).toEqual({ min: [-3.7, 0, -2.6], max: [3.7, 2.8, 2.6] })
    expect(environment.colliders.length).toBeGreaterThan(7)
    const boxes = environment.colliders.filter((collider) => collider.kind === 'box')
    expect(boxes.some((box) => box.center[1] + box.halfExtents[1] === 0)).toBe(true)
    const furniture = boxes.filter(box => box.objectId === graph.objects[0].id)
    expect(furniture.length).toBeGreaterThan(1)
    expect(furniture.every(box => box.rotation?.[1] === Math.PI / 4)).toBe(true)
    expect(furniture.some(box => Math.abs(box.center[1] + box.halfExtents[1] - .76) < .00001)).toBe(true)
    expect(environment.spawn[1]).toBe(0.02)
    expect(Math.abs(environment.spawn[2])).toBeGreaterThan(0.85)
    expect(graph.objects[0].position).toEqual([0, 0.38, 0])
  })

  it('selects a different initial spawn when the usual room corner is occupied', () => {
    const empty = { ...sampleGraph, objects: [] }
    const first = demoEnvironment(empty).spawn
    const occupied = {
      ...empty,
      objects: [{ ...sampleGraph.objects[0], position: [first[0], 1, first[2]] as [number, number, number], size: [1.5, 2, 1.5] as [number, number, number] }],
    }
    expect(demoEnvironment(occupied).spawn).not.toEqual(first)
  })

  it('prefers an open camera corridor over a clear character spot beside a tall shelf', () => {
    const graph = structuredClone(sampleGraph)
    graph.objects.push({ id: 'storage', type: 'shelf', label: 'Shelf', category: 'furniture',
      position: [-3.25, 0.9, -0.4], size: [0.38, 1.8, 1.6] })
    const spawn = demoEnvironment(graph).spawn
    const cameraRay = new Ray(new Vector3(spawn[0], spawn[1] + 1, spawn[2]), new Vector3(0, Math.sin(0.17), Math.cos(0.17)))
    const shelf = new Box3(new Vector3(-3.44, 0, -1.2), new Vector3(-3.06, 1.8, 0.4)).expandByScalar(0.2)
    const hit = cameraRay.intersectBox(shelf, new Vector3())
    expect(hit === null || hit.distanceTo(cameraRay.origin) > 3).toBe(true)
  })
})
