import { MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { applyObjectPower, nearestEnabledLamps } from './furnitureEffects'
import { interactionsForObject } from '../interaction/profiles'
import type { SceneObject } from './types'

function material(name: string) { const result = new MeshStandardMaterial({ color: '#aabbcc', roughness: 0.32 }); result.name = name; return result }
const lamp: SceneObject = { id: 'lamp', assetId: 'lamp_floor', type: 'lamp', label: 'Lamp', category: 'furniture', position: [0, 0.8, 0], size: [0.45, 1.6, 0.45] }

describe('object power materials', () => {
  it('assigns four light sources to the nearest enabled lamps and preserves distant glows', () => {
    const objects = Array.from({ length: 6 }, (_, index) => ({ ...lamp, id: `lamp-${index}`, position: [index * 2, 0.8, 0] as [number, number, number] }))
    const interactions = objects.flatMap(interactionsForObject)
    const toggles = Object.fromEntries(objects.map((object) => [object.id, true]))
    expect(nearestEnabledLamps(interactions, toggles, [10, 1, 0]).map((light) => light.objectId)).toEqual(['lamp-5', 'lamp-4', 'lamp-3', 'lamp-2'])
    expect(nearestEnabledLamps(interactions, {}, [0, 1, 0])).toEqual([])
    expect(toggles['lamp-0']).toBe(true)
  })
  it('lights only a lamp bulb and shade while retaining color, finish, and other instances', () => {
    const one = ['IDAR_white', 'IDAR_fabric_light', 'IDAR_metal'].map(material)
    const two = one.map((value) => value.clone())
    applyObjectPower(one, lamp, true)
    expect(one[0].emissiveIntensity).toBeGreaterThan(1)
    expect(one[1].emissiveIntensity).toBeGreaterThan(0)
    expect(one[2].emissive.getHex()).toBe(0)
    expect(two[0].emissive.getHex()).toBe(0)
    expect(one[1].color.getHexString()).toBe('aabbcc')
    expect(one[1].roughness).toBe(0.32)
    applyObjectPower(one, lamp, false)
    expect(one[0].emissiveIntensity).toBe(0)
    expect(one[1].emissiveIntensity).toBe(0)
  })

  it('switches only designated TV/monitor screens and starts off', () => {
    for (const assetId of ['tv_flat', 'monitor_desktop', 'laptop']) {
      const screen = material('IDAR_screen')
      const housing = material('IDAR_dark')
      applyObjectPower([screen, housing], { ...lamp, assetId }, false)
      expect(screen.emissiveIntensity).toBe(0)
      applyObjectPower([screen, housing], { ...lamp, assetId }, true)
      expect(screen.emissiveIntensity).toBeGreaterThan(0.5)
      expect(housing.emissive.getHex()).toBe(0)
    }
  })

  it('does not treat upholstery or computer cases as lamp and screen surfaces', () => {
    const upholstery = material('IDAR_fabric_light')
    const screen = material('IDAR_screen')
    applyObjectPower([upholstery, screen], { ...lamp, assetId: 'sofa_2seat' }, true)
    expect(upholstery.emissive.getHex()).toBe(0)
    expect(screen.emissive.getHex()).toBe(0)
  })
})
