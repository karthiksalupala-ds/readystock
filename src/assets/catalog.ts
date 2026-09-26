import chairUrl from '../../models/furniture/chair_standard.glb?url'
import tableUrl from '../../models/furniture/table_dining.glb?url'
import shelfUrl from '../../models/furniture/shelf_open.glb?url'
import monitorUrl from '../../models/electronics/monitor_desktop.glb?url'
import avatarUrl from '../../models/avatars/avatar_casual.glb?url'
import { SHAPES } from '../scene/appearance'
import type { SceneObject } from '../scene/types'

export const avatarCasualUrl = avatarUrl

const furniture: Record<string, string> = {
  chair: chairUrl,
  table: tableUrl,
  shelf: shelfUrl,
  monitor: monitorUrl,
}

export function furnitureAssetFor(type: string): string | undefined {
  return Object.hasOwn(furniture, type) ? furniture[type] : undefined
}

/** Standard shapes use the demo GLBs; alternate shapes and placed catalog models keep their own renderer. */
export function usesDemoFurniture(object: Pick<SceneObject, 'type' | 'shape' | 'assetId'>): boolean {
  return !object.assetId && Boolean(furnitureAssetFor(object.type)) &&
    (!object.shape || object.shape === SHAPES[object.type]?.[0])
}
