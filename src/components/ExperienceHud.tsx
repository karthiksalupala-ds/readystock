import { useId, useRef, type ReactNode } from 'react'
import { GraphicsMenu } from './GraphicsMenu'
import { AgentBriefing } from './AgentBriefing'
import type { GraphicsSettings } from '../settings/graphics'
import type { Vec3 } from '../scene/types'

type GraphicsProps = { settings: GraphicsSettings; onSettingsChange: (settings: GraphicsSettings) => void }

export function RoomActions({ canPlay, loading, onPlay, onImport }: {
  canPlay: boolean; loading: boolean; onPlay: () => void; onImport: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  return <>
    <label htmlFor={id} className="visually-hidden">Import room file</label>
    <input ref={input} id={id} className="visually-hidden" type="file" accept=".glb" onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) onImport(file)
    }} />
    <button type="button" className="chip" disabled={loading} onClick={() => input.current?.click()}>
      {loading ? 'Loading room…' : 'Import room'}
    </button>
    <button type="button" className="chip play-button" disabled={!canPlay || loading} onClick={onPlay}>Play</button>
  </>
}

function ExperienceBar({ name, children }: { name: string; children: ReactNode }) {
  return <header className="topbar glass experience-topbar">
    <div className="brand"><span className="mark" aria-hidden="true" /><div>
      <p className="name">ReadyStock AI</p><p className="tag room-name">{name}</p>
    </div></div>
    <div className="topbar-actions"><AgentBriefing />{children}</div>
  </header>
}

export function PlayHud({ ready, paused, name, onExit, onReset, onResume, settings, onSettingsChange,
  interaction, onInteract }: GraphicsProps & {
  ready: boolean; paused: boolean; name: string; onExit: () => void; onReset: () => void; onResume: () => void;
  interaction?: { label: string; available: boolean; reason?: string } | null; onInteract?: () => void
}) {
  const reasonId = useId()
  return <div className="hud experience-hud">
    <ExperienceBar name={name}>
      <button className="chip" type="button" disabled={!ready} onClick={onReset}>Reset position</button>
      <GraphicsMenu settings={settings} onChange={onSettingsChange} />
      <button className="chip" type="button" onClick={onExit}>Exit play</button>
    </ExperienceBar>
    {(!ready || paused) && <div className="play-status glass" role="status">
      <h2>{!ready ? 'Preparing your character' : 'Paused'}</h2>
      <p>{!ready ? 'Loading the avatar and checking a clear starting position.' : 'Your room is ready when you are.'}</p>
      {ready && <button className="chip play-button" type="button" onClick={onResume}>Resume</button>}
    </div>}
    <div className="play-bottom">
      {ready && !paused && interaction && <div className="play-interaction glass">
        <button type="button" className="interaction-action" onClick={onInteract}
          disabled={!interaction.available || !onInteract} aria-keyshortcuts="E"
          aria-describedby={interaction.reason ? reasonId : undefined}>
          <kbd aria-hidden="true">E</kbd><span>{interaction.label}</span>
        </button>
        {interaction.reason && <p id={reasonId} role="status">{interaction.reason}</p>}
      </div>}
      <div className="play-help glass" aria-label="Desktop controls">
        <span><kbd>WASD</kbd> / arrows <span className="control-label">Move</span></span>
        <span><kbd>Shift</kbd> <span className="control-label">Run</span></span>
        <span>Mouse drag <span className="control-label">Look</span></span>
        <span><kbd>E</kbd> <span className="control-label">Interact</span></span>
        <span><kbd>Esc</kbd> <span className="control-label">Exit</span></span>
      </div>
    </div>
  </div>
}

export function ImportSetupHud({ name, dimensions, scale, validating, valid, message,
  onScale, onCommit, onCancel, settings, onSettingsChange }: GraphicsProps & {
  name: string; dimensions: Vec3; scale: number; validating: boolean; valid: boolean;
  message: string | null; onScale: (scale: number) => void; onCommit: () => void; onCancel: () => void
}) {
  return <div className="hud experience-hud">
    <ExperienceBar name="Set up your room">
      <GraphicsMenu settings={settings} onChange={onSettingsChange} />
      <button className="chip" type="button" onClick={onCancel}>Cancel import</button>
    </ExperienceBar>
    <section className="room-setup glass" aria-labelledby="room-setup-title">
      <h2 id="room-setup-title">Choose where to start</h2>
      <p className="import-filename">{name}</p>
      <p>Check the scale, then click an open part of the floor. The cutaway view helps you see inside.</p>
      <label htmlFor="room-units">Model units</label>
      <select id="room-units" value={scale} onChange={event => onScale(Number(event.target.value))}>
        <option value="1">Meters</option><option value="0.01">Centimeters</option><option value="0.001">Millimeters</option>
      </select>
      <p className="room-dimensions">{dimensions.map(value => (value * scale).toFixed(2)).join(' × ')} m <span>(width × height × depth)</span></p>
      <p className={`spawn-feedback ${valid ? 'valid' : ''}`} role="status">
        {validating ? 'Checking floor and headroom…' : message ?? 'Click the floor to place your character.'}
      </p>
      <button className="chip play-button" type="button" disabled={!valid || validating} onClick={onCommit}>Open room</button>
      <p className="session-note">Kept for this session. Select the file again after refreshing.</p>
    </section>
    <div className="room-orbit-help glass">Drag to orbit · Scroll to zoom · Click floor to place</div>
  </div>
}

export function ImportedRoomHud({ name, canPlay, loading, onPlay, onImport, onBackDemo, settings, onSettingsChange }:
  GraphicsProps & { name: string; canPlay: boolean; loading: boolean; onPlay: () => void;
    onImport: (file: File) => void; onBackDemo: () => void }) {
  return <div className="hud experience-hud">
    <ExperienceBar name={name}>
      <button className="chip" type="button" onClick={onBackDemo}>Back to demo</button>
      <RoomActions canPlay={canPlay} loading={loading} onPlay={onPlay} onImport={onImport} />
      <GraphicsMenu settings={settings} onChange={onSettingsChange} />
    </ExperienceBar>
    <div className="room-orbit-help glass">Imported room · Drag to orbit · Scroll to zoom</div>
  </div>
}
