import { useCallback, useState } from 'react'
import {
  loadSettings,
  saveSettings,
  type GraphicsSettings,
  type SettingsStorage,
} from './graphics'

/**
 * Graphics settings, remembered on this device.
 *
 * Read once on mount rather than on every render: a machine that is already
 * dropping frames should not also be parsing JSON sixty times a second.
 */
export function useGraphics(): [GraphicsSettings, (next: GraphicsSettings) => void] {
  const [settings, setSettings] = useState(() =>
    loadSettings(safeStorage(), prefersReducedMotion()),
  )

  const update = useCallback((next: GraphicsSettings) => {
    setSettings(next)
    saveSettings(safeStorage(), next)
  }, [])

  return [settings, update]
}

/** `localStorage` throws outright in some locked-down browsers; treat that as absent. */
function safeStorage(): SettingsStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
