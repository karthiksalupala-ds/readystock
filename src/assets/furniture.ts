import { Box3, Color, Mesh, MeshStandardMaterial, Vector3, type Material, type Object3D } from 'three'
import type { Vec3 } from '../scene/types'

type MaterialState = {
  material: Material
  opacity: number
  transparent: boolean
  depthWrite: boolean
  emissive?: Color
  emissiveIntensity?: number
}

export type FurnitureInstance = ReturnType<typeof cloneFurniture>

/** Cache geometry and textures; own materials so each object can highlight independently. */
export function cloneFurniture(source: Object3D) {
  const scene = source.clone(true)
  const copies = new Map<Material, Material>()
  const materials: MaterialState[] = []
  function cloneMaterial(original: Material): Material {
    const existing = copies.get(original)
    if (existing) return existing
    const material = original.clone()
    copies.set(original, material)
    materials.push({
      material,
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
      ...(material instanceof MeshStandardMaterial
        ? { emissive: material.emissive.clone(), emissiveIntensity: material.emissiveIntensity }
        : {}),
    })
    return material
  }
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material)
    object.castShadow = true
    object.receiveShadow = true
  })
  scene.updateMatrixWorld(true)
  return {
    scene,
    materials,
    bounds: new Box3().setFromObject(scene),
    dispose() { copies.forEach((material) => material.dispose()) },
  }
}

/** Fit local source bounds to a centered graph box, including floor/support offset. */
export function fitFurniture(bounds: Box3, size: Vec3): { scale: Vec3; position: Vec3 } {
  const sourceSize = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const scale: Vec3 = [
    size[0] / Math.max(sourceSize.x, 0.0001),
    size[1] / Math.max(sourceSize.y, 0.0001),
    size[2] / Math.max(sourceSize.z, 0.0001),
  ]
  return {
    scale,
    position: [-center.x * scale[0], -bounds.min.y * scale[1] - size[1] / 2, -center.z * scale[2]],
  }
}

const ACCENT = new Color('#3ee0c2')

export function updateFurnitureMaterials(materials: MaterialState[], solid: number, glow: number) {
  for (const state of materials) {
    const { material } = state
    const transparent = state.transparent || solid < 1
    if (transparent !== material.transparent) {
      material.transparent = transparent
      material.needsUpdate = true
    }
    material.opacity = state.opacity * solid
    material.depthWrite = state.depthWrite && solid >= 1
    if (material instanceof MeshStandardMaterial && state.emissive) {
      material.emissive.copy(glow > 0 ? ACCENT : state.emissive)
      material.emissiveIntensity = glow > 0 ? glow : state.emissiveIntensity ?? 0
    }
  }
}
