import { act, renderHook } from '@testing-library/react'
import { Group } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { useRoomImport } from './useRoomImport'
import type { LoadedRoom } from '../room/types'

function room(id: string): LoadedRoom {
  return { id, name: `${id}.glb`, root: new Group(), bounds: { min: [0, 0, 0], max: [4, 3, 4] }, triangleCount: 12, dispose: vi.fn() }
}
function deferred() {
  let resolve!: (room: LoadedRoom) => void
  const promise = new Promise<LoadedRoom>(yes => { resolve = yes })
  return { resolve, promise }
}

describe('room import transactions', () => {
  it('disposes a late cancelled load instead of replacing the current room', async () => {
    const pending = deferred()
    const loaded = room('cancelled')
    const { result } = renderHook(() => useRoomImport(() => pending.promise))
    let request!: Promise<void>
    act(() => { request = result.current.load(new File([], 'room.glb')) })
    act(() => result.current.cancel())
    await act(async () => { pending.resolve(loaded); await request })
    expect(result.current.candidate).toBeNull()
    expect(loaded.dispose).toHaveBeenCalledOnce()
  })

  it('keeps a committed room when its replacement fails or setup is cancelled', async () => {
    const a = room('a')
    const b = room('b')
    const loader = vi.fn().mockResolvedValueOnce(a).mockRejectedValueOnce(new Error('Bad GLB')).mockResolvedValueOnce(b)
    const { result } = renderHook(() => useRoomImport(loader))
    await act(async () => { await result.current.load(new File([], 'a.glb')) })
    act(() => result.current.commit({ environment: { id: 'a', bounds: a.bounds, colliders: [], spawn: [0, 0, 0] }, scale: 1, position: [0, 0, 0] }))
    await act(async () => { await result.current.load(new File([], 'broken.glb')) })
    expect(result.current.current?.loaded).toBe(a)
    expect(result.current.error).toBe('Bad GLB')
    await act(async () => { await result.current.load(new File([], 'b.glb')) })
    act(() => result.current.cancel())
    expect(result.current.current?.loaded).toBe(a)
    expect(b.dispose).toHaveBeenCalledOnce()
    expect(a.dispose).not.toHaveBeenCalled()
  })

  it('releases the imported room when returning to the demo', async () => {
    const loaded = room('a')
    const { result } = renderHook(() => useRoomImport(async () => loaded))
    await act(async () => { await result.current.load(new File([], 'a.glb')) })
    act(() => result.current.commit({ environment: { id: 'a', bounds: loaded.bounds, colliders: [], spawn: [0, 0, 0] }, scale: 1, position: [0, 0, 0] }))
    act(() => result.current.backToDemo())
    expect(result.current.current).toBeNull()
    expect(loaded.dispose).toHaveBeenCalledOnce()
  })
})
