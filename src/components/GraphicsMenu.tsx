import { useEffect, useRef, useState } from 'react'
import {
  GRAPHICS_OPTIONS,
  PRESETS,
  activePreset,
  type GraphicsSettings,
  type QualityPreset,
} from '../settings/graphics'
import { useSpecular } from './useSpecular'

const PRESET_ORDER: QualityPreset[] = ['high', 'balanced', 'low']

const PRESET_LABELS: Record<QualityPreset, string> = {
  high: 'High',
  balanced: 'Balanced',
  low: 'Low',
}

type GraphicsMenuProps = {
  settings: GraphicsSettings
  onChange: (settings: GraphicsSettings) => void
}

/**
 * Somewhere to turn the expensive parts off.
 *
 * Everything in here costs frames and none of it carries meaning, so a machine
 * that is struggling can drop the lot and still scan, reconstruct, and ask.
 */
export function GraphicsMenu({ settings, onChange }: GraphicsMenuProps) {
  const [open, setOpen] = useState(false)
  const specular = useSpecular<HTMLDivElement>()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const current = activePreset(settings)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && root.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div className="graphics" ref={root}>
      {/* Named by aria-label, not by its text: narrow screens keep only the gear. */}
      <button
        ref={trigger}
        type="button"
        className={`chip graphics-trigger ${open ? 'on' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Graphics"
        onClick={() => setOpen((was) => !was)}
      >
        <GearIcon />
        <span className="graphics-trigger-text">Graphics</span>
      </button>

      {open && (
        <div className="graphics-panel glass" role="dialog" aria-label="Graphics" {...specular}>
          <p className="panel-kicker">Quality</p>
          <div className="preset-row">
            {PRESET_ORDER.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`preset ${current === preset ? 'on' : ''}`}
                aria-pressed={current === preset}
                onClick={() => onChange(PRESETS[preset])}
              >
                {PRESET_LABELS[preset]}
              </button>
            ))}
          </div>

          <ul className="graphics-list">
            {GRAPHICS_OPTIONS.map((option) => (
              <li key={option.key}>
                <button
                  type="button"
                  className="graphics-row"
                  role="switch"
                  aria-checked={settings[option.key]}
                  onClick={() => onChange({ ...settings, [option.key]: !settings[option.key] })}
                >
                  <span className="graphics-text">
                    <span className="graphics-label">{option.label}</span>
                    <span className="graphics-hint">{option.hint}</span>
                  </span>
                  <span className="track" aria-hidden="true">
                    <span className="knob" />
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="graphics-foot">Saved on this device. Nothing here changes the scene data.</p>
        </div>
      )}
    </div>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm0 4.3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
      />
      <path
        fill="currentColor"
        d="m14 9.1-.1-1.1.1-1.1a.5.5 0 0 0-.3-.5l-1.2-.5-.5-1.2a.5.5 0 0 0-.5-.3l-1.3.1-1-.8a.5.5 0 0 0-.6 0l-1 .8-1.3-.1a.5.5 0 0 0-.5.3l-.5 1.2-1.2.5a.5.5 0 0 0-.3.5l.1 1.1-.1 1.1a.5.5 0 0 0 .3.5l1.2.5.5 1.2c.1.2.3.3.5.3l1.3-.1 1 .8c.2.2.4.2.6 0l1-.8 1.3.1c.2 0 .4-.1.5-.3l.5-1.2 1.2-.5a.5.5 0 0 0 .3-.5Zm-1.3-.1.1.8-.9.4a.5.5 0 0 0-.3.3l-.4.9-.9-.1a.5.5 0 0 0-.4.1l-.9.6-.9-.6a.5.5 0 0 0-.4-.1l-.9.1-.4-.9a.5.5 0 0 0-.3-.3l-.9-.4.1-.8-.1-.8.9-.4a.5.5 0 0 0 .3-.3l.4-.9.9.1c.2 0 .3 0 .4-.1l.9-.6.9.6c.1.1.2.1.4.1l.9-.1.4.9c.1.2.2.3.3.3l.9.4Z"
      />
    </svg>
  )
}
