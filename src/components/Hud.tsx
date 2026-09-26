import type { FormEvent, ReactNode } from 'react'
import type { AnalysisStep, SceneGraph, SceneMode, SceneObject } from '../scene/types'
import { capturedPoints, revealedObjects } from '../scene/scanReveal'
import type { GraphicsSettings } from '../settings/graphics'
import { GraphicsMenu } from './GraphicsMenu'
import { CaptureImport } from './CaptureImport'
import { ExportPanel } from './ExportPanel'
import { useSpecular } from './useSpecular'
import { ReadAloud } from './ReadAloud'
import { AgentBriefing } from './AgentBriefing'

type HudProps = {
  experienceActions?: ReactNode
  mode: SceneMode
  graph: SceneGraph | null
  scanProgress: number
  query: string
  reply: string | null
  error: string | null
  editing: boolean
  highlightedIds: string[]
  settings: GraphicsSettings
  analysisSteps: AnalysisStep[]
  visibleStepCount: number
  onToggleEdit: () => void
  onQueryChange: (value: string) => void
  onAsk: (event: FormEvent) => void
  onAskSuggestion: (value: string) => void
  onReconstruct: () => void
  onSkipScan: () => void
  onSelectObject: (id: string) => void
  onSettingsChange: (settings: GraphicsSettings) => void
  onImportCapture?: (graph: SceneGraph) => void
  renovating?: boolean
  onToggleRenovation?: () => void
}

const SUGGESTIONS = [
  'Which items are critical stock?',
  'Where is the rice shelf?',
  'Show me low stock items',
]

/** How each scan describes its own provenance. A simulated floor never borrows the device's. */
const PROVENANCE: Record<string, { tag: string; source: string }> = {
  roomplan: { tag: 'iPhone LiDAR · RoomPlan', source: 'iPhone LiDAR · RoomPlan' },
  simulated: { tag: 'Simulated LiDAR · no device', source: 'Simulated scan · no device' },
}

const DEMO_PROVENANCE = { tag: 'Scan reality. AI understands it.', source: 'Demo · no scanner connected' }

/**
 * What a row reads before the reconstructor has named it.
 *
 * An imported scan may already carry labels, but the raw mesh is the state
 * *before* AI understood it: showing those names here would give the answer away
 * and contradict the viewer, which labels nothing until the twin.
 */
function rawLabel(object: SceneObject): string {
  return object.category === 'opening' ? 'Unknown opening' : 'Unknown object'
}

export function Hud({
  experienceActions,
  mode,
  graph,
  scanProgress,
  query,
  reply,
  error,
  editing,
  highlightedIds,
  settings,
  analysisSteps,
  visibleStepCount,
  onToggleEdit,
  onQueryChange,
  onAsk,
  onAskSuggestion,
  onReconstruct,
  onSkipScan,
  onSelectObject,
  onSettingsChange,
  onImportCapture,
  renovating,
  onToggleRenovation,
}: HudProps) {
  const specular = useSpecular()
  const reconstructed = mode === 'twin'
  const scanning = mode === 'raw' && graph !== null && scanProgress < 1
  const room = graph?.room
  const objects = graph?.objects ?? []
  const detected = reconstructed ? objects : revealedObjects(graph, scanProgress)
  const found = new Set(detected.map((object) => object.id))
  const provenance = graph?.room.id === 'photo-cafe-8179'
    ? { tag: 'A room from a photograph.', source: 'Photo demo · estimated dimensions' }
    : (graph?.source && PROVENANCE[graph.source]) || DEMO_PROVENANCE

  return (
    <div className="hud">
      <div className="scrim" aria-hidden="true" />

      <header className="topbar glass" {...specular}>
        <div className="brand">
          <span className={`mark ${scanning ? 'sweeping' : ''}`} aria-hidden="true" />
          <div>
            <p className="name">ReadyStock AI</p>
            <p className="tag">{provenance.tag}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <AgentBriefing />
          {experienceActions}
          {onImportCapture && <CaptureImport onImport={onImportCapture} disabled={mode === 'analysing'} />}
          <ExportPanel graph={graph} disabled={mode === 'analysing'} />
          {onToggleRenovation && <button type="button" className={`chip ${renovating ? 'on' : ''}`} aria-pressed={Boolean(renovating)} disabled={!reconstructed} onClick={onToggleRenovation}>Renovate</button>}
          <button
            type="button"
            className={`chip edit-toggle ${editing ? 'on' : ''}`}
            aria-pressed={editing}
            disabled={!graph || scanning || mode === 'analysing'}
            onClick={onToggleEdit}
          >
            {editing ? 'Editing' : 'Edit'}
          </button>
          <div
            className={`chip status status-${statusTone(mode, scanning)}`}
            aria-live="polite"
          >
            <span className="status-dot" />
            {scanning && 'Demo playback'}
            {!scanning && mode === 'raw' && 'Raw mesh'}
            {mode === 'analysing' && 'Analysing scene'}
            {mode === 'twin' && 'Semantic twin'}
          </div>
          <GraphicsMenu settings={settings} onChange={onSettingsChange} />
        </div>
      </header>

      <aside className="panel panel-left glass" {...specular}>
        <p className="panel-kicker">Scene</p>
        <h2>{reconstructed ? (room?.name ?? 'Meeting room') : scanning ? 'Scanning' : 'Unlabelled scan'}</h2>
        {editing && (
          <p className="edit-hint">Drag tables, chairs, and equipment. Doors and windows stay fixed.</p>
        )}
        <dl className="meta">
          <div>
            <dt>Size</dt>
            <dd>{room ? `${room.width} × ${room.depth} × ${room.height} m` : '—'}</dd>
          </div>
          <div>
            <dt>Objects</dt>
            <dd>{graph ? detected.length : '—'}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{provenance.source}</dd>
          </div>
        </dl>

        <ul className="object-list">
          {objects.map((object) =>
            found.has(object.id) ? (
              <ObjectRow
                key={object.id}
                object={object}
                reconstructed={reconstructed}
                highlighted={highlightedIds.includes(object.id)}
                onSelect={onSelectObject}
              />
            ) : (
              // A volume the sweep has not reached: held open so the list never jumps.
              <li key={object.id} className="ghost" aria-hidden="true" />
            ),
          )}
        </ul>
      </aside>

      {mode !== 'twin' && (
        <div className="stage">
          {scanning && (
            <CaptureReadout
              progress={scanProgress}
              detected={detected.length}
              onSkip={onSkipScan}
            />
          )}
          {!scanning && mode === 'raw' && (
            <GlassButton className="reconstruct" disabled={!graph} onClick={onReconstruct}>
              <span className="spark" aria-hidden="true">
                ✨
              </span>
              AI Reconstruct
            </GlassButton>
          )}
          {mode === 'analysing' && (
            <div className="analysis glass" role="status" {...specular}>
              <p className="panel-kicker">Computer vision</p>
              <ol>
                {analysisSteps.slice(0, visibleStepCount).map((step) => (
                  <li key={`${step.from}-${step.to}`}>
                    <span>{step.from}</span>
                    <span className="arrow" aria-hidden="true">
                      →
                    </span>
                    <strong>{step.to}</strong>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      <form className="ask glass" onSubmit={onAsk} {...specular}>
        <label htmlFor="ask-input">Ask the spatial assistant</label>
        <div className="ask-row">
          <input
            id="ask-input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={
              reconstructed ? 'Show me all the chairs.' : 'Reconstruct the scene to ask questions'
            }
            disabled={!reconstructed}
            autoComplete="off"
          />
          <button type="submit" disabled={!reconstructed || query.trim().length === 0}>
            Ask
          </button>
        </div>
        {reconstructed && (
          <div className="suggestions">
            {SUGGESTIONS.map((item) => (
              <button key={item} type="button" onClick={() => onAskSuggestion(item)}>
                {item}
              </button>
            ))}
          </div>
        )}
        {reply && (
          <p className="reply" aria-live="polite">
            {reply}
          </p>
        )}
        {reply?.trim() && <ReadAloud key={reply} text={reply} />}
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}

function statusTone(mode: SceneMode, scanning: boolean): string {
  if (scanning) return 'scan'
  if (mode === 'analysing') return 'think'
  return mode === 'twin' ? 'twin' : 'raw'
}

function ObjectRow({
  object,
  reconstructed,
  highlighted,
  onSelect,
}: {
  object: SceneObject
  reconstructed: boolean
  highlighted: boolean
  onSelect: (id: string) => void
}) {
  const confidence = reconstructed && object.confidence ? Math.round(object.confidence * 100) : null

  return (
    <li className={reconstructed ? 'known' : 'unknown'}>
      <button
        type="button"
        className={`object-row ${highlighted ? 'hot' : ''}`}
        aria-pressed={highlighted}
        onClick={() => onSelect(object.id)}
      >
        <span className="obj-type">{reconstructed ? object.type : 'unknown'}</span>
        <span className="obj-label">{reconstructed ? object.label : rawLabel(object)}</span>
        {confidence !== null && <span className="obj-confidence">{confidence}%</span>}
      </button>
    </li>
  )
}

function CaptureReadout({
  progress,
  detected,
  onSkip,
}: {
  progress: number
  detected: number
  onSkip: () => void
}) {
  const specular = useSpecular<HTMLDivElement>()
  const percent = Math.round(progress * 100)

  return (
    <div className="capture glass" {...specular}>
      <div className="capture-head">
        <p className="panel-kicker">Demo scan · no device connected</p>
        <p className="capture-percent">{percent}%</p>
      </div>
      <div
        className="capture-track"
        role="progressbar"
          aria-label="Demo playback progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="capture-fill" style={{ width: `${percent}%` }}>
          <span className="capture-head-glow" />
        </div>
      </div>
      <div className="capture-foot">
        <p>
          <strong>{capturedPoints(progress).toLocaleString('en-US')}</strong> simulated returns ·{' '}
          <strong>{detected}</strong> volumes found
        </p>
        <button type="button" className="skip" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  )
}

function GlassButton({
  className,
  disabled,
  onClick,
  children,
}: {
  className: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const specular = useSpecular<HTMLButtonElement>()
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick} {...specular}>
      {children}
    </button>
  )
}
