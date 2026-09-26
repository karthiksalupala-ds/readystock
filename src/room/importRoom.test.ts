// @vitest-environment node
import { BoxGeometry, BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Raycaster, Texture, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { loadRoomFile, normalizeRoom, loadedRoomFromScene, MAX_ROOM_BYTES } from './importRoom'
import { createRoomFixtureGlb, encodeGlb } from './roomFixture'

describe('local GLB rooms', () => {
  it('loads nested static geometry and preserves material appearance', async () => {
    const room = await loadRoomFile(new File([createRoomFixtureGlb()], 'meeting.glb'))
    expect(room.name).toBe('meeting.glb')
    expect(room.triangleCount).toBe(12)
    expect(room.bounds).toEqual({ min: [4, 2, 14], max: [16, 8, 26] })
    let material: MeshStandardMaterial | undefined
    room.root.traverse((object) => { if (object instanceof Mesh) material = object.material as MeshStandardMaterial })
    expect(material?.roughness).toBe(0.9)
    expect(material?.metalness).toBe(0)
    room.dispose()
  })

  it('normalizes collision vertices and visual wrapper with the same transform without changing the source', async () => {
    const room = await loadRoomFile(new File([createRoomFixtureGlb()], 'room.glb'))
    const normalized = normalizeRoom(room, 0.5, [10, 2, 20])
    expect(normalized.scale).toBe(0.5)
    expect(normalized.position).toEqual([-5, -1, -10])
    expect(normalized.environment.bounds).toEqual({ min: [-3, 0, -3], max: [3, 3, 3] })
    expect(normalized.environment.spawn).toEqual([0, 0.02, 0])
    expect(room.root.scale.toArray()).toEqual([1, 1, 1])
    expect(room.bounds.min).toEqual([4, 2, 14])
    expect(normalized.environment.colliders.every((collider) => collider.kind === 'trimesh')).toBe(true)
    const collider = normalized.environment.colliders[0]
    if (collider.kind !== 'trimesh') throw Error('Expected triangle mesh')
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(collider.vertices, 3))
    geometry.setIndex(new BufferAttribute(collider.indices, 1))
    const mesh = new Mesh(geometry, new MeshStandardMaterial())
    expect(new Raycaster(new Vector3(0, 1, 0), new Vector3(0, 0, -1)).intersectObject(mesh)).toHaveLength(0)
    expect(new Raycaster(new Vector3(1, 1, 0), new Vector3(0, 0, -1)).intersectObject(mesh).length).toBeGreaterThan(0)
    expect(new Raycaster(new Vector3(0, 1, 0), new Vector3(0, -1, 0)).intersectObject(mesh).length).toBeGreaterThan(0)
    geometry.dispose()
    mesh.material.dispose()
    room.dispose()
  })

  it('rejects invalid files and external resources before requesting them', async () => {
    await expect(loadRoomFile(new File(['hello'], 'room.glb'))).rejects.toThrow(/GLB/i)
    const huge = new File([], 'large.glb')
    Object.defineProperty(huge, 'size', { value: MAX_ROOM_BYTES + 1 })
    await expect(loadRoomFile(huge)).rejects.toThrow(/50 MiB/i)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(loadRoomFile(new File([encodeGlb({ asset: { version: '2.0' }, buffers: [{ uri: 'https://example.com/private.bin' }] })], 'external.glb'))).rejects.toThrow(/self-contained/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('rejects animated, skinned, unsupported compressed, and excessive geometry', async () => {
    for (const extra of [{ animations: [{}] }, { skins: [{}] }]) {
      await expect(loadRoomFile(new File([encodeGlb({ asset: { version: '2.0' }, ...extra })], 'animated.glb'))).rejects.toThrow(/static/i)
    }
    await expect(loadRoomFile(new File([encodeGlb({ asset: { version: '2.0' }, extensionsRequired: ['KHR_texture_basisu'] })], 'texture.glb'))).rejects.toThrow(/KTX2/i)
    const root = new Group()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(250_001 * 9), 3))
    root.add(new Mesh(geometry, new MeshStandardMaterial()))
    expect(() => loadedRoomFromScene(root, 'too-big')).toThrow(/250,000/i)
  })

  it('rejects nonfinite geometry and invalid normalization', () => {
    const root = new Group()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, NaN, 1, 0]), 3))
    root.add(new Mesh(geometry, new MeshStandardMaterial()))
    expect(() => loadedRoomFromScene(root, 'bad')).toThrow(/finite|invalid/i)
    const good = new Group()
    good.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
    const room = loadedRoomFromScene(good, 'good')
    expect(() => normalizeRoom(room, 0, [0, 0, 0])).toThrow(/scale/i)
    expect(() => normalizeRoom(room, 1, [NaN, 0, 0])).toThrow(/floor/i)
    room.dispose()
  })

  it('ignores hidden geometry and disposes shared geometry, materials, and images exactly once', () => {
    const root = new Group()
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    const close = vi.fn()
    material.map = new Texture({ close })
    const hidden = new Group()
    hidden.visible = false
    hidden.position.x = 100
    hidden.add(new Mesh(geometry, material))
    root.add(new Mesh(geometry, material), new Mesh(geometry, material), hidden)
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')
    const disposeTexture = vi.spyOn(material.map, 'dispose')
    const room = loadedRoomFromScene(root, 'shared')
    expect(room.triangleCount).toBe(24)
    expect(room.bounds.max[0]).toBe(0.5)
    room.dispose()
    room.dispose()
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
    expect(disposeTexture).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('cleans up exactly once if a decoded room fails geometry validation', async () => {
    const root = new Group()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, NaN, 1, 0]), 3))
    const material = new MeshStandardMaterial()
    root.add(new Mesh(geometry, material))
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue({ scene: root, scenes: [root] } as GLTF)
    await expect(loadRoomFile(new File([createRoomFixtureGlb()], 'bad-room.glb'))).rejects.toThrow(/finite/i)
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
    parse.mockRestore()
  })
})
