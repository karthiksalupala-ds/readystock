/// <reference types="node" />
// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { instantiateCatalogModel } from './catalogModel'
import { FURNITURE_CATALOG } from './furnitureCatalog'
import manifest from '../../models/manifest.json'

describe('catalog GLB integration', () => {
  for (const asset of FURNITURE_CATALOG) it(`loads ${asset.id} at its measured size without changing the cached source`, async () => {
    const file = manifest.assets.find((entry) => entry.id === asset.id)!.file
    const bytes = await readFile(new URL(`../../models/${file}`, import.meta.url))
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const source = (await new GLTFLoader().parseAsync(buffer, '')).scene
    const original = new Box3().setFromObject(source)
    const one = instantiateCatalogModel(source, asset.size)
    const two = instantiateCatalogModel(source, asset.size)
    const bounds = new Box3().setFromObject(one.root)
    bounds.getSize(new Vector3()).toArray().forEach((value, i) => expect(value).toBeCloseTo(asset.size[i], 4))
    expect(bounds.getCenter(new Vector3()).length()).toBeLessThan(0.0001)
    one.materials[0].color.set('#ff0000')
    expect(two.materials[0].color.getHexString()).not.toBe('ff0000')
    expect(new Box3().setFromObject(source)).toEqual(original)
    expect(one.materials[0]).not.toBe(two.materials[0])
    one.dispose()
    two.dispose()
    source.traverse((node) => {
      if (node instanceof Mesh) {
        node.geometry.dispose()
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach((material: MeshStandardMaterial) => material.dispose())
      }
    })
  })
})
