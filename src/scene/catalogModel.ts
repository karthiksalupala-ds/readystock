import { Box3, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { furnitureAsset } from './furnitureCatalog'
import type { Vec3 } from './types'

const cache = new Map<string, Promise<Group>>()
const loader = new GLTFLoader()

/** URLs are bundled from our model library, never supplied by an imported graph. */
export function loadCatalogModel(assetId: string): Promise<Group> {
  const asset = furnitureAsset(assetId)
  if (!asset?.url) return Promise.reject(new Error('Model not found in the furniture library.'))
  let pending = cache.get(assetId)
  if (!pending) {
    pending = loader.loadAsync(asset.url).then((gltf) => gltf.scene).catch((error: unknown) => {
      cache.delete(assetId)
      throw error
    })
    cache.set(assetId, pending)
  }
  return pending
}

/**
 * Warm the cache for every model a scene is about to place.
 *
 * A hundred-object floor draws on about two dozen distinct models. Left to the
 * meshes, each file is only requested when its first placement mounts; asked for
 * together, they download and parse in parallel and the room fills in far sooner.
 */
export function preloadCatalogModels(assetIds: Iterable<string>): void {
  for (const id of new Set(assetIds)) void loadCatalogModel(id).catch(() => {})
}

/** Geometry stays in the loader cache; each placement owns and disposes its own materials. */
export function instantiateCatalogModel(source: Object3D, size: Vec3) {
  const content = source.clone(true)
  const bounds = new Box3().setFromObject(content, true)
  const actual = bounds.getSize(new Vector3())
  if (actual.toArray().some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('Invalid furniture geometry.')
  content.position.sub(bounds.getCenter(new Vector3()))
  const root = new Group()
  root.add(content)
  root.scale.set(size[0] / actual.x, size[1] / actual.y, size[2] / actual.z)
  const copies = new Map<MeshStandardMaterial, MeshStandardMaterial>()
  content.traverse((node) => {
    if (!(node instanceof Mesh)) return
    node.castShadow = node.receiveShadow = true
    const cloneMaterial = (material: MeshStandardMaterial) => {
      let copy = copies.get(material)
      if (!copy) {
        copy = material.clone()
        copy.userData = { baseColor: copy.color.clone(), baseOpacity: copy.opacity,
          baseEmissive: copy.emissive.clone(), emission: copy.emissiveIntensity,
          roughness: copy.roughness, metalness: copy.metalness }
        copies.set(material, copy)
      }
      return copy
    }
    node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material)
  })
  return { root, materials: [...copies.values()], dispose: () => copies.forEach((material) => material.dispose()) }
}
