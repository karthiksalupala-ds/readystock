import { Box3, BufferGeometry, Group, InstancedMesh, LoadingManager, Material, Matrix4, Mesh, Object3D, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { Vec3 } from '../scene/types'
import type { LoadedRoom, NormalizedRoom, RoomBounds, RoomCollider } from './types'

export const MAX_ROOM_BYTES = 50 * 1024 * 1024
export const MAX_ROOM_TRIANGLES = 250_000
const sources = new WeakMap<LoadedRoom, RoomCollider[]>()

type GlbDocument = {
  asset?: { version?: string }
  animations?: unknown[]
  skins?: unknown[]
  extensionsRequired?: string[]
  extensionsUsed?: string[]
  accessors?: { count: number; type: string }[]
  meshes?: { primitives: { mode?: number; targets?: unknown[]; indices?: number; attributes: Record<string, number> }[] }[]
  nodes?: { mesh?: number; children?: number[]; extensions?: { EXT_mesh_gpu_instancing?: { attributes: Record<string, number> } } }[]
  scene?: number
  scenes?: { nodes?: number[] }[]
}

const supportedRequiredExtensions = new Set([
  'KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_mesh_quantization',
  'EXT_mesh_gpu_instancing', 'KHR_materials_unlit', 'KHR_materials_clearcoat',
  'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior',
  'KHR_materials_specular', 'KHR_materials_sheen', 'KHR_materials_iridescence',
  'KHR_materials_anisotropy', 'KHR_materials_emissive_strength', 'KHR_texture_transform',
  'KHR_lights_punctual', 'EXT_texture_webp', 'EXT_texture_avif',
])

function inspectGlb(bytes: ArrayBuffer): void {
  const view = new DataView(bytes)
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error('Choose a valid GLB version 2 room file.')
  }
  let document: GlbDocument | undefined
  for (let offset = 12; offset < bytes.byteLength;) {
    if (offset + 8 > bytes.byteLength) throw new Error('The GLB has an incomplete chunk.')
    const length = view.getUint32(offset, true)
    const kind = view.getUint32(offset + 4, true)
    if (length % 4 !== 0 || offset + 8 + length > bytes.byteLength) throw new Error('The GLB has an invalid chunk length.')
    if (offset === 12 && kind !== 0x4e4f534a) throw new Error('The GLB is missing its JSON description.')
    if (kind === 0x4e4f534a) {
      if (document) throw new Error('The GLB has duplicate JSON descriptions.')
      try {
        document = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, offset + 8, length))) as GlbDocument
      } catch {
        throw new Error('The GLB has an invalid JSON description.')
      }
    }
    offset += 8 + length
  }
  if (document?.asset?.version !== '2.0') throw new Error('Choose a valid GLB version 2 room file.')

  // Reject external resources before the loader can fetch anything. Embedded
  // bufferViews and data URIs remain fully self-contained.
  function inspectUris(value: unknown): void {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (key === 'uri' && (typeof child !== 'string' || !child.startsWith('data:'))) {
        throw new Error('Room GLBs must be self-contained: embed all buffers and textures.')
      }
      inspectUris(child)
    }
  }
  inspectUris(document)
  if (document.animations?.length || document.skins?.length) throw new Error('Import a static room GLB without animations or skinning.')
  const extensions = [...(document.extensionsRequired ?? []), ...(document.extensionsUsed ?? [])]
  if (extensions.includes('KHR_texture_basisu')) throw new Error('KTX2 textures are not supported for room imports. Export PNG or JPEG textures.')
  for (const extension of document.extensionsRequired ?? []) {
    if (!supportedRequiredExtensions.has(extension)) throw new Error(`Unsupported required GLB extension: ${extension}.`)
  }
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.targets?.length) throw new Error('Import a static room GLB without morph targets.')
      if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error('Room GLBs must contain triangle surfaces, not points or lines.')
    }
  }

  // Bound the work before decompressing buffers, including reused meshes and
  // GPU instances. Count only the default scene selected by GLTFLoader.
  let triangles = 0
  const ancestry = new Set<number>()
  const accessorCount = (index: number | undefined): number => {
    const count = index === undefined ? undefined : document?.accessors?.[index]?.count
    if (count === undefined || !Number.isSafeInteger(count) || count < 0) throw new Error('The GLB contains an invalid geometry accessor.')
    return count
  }
  const visitNode = (index: number): void => {
    const node = document?.nodes?.[index]
    if (!node || ancestry.has(index)) throw new Error('The GLB contains an invalid node hierarchy.')
    ancestry.add(index)
    if (node.mesh !== undefined) {
      const mesh = document?.meshes?.[node.mesh]
      if (!mesh) throw new Error('The GLB references a missing mesh.')
      const instanceAttributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes
      const instances = instanceAttributes ? accessorCount(Object.values(instanceAttributes)[0]) : 1
      for (const primitive of mesh.primitives) {
        const count = accessorCount(primitive.indices ?? primitive.attributes.POSITION)
        if (count % 3 !== 0) throw new Error('The GLB contains an incomplete triangle.')
        triangles += count / 3 * instances
        if (triangles > MAX_ROOM_TRIANGLES) throw new Error('Room imports are limited to 250,000 rendered triangles.')
      }
    }
    for (const child of node.children ?? []) visitNode(child)
    ancestry.delete(index)
  }
  for (const index of document.scenes?.[document.scene ?? 0]?.nodes ?? []) visitNode(index)
}

/** Owns loaded resources until callers dispose the room, including failed validation. */
export async function loadRoomFile(file: File): Promise<LoadedRoom> {
  if (file.size > MAX_ROOM_BYTES) throw new Error('Room GLBs must be 50 MiB or smaller.')
  if (!file.name.toLowerCase().endsWith('.glb')) throw new Error('Choose a self-contained .glb room file.')
  const bytes = await file.arrayBuffer()
  inspectGlb(bytes)
  const manager = new LoadingManager()
  const draco = new DRACOLoader(manager).setDecoderPath(`${import.meta.env.BASE_URL ?? '/'}decoders/draco/`)
  const loader = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder)
  try {
    const gltf = await loader.parseAsync(bytes, '')
    const root = gltf.scene
    // Room lighting belongs to the app, not arbitrary lamps embedded in a scan.
    root.traverse((object) => { if ('isLight' in object || 'isCamera' in object) object.visible = false })
    return loadedRoomFromScene(root, file.name, gltf.scenes)
  } catch (error) {
    throw new Error(`Unable to import room: ${error instanceof Error ? error.message : 'invalid GLB data.'}`)
  } finally {
    draco.dispose()
  }
}

function disposeRoots(roots: Object3D[]): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  const images = new Set<{ close?: () => void }>()
  for (const root of roots) {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    })
  }
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value)
    }
    material.dispose()
  }
  for (const texture of textures) {
    for (const image of Array.isArray(texture.image) ? texture.image : [texture.image]) {
      if (image && typeof image === 'object') images.add(image)
    }
    texture.dispose()
  }
  for (const image of images) image.close?.()
  for (const geometry of geometries) geometry.dispose()
}

function roomGeometry(root: Group): { bounds: RoomBounds; triangleCount: number; colliders: RoomCollider[] } {
  root.updateWorldMatrix(true, true)
  const parentInverse = root.parent ? root.parent.matrixWorld.clone().invert() : new Matrix4()
  const bounds = new Box3()
  const point = new Vector3()
  const colliders: RoomCollider[] = []
  let triangleCount = 0
  root.traverseVisible((object) => {
    if (!(object instanceof Mesh)) return
    if ('isSkinnedMesh' in object || Object.keys(object.geometry.morphAttributes).length) {
      throw new Error('Import a static room mesh without skinning or morph targets.')
    }
    const geometry: BufferGeometry = object.geometry
    const attribute = geometry.getAttribute('position')
    if (!attribute || attribute.itemSize !== 3) throw new Error('The room contains invalid vertex positions.')
    const index = geometry.getIndex()
    const count = index?.count ?? attribute.count
    const drawStart = geometry.drawRange.start
    const drawEnd = Math.min(count, drawStart + geometry.drawRange.count)
    const ranges = Array.isArray(object.material)
      ? geometry.groups.filter((group) => (object.material as Material[])[group.materialIndex ?? 0]?.visible).map((group) => [Math.max(drawStart, group.start), Math.min(drawEnd, group.start + group.count)])
      : object.material.visible ? [[drawStart, drawEnd]] : []
    const instances = object instanceof InstancedMesh ? object.count : 1
    for (let instance = 0; instance < instances; instance++) {
      const transform = parentInverse.clone().multiply(object.matrixWorld)
      if (object instanceof InstancedMesh) {
        const local = new Matrix4()
        object.getMatrixAt(instance, local)
        transform.multiply(local)
      }
      if (!transform.elements.every(Number.isFinite) || Math.abs(transform.determinant()) < 1e-15) throw new Error('The room contains an invalid mesh transform.')
      const vertices: number[] = []
      for (const [start, end] of ranges) {
        if (!Number.isInteger(start) || start < 0 || (end - start) % 3 !== 0) throw new Error('The room contains incomplete triangle geometry.')
        triangleCount += Math.max(0, end - start) / 3
        if (triangleCount > MAX_ROOM_TRIANGLES) throw new Error('Room imports are limited to 250,000 rendered triangles.')
        for (let i = start; i < end; i++) {
          const vertexIndex = index ? index.getX(i) : i
          if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= attribute.count) throw new Error('The room contains an invalid triangle index.')
          point.fromBufferAttribute(attribute, vertexIndex).applyMatrix4(transform)
          if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Room vertex positions must be finite.')
          bounds.expandByPoint(point)
          vertices.push(point.x, point.y, point.z)
        }
      }
      if (vertices.length) {
        const indices = Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i)
        if (transform.determinant() < 0) {
          for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
        }
        colliders.push({ kind: 'trimesh', vertices: new Float32Array(vertices), indices })
      }
    }
  })
  if (bounds.isEmpty() || !triangleCount) throw new Error('The GLB has no visible triangle surfaces to explore.')
  return { bounds: { min: bounds.min.toArray() as Vec3, max: bounds.max.toArray() as Vec3 }, triangleCount, colliders }
}

/** Also serves as the adapter for trusted, already-decoded static Three.js scenes. */
export function loadedRoomFromScene(root: Group, name: string, resourceRoots: Object3D[] = [root]): LoadedRoom {
  try {
    const geometry = roomGeometry(root)
    let disposed = false
    const room: LoadedRoom = {
      id: `glb:${crypto.randomUUID()}`,
      name,
      root,
      bounds: geometry.bounds,
      triangleCount: geometry.triangleCount,
      dispose() {
        if (disposed) return
        disposed = true
        sources.delete(room)
        disposeRoots(resourceRoots)
      },
    }
    sources.set(room, geometry.colliders)
    return room
  } catch (error) {
    disposeRoots(resourceRoots)
    throw error
  }
}

export function normalizeRoom(room: LoadedRoom, unitScale: number, floorPoint: Vec3): NormalizedRoom {
  if (!Number.isFinite(unitScale) || unitScale <= 0) throw new Error('Choose a positive, finite room scale.')
  if (!floorPoint.every(Number.isFinite)) throw new Error('Choose a valid floor point.')
  const original = sources.get(room)
  if (!original) throw new Error('This room was disposed. Import it again.')
  const normalize = (point: Vec3): Vec3 => point.map((value, axis) => (value - floorPoint[axis]) * unitScale) as Vec3
  return {
    scale: unitScale,
    position: floorPoint.map((value) => -value * unitScale) as Vec3,
    environment: {
      id: room.id,
      bounds: { min: normalize(room.bounds.min), max: normalize(room.bounds.max) },
      spawn: [0, 0.02, 0],
      colliders: original.map((collider) => {
        if (collider.kind !== 'trimesh') throw new Error('Imported room colliders must be triangle meshes.')
        return {
          kind: 'trimesh',
          vertices: Float32Array.from(collider.vertices, (value, index) => (value - floorPoint[index % 3]) * unitScale),
          indices: collider.indices,
        }
      }),
    },
  }
}
