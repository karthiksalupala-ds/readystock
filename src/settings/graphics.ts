/**
 * Graphics settings — what the viewer is allowed to spend a frame on.
 *
 * Everything here is a cost the demo can do without. A machine that drops
 * frames should be able to turn the expensive parts off and keep the product:
 * the room, the labels, the reconstruct, the assistant.
 */

export type GraphicsSettings = {
  /** The LiDAR return cloud: thousands of additively blended points. */
  pointCloud: boolean
  /** Shadow map for the key light. */
  shadows: boolean
  /** Backdrop blur behind the HUD panels. */
  glassBlur: boolean
  /** The sweeping beam, its trail, and the floor pulse. */
  beam: boolean
  /** The opening sweep, the twin materialisation, and HUD animation. */
  motion: boolean
  /** Render at the display's own pixel ratio instead of 1. */
  fullResolution: boolean
}

export type QualityPreset = 'high' | 'balanced' | 'low'

export const STORAGE_KEY = 'intelidar.graphics'

export const PRESETS: Record<QualityPreset, GraphicsSettings> = {
  high: {
    pointCloud: true,
    shadows: true,
    glassBlur: true,
    beam: true,
    motion: true,
    fullResolution: true,
  },
  // Shadows and pixel ratio go first: both cost a lot and neither is the story.
  balanced: {
    pointCloud: true,
    shadows: false,
    glassBlur: true,
    beam: true,
    motion: true,
    fullResolution: false,
  },
  low: {
    pointCloud: false,
    shadows: false,
    glassBlur: false,
    beam: false,
    motion: false,
    fullResolution: false,
  },
}

/** One row per setting in the menu, in the order they are worth turning off. */
export const GRAPHICS_OPTIONS = [
  {
    key: 'shadows',
    label: 'Shadows',
    hint: 'Re-renders a 2048px shadow map every frame',
  },
  {
    key: 'pointCloud',
    label: 'Point cloud',
    hint: 'Thousands of blended LiDAR returns',
  },
  {
    key: 'beam',
    label: 'Sensor beam',
    hint: 'Layered glow planes and the floor pulse',
  },
  {
    key: 'glassBlur',
    label: 'Glass blur',
    hint: 'Re-blurs the scene behind every HUD panel',
  },
  {
    key: 'fullResolution',
    label: 'Full resolution',
    hint: 'A retina display draws about four times the pixels',
  },
  {
    key: 'motion',
    label: 'Animation',
    hint: 'Opening sweep, materialisation, panel motion',
  },
] as const satisfies readonly { key: keyof GraphicsSettings; label: string; hint: string }[]

const FIELDS = Object.keys(PRESETS.high) as (keyof GraphicsSettings)[]

/** Minimal slice of `Storage`, so this stays testable and never assumes a browser. */
export type SettingsStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function defaultSettings(prefersReducedMotion: boolean): GraphicsSettings {
  return { ...PRESETS.high, motion: !prefersReducedMotion }
}

/** Which preset these settings are, or `custom` if they are a hand-tuned mix. */
export function activePreset(settings: GraphicsSettings): QualityPreset | 'custom' {
  for (const [name, preset] of Object.entries(PRESETS) as [QualityPreset, GraphicsSettings][]) {
    if (FIELDS.every((field) => preset[field] === settings[field])) return name
  }
  return 'custom'
}

/** Device pixel ratio for the canvas: capped at 1 unless full resolution is on. */
export function dprFor(settings: GraphicsSettings): number | [number, number] {
  return settings.fullResolution ? [1, 2] : 1
}

/**
 * A saved choice always wins over the machine's reduced-motion preference:
 * someone who turned animation back on meant it.
 */
export function loadSettings(
  storage: SettingsStorage | null,
  prefersReducedMotion: boolean,
): GraphicsSettings {
  const fallback = defaultSettings(prefersReducedMotion)
  if (!storage) return fallback

  let raw: string | null = null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return fallback
  }
  if (!raw) return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fallback

  const saved = parsed as Record<string, unknown>
  const settings = { ...fallback }
  for (const field of FIELDS) {
    if (typeof saved[field] === 'boolean') settings[field] = saved[field]
  }
  return settings
}

export function saveSettings(storage: SettingsStorage | null, settings: GraphicsSettings): void {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // A private window or a full quota is not a reason to break the viewer.
  }
}
