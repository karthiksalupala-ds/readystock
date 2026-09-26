import type { SceneGraph, SceneObject, Vec3 } from './types'
import { furnitureAsset } from './furnitureCatalog'

export const MAX_CAPTURE_BYTES = 5 * 1024 * 1024

/**
 * The capture formats this build accepts, and the provenance each one carries.
 *
 * A measured RoomPlan export and a generated demo scan travel the same
 * validation, but they never claim the same source: the HUD tells the two apart
 * so a simulated floor is never presented as something a sensor measured.
 */
const ACCEPTED: Record<string, SceneGraph['source']> = {
  'intelidar.roomplan': 'roomplan',
  'intelidar.simulated': 'simulated',
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid room scan structure.')
  return value as Record<string, unknown>
}

function label(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`Invalid ${field}.`)
  return value
}

function dimension(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 50) throw new Error('Scan dimensions must be between 0 and 50 metres.')
  return value
}

function vector(value: unknown, size = false): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100)) {
    throw new Error('Invalid scan position, dimensions, or rotation.')
  }
  return value.map((n) => size ? dimension(n) : n) as Vec3
}

/** Accept only the companion app's versioned, normalized format, never arbitrary JSON casts. */
export function parseCapture(text: string): SceneGraph {
  if (text.length > MAX_CAPTURE_BYTES) throw new Error('The scan must be smaller than 5 MB.')
  let json: unknown
  try { json = JSON.parse(text) } catch { throw new Error('This file is not valid JSON. Choose an InteLiDar scan export.') }
  const data = record(json)
  const source = typeof data.format === 'string' ? ACCEPTED[data.format] : undefined
  if (!source || data.version !== 1 || data.source !== source) {
    throw new Error('Choose a version 1 scan exported by InteLiDar Capture (.intelidar.json).')
  }
  const room = record(data.room)
  if (room.units !== 'm') throw new Error('The scan must use metres.')
  const bounds = { id: label(room.id, 'room id'), name: label(room.name, 'room name'),
    width: dimension(room.width), depth: dimension(room.depth), height: dimension(room.height), units: 'm' as const }
  if (!Array.isArray(data.objects) || data.objects.length > 500) throw new Error('The scan must contain at most 500 objects.')
  const ids = new Set<string>()
  const objects: SceneObject[] = data.objects.map((value) => {
    const item = record(value)
    const id = label(item.id, 'object id')
    if (ids.has(id)) throw new Error('The scan contains duplicate object ids.')
    ids.add(id)
    const category = label(item.category, 'object category')
    if (!['furniture', 'equipment', 'opening', 'structure'].includes(category)) throw new Error('Unsupported object category.')
    const position = vector(item.position)
    const size = vector(item.size, true)
    if (Math.abs(position[0]) > bounds.width / 2 + 0.25 || Math.abs(position[2]) > bounds.depth / 2 + 0.25 || position[1] < -0.25 || position[1] > bounds.height + 0.25) {
      throw new Error('An object is outside the room. Export the scan again from InteLiDar Capture.')
    }
    const object: SceneObject = { id, type: label(item.type, 'object type'), label: label(item.label, 'object label'),
      category, position, size, rotation: vector(item.rotation ?? [0, 0, 0]) }
    if (item.material != null) object.material = label(item.material, 'material')
    if (item.shape != null) object.shape = label(item.shape, 'shape')
    if (item.color != null) {
      if (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color)) throw new Error('Invalid object color.')
      object.color = item.color
    }
    if (item.assetId != null) {
      // Model urls are resolved from the bundled library by id, never taken from the file.
      if (typeof item.assetId !== 'string' || !furnitureAsset(item.assetId)) throw new Error('This scan references a model that is not in the furniture library.')
      object.assetId = item.assetId
    }
    if (item.confidence != null) {
      if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) throw new Error('Invalid object confidence.')
      object.confidence = item.confidence
    }
    return object
  })
  return { source, room: bounds, objects }
}
