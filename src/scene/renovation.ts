import type { SceneGraph, SceneObject } from './types'
import { Box3, Euler, Matrix4, Vector3 } from 'three'
import { furnitureAsset } from './furnitureCatalog'
import { canDragObject, moveObject } from './editScene'

export type RenovationUndo = { kind: 'add'; id: string } | { kind: 'remove'; object: SceneObject; index: number }
export type RenovationResult = { graph: SceneGraph; undo: RenovationUndo; selectedId: string | null }

export function objectBounds(object: SceneObject): Box3 {
  const half = new Vector3(...object.size).multiplyScalar(0.5)
  return new Box3(half.clone().negate(), half)
    .applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...(object.rotation ?? [0, 0, 0]))))
    .translate(new Vector3(...object.position))
}

export function addFurniture(graph: SceneGraph, assetId: string, id: string, baseHeight = 0): RenovationResult {
  const asset = furnitureAsset(assetId)
  if (!asset) throw new Error('This furniture model is not in the library.')
  if (!id || graph.objects.some((object) => object.id === id)) throw new Error('A unique object id is required.')
  if (graph.objects.length >= 500) throw new Error('This room already has 500 objects. Remove an item before adding another.')
  const [w, h, d] = asset.size
  if (!Number.isFinite(baseHeight) || baseHeight < 0 || baseHeight + h > graph.room.height) throw new Error('The base height must fit below the ceiling.')
  if (w > graph.room.width || d > graph.room.depth) throw new Error('This model does not fit inside the room.')
  const object: SceneObject = { id, assetId, type: asset.type, label: asset.name,
    category: asset.category === 'electronics' ? 'equipment' : 'furniture',
    position: [0, baseHeight + h / 2, 0], size: [...asset.size], rotation: [0, 0, 0] }
  const rangeX = (graph.room.width - w) / 2
  const rangeZ = (graph.room.depth - d) / 2
  const nx = Math.max(1, Math.min(80, Math.ceil(rangeX * 2 / 0.25)))
  const nz = Math.max(1, Math.min(80, Math.ceil(rangeZ * 2 / 0.25)))
  const candidates: [number, number][] = [[0, 0]]
  for (let x = 0; x <= nx; x++) for (let z = 0; z <= nz; z++) {
    candidates.push([-rangeX + x / nx * rangeX * 2, -rangeZ + z / nz * rangeZ * 2])
  }
  candidates.sort((a, b) => a[0] ** 2 + a[1] ** 2 - b[0] ** 2 - b[1] ** 2)
  const obstacles = graph.objects.filter((item) => item.type !== 'rug' && item.type !== 'floor').map(objectBounds)
  for (const [x, z] of candidates) {
    object.position = [x, baseHeight + h / 2, z]
    const bounds = objectBounds(object).expandByScalar(-0.002)
    if (object.type !== 'rug' && obstacles.some((obstacle) => bounds.intersectsBox(obstacle))) continue
    return { graph: { ...graph, objects: [...graph.objects, object] }, undo: { kind: 'add', id }, selectedId: id }
  }
  throw new Error('No clear space for this model. Move or remove furniture, choose a smaller model, or adjust the base height.')
}
export function removeFurniture(graph: SceneGraph, id: string): RenovationResult {
  const index = graph.objects.findIndex((object) => object.id === id)
  const object = graph.objects[index]
  if (!object || !canDragObject(object)) throw new Error('Select furniture or equipment to remove. Openings and structure stay fixed.')
  return { graph: { ...graph, objects: graph.objects.filter((item) => item.id !== id) }, undo: { kind: 'remove', object, index }, selectedId: null }
}
export function undoRenovation(graph: SceneGraph, undo: RenovationUndo): SceneGraph {
  if (undo.kind === 'add') return { ...graph, objects: graph.objects.filter((object) => object.id !== undo.id) }
  if (graph.objects.some((object) => object.id === undo.object.id)) return graph
  const objects = [...graph.objects]
  objects.splice(Math.min(undo.index, objects.length), 0, undo.object)
  return { ...graph, objects }
}

export function rotateFurniture(graph: SceneGraph, id: string): SceneGraph {
  const object = graph.objects.find((item) => item.id === id)
  if (!object || !canDragObject(object)) return graph
  const rotation: SceneObject['rotation'] = [object.rotation?.[0] ?? 0, ((object.rotation?.[1] ?? 0) + Math.PI / 2) % (Math.PI * 2), object.rotation?.[2] ?? 0]
  const rotated = { ...object, rotation }
  const size = objectBounds(rotated).getSize(new Vector3())
  if (size.x > graph.room.width + 0.001 || size.z > graph.room.depth + 0.001) throw new Error('This rotation does not fit inside the room.')
  return moveObject({ ...graph, objects: graph.objects.map((item) => item.id === id ? rotated : item) }, id, object.position)
}
