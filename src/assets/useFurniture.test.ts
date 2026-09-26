import { act, renderHook, waitFor } from '@testing-library/react'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFurniture } from './useFurniture'

function scene(): GLTF {
  const root = new Group()
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  return { scene: root } as unknown as GLTF
}

afterEach(() => vi.restoreAllMocks())

describe('furniture loading', () => {
  it('keeps raw and unknown boxes immediately ready without fetching an asset', () => {
    const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync')
    const { result } = renderHook(() => useFurniture('unknown'))
    expect(result.current).toEqual({ ready: true, instance: null })
    expect(load).not.toHaveBeenCalled()
  })

  it('loads reconstructed furniture and disposes its own materials on unmount', async () => {
    const original = scene()
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(original)
    const { result, unmount } = renderHook(() => useFurniture('chair'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    const material = (result.current.instance!.scene.children[0] as Mesh).material as MeshStandardMaterial
    const dispose = vi.spyOn(material, 'dispose')
    const originalDispose = vi.spyOn((original.scene.children[0] as Mesh).material as MeshStandardMaterial, 'dispose')
    unmount()
    expect(dispose).toHaveBeenCalledOnce()
    expect(originalDispose).not.toHaveBeenCalled()
  })

  it('settles a failed asset to a usable box fallback', async () => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockRejectedValue(new Error('Unavailable'))
    const { result } = renderHook(() => useFurniture('table'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.instance).toBeNull()
  })

  it('ignores an old request when a room or semantic type changes', async () => {
    let finishShelf!: (value: GLTF) => void
    let finishMonitor!: (value: GLTF) => void
    vi.spyOn(GLTFLoader.prototype, 'loadAsync')
      .mockImplementationOnce(() => new Promise((resolve) => { finishShelf = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishMonitor = resolve }))
    const { result, rerender } = renderHook(({ type }) => useFurniture(type), { initialProps: { type: 'shelf' } })
    rerender({ type: 'monitor' })
    await act(async () => finishShelf(scene()))
    expect(result.current).toEqual({ ready: false, instance: null })
    await act(async () => finishMonitor(scene()))
    expect(result.current.ready).toBe(true)
    expect(result.current.instance).not.toBeNull()
  })
})
