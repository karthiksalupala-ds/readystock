import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PointerEvent } from 'react'
import { useSpecular } from './useSpecular'

function panel(width: number, height: number) {
  const element = document.createElement('div')
  element.getBoundingClientRect = () =>
    ({ left: 100, top: 40, width, height, right: 100 + width, bottom: 40 + height, x: 100, y: 40 }) as DOMRect
  return element
}

function pointerAt(element: HTMLElement, clientX: number, clientY: number) {
  return { currentTarget: element, clientX, clientY } as unknown as PointerEvent<HTMLElement>
}

describe('useSpecular', () => {
  it('tracks the pointer as a percentage of the panel', () => {
    const { result } = renderHook(() => useSpecular())
    const element = panel(200, 100)

    result.current.onPointerMove(pointerAt(element, 150, 65))

    expect(element.style.getPropertyValue('--gx')).toBe('25%')
    expect(element.style.getPropertyValue('--gy')).toBe('25%')
    expect(element.style.getPropertyValue('--glass-shine')).toBe('1')
  })

  it('fades the highlight out when the pointer leaves', () => {
    const { result } = renderHook(() => useSpecular())
    const element = panel(200, 100)

    result.current.onPointerMove(pointerAt(element, 150, 65))
    result.current.onPointerLeave(pointerAt(element, 0, 0))

    expect(element.style.getPropertyValue('--glass-shine')).toBe('0')
  })

  it('ignores a panel that has not been laid out yet', () => {
    const { result } = renderHook(() => useSpecular())
    const element = panel(0, 0)

    result.current.onPointerMove(pointerAt(element, 10, 10))

    expect(element.style.getPropertyValue('--glass-shine')).toBe('')
  })
})
