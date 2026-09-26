import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScanProgress } from './useScanProgress'

const DURATION = 1000

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useScanProgress', () => {
  it('holds at zero until the scan is armed', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const { result } = renderHook(() => useScanProgress(false, DURATION))
    advance(DURATION * 2)
    expect(result.current.progress).toBe(0)
  })

  it('runs from zero to a complete sweep over the duration', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const { result } = renderHook(() => useScanProgress(true, DURATION))
    expect(result.current.progress).toBe(0)

    advance(DURATION / 2)
    expect(result.current.progress).toBeGreaterThan(0.2)
    expect(result.current.progress).toBeLessThan(1)

    advance(DURATION)
    expect(result.current.progress).toBe(1)
  })

  it('lets a presenter skip straight to the finished scan', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const { result } = renderHook(() => useScanProgress(true, DURATION))
    advance(DURATION / 4)

    act(() => {
      result.current.skip()
    })
    expect(result.current.progress).toBe(1)

    advance(DURATION)
    expect(result.current.progress).toBe(1)
  })

  it('lands on a finished scan when the sweep is switched off', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const { result } = renderHook(() => useScanProgress(true, 0))
    expect(result.current.progress).toBe(1)
  })

  it('leaves the reduced-motion decision to the caller', () => {
    // Graphics settings own that choice, so someone who switches animation back
    // on gets the sweep even on a machine that asks for reduced motion.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
    const { result } = renderHook(() => useScanProgress(true, DURATION))
    expect(result.current.progress).toBe(0)

    advance(DURATION / 2)
    expect(result.current.progress).toBeGreaterThan(0.2)
    expect(result.current.progress).toBeLessThan(1)
  })
})
