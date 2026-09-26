import { describe, expect, it, vi } from 'vitest'
import {
  GRAPHICS_OPTIONS,
  PRESETS,
  STORAGE_KEY,
  activePreset,
  defaultSettings,
  dprFor,
  loadSettings,
  saveSettings,
  type GraphicsSettings,
} from './graphics'

function storage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    read: () => data,
  }
}

describe('PRESETS', () => {
  it('runs everything on high and nothing on low', () => {
    expect(Object.values(PRESETS.high).every(Boolean)).toBe(true)
    expect(Object.values(PRESETS.low).some(Boolean)).toBe(false)
  })

  it('orders balanced between the two', () => {
    const cost = (settings: GraphicsSettings) => Object.values(settings).filter(Boolean).length
    expect(cost(PRESETS.high)).toBeGreaterThan(cost(PRESETS.balanced))
    expect(cost(PRESETS.balanced)).toBeGreaterThan(cost(PRESETS.low))
  })

  it('drops shadows before it drops the point cloud', () => {
    // Shadows re-render a 2048px map every frame; the cloud is the scan itself.
    expect(PRESETS.balanced.shadows).toBe(false)
    expect(PRESETS.balanced.pointCloud).toBe(true)
  })
})

describe('GRAPHICS_OPTIONS', () => {
  it('describes every setting exactly once', () => {
    const keys = GRAPHICS_OPTIONS.map((option) => option.key)
    expect([...keys].sort()).toEqual(Object.keys(PRESETS.high).sort())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives each row a label and a reason to turn it off', () => {
    for (const option of GRAPHICS_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.hint.length).toBeGreaterThan(0)
    }
  })
})

describe('activePreset', () => {
  it('names a preset the settings match', () => {
    expect(activePreset(PRESETS.high)).toBe('high')
    expect(activePreset(PRESETS.balanced)).toBe('balanced')
    expect(activePreset(PRESETS.low)).toBe('low')
  })

  it('calls a hand-tuned mix custom', () => {
    expect(activePreset({ ...PRESETS.high, shadows: false, motion: true })).toBe('custom')
  })
})

describe('defaultSettings', () => {
  it('shows the demo at its best by default', () => {
    expect(defaultSettings(false)).toEqual(PRESETS.high)
  })

  it('starts with animation off when the machine asks for reduced motion', () => {
    const settings = defaultSettings(true)
    expect(settings.motion).toBe(false)
    expect(settings.pointCloud).toBe(true)
  })
})

describe('dprFor', () => {
  it('caps the pixel ratio at 1 when full resolution is off', () => {
    expect(dprFor({ ...PRESETS.high, fullResolution: false })).toBe(1)
  })

  it('lets a retina display render at its own ratio otherwise', () => {
    expect(dprFor(PRESETS.high)).toEqual([1, 2])
  })
})

describe('loadSettings', () => {
  it('falls back to defaults with no storage at all', () => {
    expect(loadSettings(null, false)).toEqual(PRESETS.high)
  })

  it('returns what was saved', () => {
    const store = storage({ [STORAGE_KEY]: JSON.stringify(PRESETS.low) })
    expect(loadSettings(store, false)).toEqual(PRESETS.low)
  })

  it('prefers a saved choice over the reduced-motion default', () => {
    const store = storage({ [STORAGE_KEY]: JSON.stringify(PRESETS.high) })
    expect(loadSettings(store, true).motion).toBe(true)
  })

  it('fills gaps left by an older saved shape', () => {
    const store = storage({ [STORAGE_KEY]: JSON.stringify({ shadows: false }) })
    expect(loadSettings(store, false)).toEqual({ ...PRESETS.high, shadows: false })
  })

  it('ignores values that are not booleans', () => {
    const store = storage({ [STORAGE_KEY]: JSON.stringify({ shadows: 'no', beam: null }) })
    expect(loadSettings(store, false)).toEqual(PRESETS.high)
  })

  it('survives corrupt or non-object JSON', () => {
    expect(loadSettings(storage({ [STORAGE_KEY]: 'not json' }), false)).toEqual(PRESETS.high)
    expect(loadSettings(storage({ [STORAGE_KEY]: '[1,2]' }), false)).toEqual(PRESETS.high)
    expect(loadSettings(storage({ [STORAGE_KEY]: 'null' }), false)).toEqual(PRESETS.high)
  })

  it('survives storage that throws, as it does in a locked-down browser', () => {
    const thrower = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {},
    }
    expect(loadSettings(thrower, true)).toEqual(defaultSettings(true))
  })
})

describe('saveSettings', () => {
  it('round-trips through storage', () => {
    const store = storage()
    saveSettings(store, PRESETS.balanced)
    expect(loadSettings(store, false)).toEqual(PRESETS.balanced)
  })

  it('never throws when storage refuses to write', () => {
    const thrower = { getItem: () => null, setItem: vi.fn(() => { throw new Error('quota') }) }
    expect(() => saveSettings(thrower, PRESETS.low)).not.toThrow()
    expect(thrower.setItem).toHaveBeenCalled()
  })
})
