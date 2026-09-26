import type { SceneObject } from './types'

export const SHAPES: Record<string, readonly string[]> = {
  table: ['rounded', 'rectangular', 'oval'],
  chair: ['task', 'armchair', 'visitor'],
  shelf: ['open', 'partitioned', 'cabinet'],
  monitor: ['standard', 'wide'],
  door: ['panelled', 'flush'],
  window: ['divided', 'picture'],
}

export const FINISHES = ['wood', 'fabric', 'leather', 'metal', 'plastic', 'stone'] as const
export const SWATCHES = ['#b88753', '#644333', '#ded5c4', '#3d4a5c', '#467568', '#b96348', '#7086a3', '#262b32']
export type AppearancePatch = Partial<Pick<SceneObject, 'color' | 'material' | 'shape'>>

export function shapeFor(object: SceneObject): string {
  const shapes = SHAPES[object.type] ?? ['rounded', 'rectangular']
  return object.shape && shapes.includes(object.shape) ? object.shape : shapes[0]
}
