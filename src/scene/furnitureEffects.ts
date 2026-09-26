import type { MeshStandardMaterial } from 'three'
import type { SceneObject } from './types'
import type { Vec3 } from './types'
import type { InteractionDefinition, ToggleInteraction } from '../interaction/types'

export function nearestEnabledLamps(interactions: readonly InteractionDefinition[], toggles: Readonly<Record<string, boolean>>, position: Vec3): ToggleInteraction[] {
  const distance = (lamp: ToggleInteraction) => (lamp.lightPosition ?? lamp.point).reduce((sum, value, axis) => sum + (value - position[axis]) ** 2, 0)
  return interactions.filter((item): item is ToggleInteraction => item.kind === 'toggle' && item.toggle === 'lamp' && Boolean(toggles[item.objectId]))
    .sort((a, b) => distance(a) - distance(b) || a.objectId.localeCompare(b.objectId)).slice(0, 4)
}

/** Called after selection effects, so powering a screen never repaints its casing. */
export function applyObjectPower(materials: readonly MeshStandardMaterial[], object: SceneObject, enabled: boolean, solid = 1) {
  const profile = object.assetId ?? object.type
  const lamp = profile === 'lamp_floor' || profile === 'lamp'
  const screen = profile === 'tv_flat' || profile === 'monitor_desktop' || profile === 'monitor' || profile === 'laptop'
  if (!lamp && !screen) return
  for (const material of materials) {
    const isBulb = material.name === 'IDAR_white' || material.userData.bulb
    const lampSurface = lamp && (isBulb || material.name === 'IDAR_fabric_light' || material.userData.powerSurface === 'lamp')
    const screenSurface = screen && (material.name === 'IDAR_screen' || material.userData.powerSurface === 'screen')
    if (!lampSurface && !screenSurface) continue
    material.emissive.set(lampSurface ? '#ffd49a' : '#79d7e3')
    material.emissiveIntensity = enabled ? (lampSurface ? isBulb ? 2.4 : 0.55 : 0.85) * solid : 0
  }
}
