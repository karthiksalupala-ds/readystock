import { useMemo, type PointerEvent } from 'react'

export type SpecularHandlers<T extends HTMLElement> = {
  onPointerMove: (event: PointerEvent<T>) => void
  onPointerLeave: (event: PointerEvent<T>) => void
}

/**
 * Glass only reads as glass when the light moves on it.
 *
 * Writes the pointer position onto the element as `--gx` / `--gy` so the
 * specular highlight in CSS can follow it, and drops `--glass-shine` back to 0
 * on the way out. Positions are percentages of the element, so a panel keeps
 * its own highlight regardless of where it sits on screen.
 */
export function useSpecular<T extends HTMLElement = HTMLElement>(): SpecularHandlers<T> {
  return useMemo(
    () => ({
      onPointerMove(event: PointerEvent<T>) {
        const element = event.currentTarget
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        element.style.setProperty('--gx', `${((event.clientX - rect.left) / rect.width) * 100}%`)
        element.style.setProperty('--gy', `${((event.clientY - rect.top) / rect.height) * 100}%`)
        element.style.setProperty('--glass-shine', '1')
      },
      onPointerLeave(event: PointerEvent<T>) {
        event.currentTarget.style.setProperty('--glass-shine', '0')
      },
    }),
    [],
  )
}
