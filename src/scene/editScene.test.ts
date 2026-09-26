import { describe, expect, it } from 'vitest'
import { canDragObject, moveObject } from './editScene'
import type { SceneGraph, SceneObject } from './types'

function fixture(): SceneGraph {
  const objects: SceneObject[] = [
    {
      id: 'table-1',
      type: 'table',
      label: 'Table',
      category: 'furniture',
      position: [0, 0.38, 0],
      size: [2, 0.76, 1],
    },
    {
      id: 'door-1',
      type: 'door',
      label: 'Door',
      category: 'opening',
      position: [0.9, 1.05, 2.9],
      size: [1, 2.1, 0.08],
    },
    {
      id: 'monitor-1',
      type: 'monitor',
      label: 'Display',
      category: 'equipment',
      position: [0, 1.15, -0.2],
      size: [1.2, 0.72, 0.08],
    },
  ]
  return {
    room: { id: 'room-1', name: 'meeting room', width: 8, depth: 6, height: 2.8, units: 'm' },
    objects,
  }
}

describe('canDragObject', () => {
  it('allows furniture and equipment, not openings', () => {
    const graph = fixture()
    expect(canDragObject(graph.objects[0])).toBe(true)
    expect(canDragObject(graph.objects[2])).toBe(true)
    expect(canDragObject(graph.objects[1])).toBe(false)
  })
})

describe('moveObject', () => {
  it('moves furniture on the floor and keeps height', () => {
    const graph = fixture()
    const next = moveObject(graph, 'table-1', [1.5, 9, -1.2])
    const table = next.objects.find((obj) => obj.id === 'table-1')
    expect(table?.position[0]).toBe(1.5)
    expect(table?.position[1]).toBe(0.38)
    expect(table?.position[2]).toBe(-1.2)
    expect(graph.objects[0].position).toEqual([0, 0.38, 0])
  })

  it('does not move openings', () => {
    const graph = fixture()
    const next = moveObject(graph, 'door-1', [0, 0, 0])
    expect(next.objects.find((obj) => obj.id === 'door-1')?.position).toEqual([0.9, 1.05, 2.9])
  })

  it('clamps furniture inside the room footprint', () => {
    const graph = fixture()
    const next = moveObject(graph, 'table-1', [40, 0.38, -40])
    const table = next.objects.find((obj) => obj.id === 'table-1')
    expect(table?.position[0]).toBe(3)
    expect(table?.position[2]).toBe(-2.5)
  })

  it('returns the same graph when the id is unknown', () => {
    const graph = fixture()
    const next = moveObject(graph, 'missing', [1, 0, 1])
    expect(next).toBe(graph)
  })

  it('keeps the entire rotated footprint inside the room', () => {
    const graph = fixture()
    graph.objects[0].rotation = [0, Math.PI / 2, 0]
    const next = moveObject(graph, 'table-1', [40, 9, -40])
    expect(next.objects[0].position[0]).toBeCloseTo(3.5)
    expect(next.objects[0].position[2]).toBeCloseTo(-2)
    expect(next.objects[0].position[1]).toBe(0.38)
  })

  it('allows safe movement of a diagonally rotated table without clipping corners', () => {
    const graph = fixture()
    graph.objects[0].rotation = [0, Math.PI / 4, 0]
    const next = moveObject(graph, 'table-1', [40, 9, 40])
    const inset = 1.5 / Math.sqrt(2)
    expect(next.objects[0].position[0]).toBeCloseTo(4 - inset)
    expect(next.objects[0].position[2]).toBeCloseTo(3 - inset)
  })
})
