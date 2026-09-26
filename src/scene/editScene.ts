import type { SceneGraph, SceneObject, Vec3 } from './types'
import { FINISHES, SHAPES, type AppearancePatch } from './appearance'
import { Euler, Matrix4 } from 'three'

export function updateAppearance(graph: SceneGraph, id: string, patch: AppearancePatch): SceneGraph {
  const target = graph.objects.find((object) => object.id === id)
  if (!target) return graph
  const valid: AppearancePatch = {}
  if (patch.color === null) valid.color = null
  if (patch.color && /^#[0-9a-f]{6}$/i.test(patch.color)) valid.color = patch.color
  if (patch.material && FINISHES.some((finish) => finish === patch.material)) valid.material = patch.material
  if (patch.shape && (SHAPES[target.type] ?? ['rounded', 'rectangular']).includes(patch.shape)) valid.shape = patch.shape
  if (!Object.keys(valid).length) return graph
  return { ...graph, objects: graph.objects.map((object) => object.id === id ? { ...object, ...valid } : object) }
}

const DRAGGABLE = new Set(['furniture', 'equipment'])

export function canDragObject(object: SceneObject): boolean {
  return DRAGGABLE.has(object.category)
}

export function moveObject(graph: SceneGraph, id: string, next: Vec3): SceneGraph {
  const target = graph.objects.find((object) => object.id === id)
  if (!target || !canDragObject(target)) return graph

  const position = clampToRoom(graph, target, next)
  if (
    position[0] === target.position[0] &&
    position[1] === target.position[1] &&
    position[2] === target.position[2]
  ) {
    return graph
  }

  return {
    ...graph,
    objects: graph.objects.map((object) =>
      object.id === id ? { ...object, position } : object,
    ),
  }
}

function clampToRoom(graph: SceneGraph, object: SceneObject, next: Vec3): Vec3 {
  const halfW = graph.room.width / 2
  const halfD = graph.room.depth / 2
  const rotation = new Matrix4().makeRotationFromEuler(new Euler(...(object.rotation ?? [0, 0, 0])))
  const e = rotation.elements
  const [x, y, z] = object.size.map((dimension) => dimension / 2)
  const insetX = Math.abs(e[0]) * x + Math.abs(e[4]) * y + Math.abs(e[8]) * z
  const insetZ = Math.abs(e[2]) * x + Math.abs(e[6]) * y + Math.abs(e[10]) * z
  return [
    clamp(next[0], -halfW + insetX, halfW - insetX),
    object.position[1],
    clamp(next[2], -halfD + insetZ, halfD - insetZ),
  ]
}

function clamp(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2
  return Math.min(max, Math.max(min, value))
}
