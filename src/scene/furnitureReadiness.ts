import type { SceneObject } from './types'
import { usesDemoFurniture } from '../assets/catalog'

export function furnitureLoadKey(object: SceneObject): string { return `${object.id}:${object.assetId ?? object.type}` }
export function furnitureAssetsReady(objects: readonly SceneObject[], reconstructed: boolean, loaded: Readonly<Record<string, boolean>>): boolean {
  return !reconstructed || objects.every((object) => (!object.assetId && !usesDemoFurniture(object)) || loaded[furnitureLoadKey(object)] === true)
}
