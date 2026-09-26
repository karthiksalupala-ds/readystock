// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import { Euler, Quaternion, Vector3 } from 'three'
import { furnitureColliders } from './furnitureColliders'
import type { SceneObject, Vec3 } from '../scene/types'

const table: SceneObject = { id: 'table', type: 'table', label: 'Table', category: 'furniture', size: [1.4, .75, .8], position: [0, .375, 0] }
beforeAll(async () => { await RAPIER.init() })

function withFurniture(object: SceneObject, test: (blocked: (point: Vec3) => boolean, world: RAPIER.World) => void) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  try {
    const parts = furnitureColliders(object)
    expect(parts.every(part => part.objectId === object.id)).toBe(true)
    for (const part of parts) {
      const description = part.kind === 'box' ? RAPIER.ColliderDesc.cuboid(...part.halfExtents).setTranslation(...part.center)
        : RAPIER.ColliderDesc.trimesh(part.vertices, part.indices)
      if (part.kind === 'box' && part.rotation) description.setRotation(new Quaternion().setFromEuler(new Euler(...part.rotation)))
      world.createCollider(description)
    }
    world.step()
    test(point => world.intersectionWithShape({ x: point[0], y: point[1], z: point[2] }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(.004)) !== null, world)
  } finally { world.free() }
}

describe('furniture component collisions', () => {
  it('keeps café table knee space open while retaining the pedestal, feet, and top', () => {
    withFurniture({ ...table, assetId: 'table_cafe', size: [.76, .74059, .76], position: [0, .370295, 0] }, blocked => {
      expect(blocked([.3, .4, 0])).toBe(false)
      expect(blocked([0, .4, 0])).toBe(true)
      expect(blocked([.2, .73, .2])).toBe(true)
      expect(blocked([.22, .045, 0])).toBe(true)
    })
  })
  for (const assetId of [undefined, 'table_dining']) it(`keeps clear under-table space for ${assetId ?? 'demo dining table'} while blocking its legs, apron, and top`, () => {
    withFurniture({ ...table, assetId }, blocked => {
      expect(blocked([0, .3, 0])).toBe(false)
      expect(blocked([0, .6, .315])).toBe(false)
      expect(blocked([0, .655, .315])).toBe(true)
      expect(blocked([0, .7275, 0])).toBe(true)
      for (const x of [-.615, .615]) for (const z of [-.315, .315]) expect(blocked([x, .3, z])).toBe(true)
    })
  })

  it('fits and rotates all dining table components through the renderer transform', () => {
    const object: SceneObject = { ...table, size: [2.8, 1.5, 1.6], position: [2, .75, -1], rotation: [0, Math.PI / 2, 0] }
    const transform = (point: Vec3): Vec3 => new Vector3(...point).multiplyScalar(2).applyEuler(new Euler(0, Math.PI / 2, 0)).add(new Vector3(2, 0, -1)).toArray()
    withFurniture(object, blocked => {
      expect(blocked(transform([0, .3, 0]))).toBe(false)
      expect(blocked(transform([.615, .3, .315]))).toBe(true)
      expect(blocked(transform([0, .7275, 0]))).toBe(true)
    })
  })

  for (const shape of ['rectangular', 'oval']) it(`retains the procedural ${shape} supports with an open seating space`, () => {
    withFurniture({ ...table, shape }, blocked => {
      expect(blocked([0, .2, 0])).toBe(false)
      expect(blocked([0, .75, 0])).toBe(true)
      expect(blocked(shape === 'oval' ? [(.24 + .035) * 1.4, .3, 0] : [.39 * 1.4, .3, .36 * .8])).toBe(true)
      if (shape === 'oval') expect(blocked([.68, .72, .38])).toBe(false)
    })
  })

  it('keeps solid collision bounds for cabinets and unsupported catalog table models', () => {
    for (const object of [{ ...table, type: 'shelf' }, { ...table, assetId: 'table_side' }]) {
      expect(furnitureColliders(object)).toHaveLength(1)
      withFurniture(object, blocked => expect(blocked([0, .3, 0])).toBe(true))
    }
  })
})
