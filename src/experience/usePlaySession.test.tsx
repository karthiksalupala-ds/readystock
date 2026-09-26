import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePlaySession } from './usePlaySession'

describe('play session lifecycle', () => {
  it('waits for the player and pauses on blur until explicitly resumed', () => {
    const { result } = renderHook(() => usePlaySession())
    act(() => result.current.start())
    expect(result.current.active).toBe(true)
    expect(result.current.ready).toBe(false)
    act(() => result.current.markReady())
    act(() => window.dispatchEvent(new Event('blur')))
    expect(result.current.paused).toBe(true)
    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current.paused).toBe(true)
    act(() => result.current.resume())
    expect(result.current.paused).toBe(false)
  })

  it('exits on Escape, and resets without restarting the whole room', () => {
    const { result } = renderHook(() => usePlaySession())
    act(() => result.current.start())
    act(() => result.current.reset())
    expect(result.current.resetToken).toBe(1)
    expect(result.current.active).toBe(true)
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(result.current.active).toBe(false)
  })

  it('removes global listeners when unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { result, unmount } = renderHook(() => usePlaySession())
    act(() => result.current.start())
    unmount()
    expect(remove).toHaveBeenCalledWith('blur', expect.any(Function))
    remove.mockRestore()
  })
})
