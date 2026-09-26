/// <reference types="node" />
// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Box3, Euler, Group, Mesh, Raycaster, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { instantiateCatalogModel } from '../scene/catalogModel'
import { furnitureAsset } from '../scene/furnitureCatalog'
import { interactionsForObject } from './profiles'
import { applyObjectPower } from '../scene/furnitureEffects'
import { cloneFurniture, fitFurniture } from '../assets/furniture'
import type { SceneObject } from '../scene/types'
import manifest from '../../models/manifest.json'

async function load(id: string) {
  const file = manifest.assets.find((entry) => entry.id === id)!.file
  const bytes = await readFile(new URL(`../../models/${file}`, import.meta.url))
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}

describe('interaction anchors against shipped geometry', () => {
  for (const assetId of ['chair_cafe', 'chair_standard', 'chair_office', 'stool_round', 'sofa_2seat', 'sofa_3seat']) {
    it(`${assetId} contacts every visible cushion after scaling, centering, and rotation`, async () => {
      const asset = furnitureAsset(assetId)!
      const object: SceneObject = { id: 'seat', type: asset.type, assetId, label: asset.name, category: 'furniture',
        size: [asset.size[0] * 1.2, asset.size[1] * 1.1, asset.size[2] * 1.15], position: [1, asset.size[1] * 1.1 / 2, -1], rotation: [0, 1.1, 0] }
      const model = instantiateCatalogModel(await load(assetId), object.size)
      const placement = new Group()
      placement.add(model.root)
      placement.position.set(...object.position)
      placement.rotation.set(...object.rotation!)
      placement.updateMatrixWorld(true)
      const interactions = interactionsForObject(object)
      expect(interactions.length).toBeGreaterThan(0)
      for (const seat of interactions) {
        if (seat.kind !== 'seat') throw new Error('Expected a seat')
        const ray = new Raycaster(new Vector3(...seat.seat).add(new Vector3(0, 0.015, 0)), new Vector3(0, -1, 0))
        const hit = ray.intersectObject(model.root, true)[0]
        expect(hit?.point.y).toBeCloseTo(seat.seat[1], 4)
        const front = new Vector3(...seat.approach).sub(new Vector3(...seat.seat)).applyEuler(new Euler(0, -seat.heading, 0))
        expect(front.z).toBeGreaterThan(0.5)
        expect(front.x).toBeCloseTo(0)
      }
      model.dispose()
    })
  }

  it('demo GLB fitting and catalog fitting put the same chair cushion at the same anchor', async () => {
    const object: SceneObject = { id: 'demo-chair', type: 'chair', label: 'Chair', category: 'furniture', size: [0.6, 0.9, 0.6], position: [0, 0.45, 0] }
    const instance = cloneFurniture(await load('chair_standard'))
    const fit = fitFurniture(instance.bounds, object.size)
    const placement = new Group()
    placement.position.set(...object.position)
    instance.scene.position.set(...fit.position)
    instance.scene.scale.set(...fit.scale)
    placement.add(instance.scene)
    placement.updateMatrixWorld(true)
    const seat = interactionsForObject(object)[0]
    if (seat.kind !== 'seat') throw new Error('Expected a chair seat')
    const ray = new Raycaster(new Vector3(...seat.seat).add(new Vector3(0, 0.02, 0)), new Vector3(0, -1, 0))
    expect(ray.intersectObject(instance.scene, true)[0]?.point.y).toBeCloseTo(seat.seat[1], 4)
    instance.dispose()
  })

  for (const assetId of ['lamp_floor', 'tv_flat', 'monitor_desktop', 'laptop']) {
    it(`${assetId} has designated switchable materials isolated between placed model instances`, async () => {
      const asset = furnitureAsset(assetId)!
      const source = await load(assetId)
      const first = instantiateCatalogModel(source, asset.size)
      const second = instantiateCatalogModel(source, asset.size)
      const object: SceneObject = { id: assetId, type: asset.type, assetId, label: asset.name, category: 'furniture', size: asset.size, position: [0, asset.size[1] / 2, 0] }
      applyObjectPower(first.materials, object, true)
      applyObjectPower(second.materials, object, false)
      expect(first.materials.filter((material) => material.emissiveIntensity > 0 && material.emissive.getHex() !== 0).length).toBe(assetId === 'lamp_floor' ? 2 : 1)
      expect(second.materials.every((material) => material.emissive.getHex() === 0 || material.emissiveIntensity === 0)).toBe(true)
      first.dispose()
      second.dispose()
    })
  }
  it('targets the actual tilted laptop display after placement and scaling', async () => {
    const asset = furnitureAsset('laptop')!
    const object: SceneObject = { id: 'laptop', type: asset.type, assetId: asset.id, label: asset.name,
      category: 'equipment', size: asset.size.map(n => n * 1.3) as [number, number, number],
      position: [2, 1, -1], rotation: [0, Math.PI / 3, 0] }
    const model = instantiateCatalogModel(await load('laptop'), object.size)
    const placement = new Group()
    placement.position.set(...object.position)
    placement.rotation.set(...object.rotation!)
    placement.add(model.root)
    placement.updateMatrixWorld(true)
    const bounds = new Box3()
    model.root.traverse(node => {
      if (node instanceof Mesh && [node.material].flat().some(material => material.name === 'IDAR_screen')) bounds.expandByObject(node)
    })
    const target = interactionsForObject(object)[0]
    expect(target?.kind).toBe('toggle')
    expect(new Vector3(...target.point).distanceTo(bounds.getCenter(new Vector3()))).toBeLessThan(.001)
    model.dispose()
  })
})
