import { Canvas, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Vector3 } from 'three'
import { askScene, ingestScene, reconstructScene } from './api/scene'
import { Hud } from './components/Hud'
import { ImportedRoomHud, ImportSetupHud, PlayHud, RoomActions } from './components/ExperienceHud'
import { ImportedRoomView } from './experience/ImportedRoomView'
import { usePlaySession } from './experience/usePlaySession'
import { useRoomImport } from './experience/useRoomImport'
import { PlayerMount } from './experience/PlayerMount'
import type { PlayerTelemetry } from './player/PlayerWorld'
import { reconcileToggles, type InteractionSnapshot } from './interaction/session'
import { interactionsForGraph } from './interaction/profiles'
import { demoEnvironment } from './room/demoEnvironment'
import { normalizeRoom } from './room/importRoom'
import type { NormalizedRoom } from './room/types'
import { AppearanceEditor } from './components/AppearanceEditor'
import { RenovationPanel } from './components/RenovationPanel'
import { addFurniture, removeFurniture, rotateFurniture, undoRenovation, type RenovationResult, type RenovationUndo } from './scene/renovation'
import { moveObject, updateAppearance } from './scene/editScene'
import { useScanProgress } from './scene/useScanProgress'
import { ViewerScene } from './scene/ViewerScene'
import { SCAN_DURATION_MS } from './scene/scanReveal'
import { isMeasured } from './scene/roomScale'
import { dprFor } from './settings/graphics'
import { useGraphics } from './settings/useGraphics'
import type { AnalysisStep, SceneGraph, SceneMode, Vec3 } from './scene/types'

declare global {
  interface Window {
    __intelidarPlay?: PlayerTelemetry & { source: 'demo' | 'glb' }
    __intelidarScene?: { graph: SceneGraph | null; project: (point: Vec3) => { x: number; y: number } }
  }
}

const instrumented = import.meta.env.DEV || import.meta.env.VITE_E2E === '1'

function SceneInspection({ graph }: { graph: SceneGraph | null }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    if (!instrumented) return
    window.__intelidarScene = { graph, project(point) {
      camera.updateMatrixWorld()
      const projected = new Vector3(...point).project(camera)
      const rect = gl.domElement.getBoundingClientRect()
      return { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2 }
    } }
    return () => { delete window.__intelidarScene }
  }, [camera, gl, graph])
  return null
}

export default function App() {
  const [mode, setMode] = useState<SceneMode>('raw')
  const [graph, setGraph] = useState<SceneGraph | null>(null)
  const [twinGraph, setTwinGraph] = useState<SceneGraph | null>(null)
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([])
  const [visibleStepCount, setVisibleStepCount] = useState(0)
  const [query, setQuery] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [highlightedIds, setHighlightedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [assetsReady, setAssetsReady] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const play = usePlaySession()
  const [interaction, setInteraction] = useState<InteractionSnapshot | null>(null)
  const [interactionRequest, setInteractionRequest] = useState(0)
  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  const onToggle = useCallback((id: string) => setToggles(current => ({ ...current, [id]: !current[id] })), [])
  const rooms = useRoomImport()
  const [unitScale, setUnitScale] = useState(1)
  const [floorPoint, setFloorPoint] = useState<Vec3 | null>(null)
  const [preparedRoom, setPreparedRoom] = useState<NormalizedRoom | null>(null)
  const [checkingSpawn, setCheckingSpawn] = useState(false)
  const [spawnMessage, setSpawnMessage] = useState<string | null>(null)
  const spawnRequest = useRef(0)
  const [renovating, setRenovating] = useState(false)
  const [renovationHistory, setRenovationHistory] = useState<RenovationUndo[]>([])
  const [renovationMessage, setRenovationMessage] = useState<string | null>(null)
  const imported = useRef(false)
  const sceneVersion = useRef(0)

  const [settings, setSettings] = useGraphics()

  const displayGraph = mode === 'twin' && twinGraph ? twinGraph : graph
  // Only a device capture skips the sweep. A simulated floor has no sensor either, says
  // so, and is worth watching resolve.
  const measured = isMeasured(displayGraph)
  const environment = useMemo(() => rooms.current?.environment ?? (displayGraph ? demoEnvironment(displayGraph) : null), [rooms.current, displayGraph])
  const importedView = rooms.candidate ?? rooms.current?.loaded ?? null
  const roomName = rooms.current?.loaded.name ?? displayGraph?.room.name ?? 'Meeting room'
  useEffect(() => {
    const definitions = displayGraph ? interactionsForGraph(displayGraph) : []
    setToggles(current => {
      const next = reconcileToggles(current, definitions)
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [displayGraph])
  // The sweep only starts once there is geometry for the sensor to find, and a
  // duration of 0 hands over a finished scan when animation is switched off. A new
  // room id is a new scan, so importing one sweeps it rather than inheriting the last.
  const { progress: scanProgress, skip: skipScan } = useScanProgress(
    graph !== null,
    settings.motion && !measured ? SCAN_DURATION_MS : 0,
    graph?.room.id,
  )
  const scanning = mode === 'raw' && graph !== null && scanProgress < 1

  useEffect(() => {
    let cancelled = false
    ingestScene()
      .then((scene) => {
        if (cancelled || imported.current) return
        setGraph(scene)
        setError(null)
      })
      .catch(() => {
        if (cancelled || imported.current) return
        setError('Backend unavailable. Start the API on port 8000.')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    spawnRequest.current++
    setFloorPoint(null)
    setPreparedRoom(null)
    setCheckingSpawn(false)
    setSpawnMessage(null)
    setUnitScale(1)
    return () => { spawnRequest.current++ }
  }, [rooms.candidate])

  useEffect(() => {
    if (!play.active) { delete window.__intelidarPlay; setInteraction(null) }
    return () => { delete window.__intelidarPlay }
  }, [play.active])

  const onTelemetry = useCallback((telemetry: PlayerTelemetry) => {
    if (instrumented) window.__intelidarPlay = { ...telemetry, source: rooms.current ? 'glb' : 'demo' }
  }, [rooms.current])

  const onPlayerError = useCallback((message: string) => {
    setPlayError(message)
    play.exit()
  }, [play.exit])

  function startPlay() {
    if (!environment || rooms.candidate) return
    setEditing(false)
    setDragging(false)
    setPlayError(null)
    setRenovating(false)
    play.start()
  }

  function importFile(file: File) {
    play.exit()
    setPlayError(null)
    setEditing(false)
    setDragging(false)
    setRenovating(false)
    void rooms.load(file)
  }

  function changeUnits(value: number) {
    spawnRequest.current++
    setUnitScale(value)
    setFloorPoint(null)
    setPreparedRoom(null)
    setCheckingSpawn(false)
    setSpawnMessage(null)
  }

  async function pickFloor(point: Vec3) {
    const candidate = rooms.candidate
    if (!candidate) return
    const ticket = ++spawnRequest.current
    setFloorPoint(point)
    setPreparedRoom(null)
    setCheckingSpawn(true)
    setSpawnMessage(null)
    try {
      const normalized = normalizeRoom(candidate, unitScale, point)
      const { validateEnvironmentSpawn } = await import('./player/physics')
      const check = await validateEnvironmentSpawn(normalized.environment)
      if (ticket !== spawnRequest.current) return
      if (check.valid) {
        setPreparedRoom(normalized)
        setSpawnMessage('Clear floor and headroom. Your character can start here.')
      } else setSpawnMessage(check.message ?? 'Choose another floor point with enough room for your character.')
    } catch (cause) {
      if (ticket === spawnRequest.current) setSpawnMessage(cause instanceof Error ? cause.message : 'Could not check this floor point.')
    } finally {
      if (ticket === spawnRequest.current) setCheckingSpawn(false)
    }
  }

  useEffect(() => {
    if (mode !== 'analysing' || analysisSteps.length === 0) return

    setVisibleStepCount(0)
    let completionTimer: number | undefined
    const timers = analysisSteps.map((_, index) =>
      window.setTimeout(() => {
        setVisibleStepCount(index + 1)
        if (index === analysisSteps.length - 1) {
          completionTimer = window.setTimeout(() => setMode('twin'), 700)
        }
      }, 380 * (index + 1)),
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      window.clearTimeout(completionTimer)
    }
  }, [mode, analysisSteps])

  useEffect(() => {
    if (mode === 'analysing' || scanning || !editing) {
      setDragging(false)
      document.body.style.cursor = 'auto'
    }
    if (mode === 'analysing' || scanning) setEditing(false)
  }, [mode, editing, scanning])

  function onMoveObject(id: string, position: Vec3) {
    if (mode === 'twin') {
      setTwinGraph((current) => (current ? moveObject(current, id, position) : current))
      return
    }
    setGraph((current) => (current ? moveObject(current, id, position) : current))
  }

  function onSelectObject(id: string) {
    setHighlightedIds((current) =>
      current.length === 1 && current[0] === id ? [] : [id],
    )
  }

  function onImportCapture(scene: SceneGraph) {
    // A measured scan is already understood, so it opens as a twin. A simulated one
    // arrives as raw geometry and earns its labels from AI Reconstruct, like the demo.
    const opensAsTwin = isMeasured(scene)
    play.exit()
    setToggles({})
    setInteraction(null)
    setPlayError(null)
    sceneVersion.current += 1
    imported.current = true
    setGraph(scene)
    setTwinGraph(opensAsTwin ? scene : null)
    setMode(opensAsTwin ? 'twin' : 'raw')
    setAnalysisSteps([])
    setReply(null)
    setQuery('')
    setHighlightedIds([])
    setEditing(false)
    setRenovating(false)
    setRenovationHistory([])
    setRenovationMessage(null)
    setDragging(false)
    setError(null)
    if (opensAsTwin) skipScan()
  }

  function applyRenovation(change: () => RenovationResult) {
    try {
      const result = change()
      sceneVersion.current += 1
      setTwinGraph(result.graph)
      setRenovationHistory((history) => [...history, result.undo].slice(-30))
      setHighlightedIds(result.selectedId ? [result.selectedId] : [])
      setReply(null)
      setDragging(false)
      setRenovationMessage(result.undo.kind === 'add' ? 'Furniture added. Drag it to adjust its position.' : 'Furniture removed. Undo is available.')
    } catch (cause) { setRenovationMessage(cause instanceof Error ? cause.message : 'Could not update this layout.') }
  }

  function onUndoRenovation() {
    const action = renovationHistory.at(-1)
    if (!twinGraph || !action) return
    sceneVersion.current += 1
    setTwinGraph(undoRenovation(twinGraph, action))
    setRenovationHistory((history) => history.slice(0, -1))
    setHighlightedIds(action.kind === 'remove' ? [action.object.id] : [])
    setDragging(false)
    setReply(null)
    setRenovationMessage('Last renovation undone.')
  }

  async function onReconstruct() {
    if (!graph) return
    const version = sceneVersion.current
    setError(null)
    try {
      const result = await reconstructScene(graph)
      if (version !== sceneVersion.current) return
      setTwinGraph(result.graph)
      setAnalysisSteps(result.analysisSteps)
      setMode('analysing')
    } catch {
      if (version !== sceneVersion.current) return
      setError('Reconstruct failed. Is the backend running?')
    }
  }

  async function ask(question: string) {
    const version = sceneVersion.current
    const scene = twinGraph
    if (mode !== 'twin' || !scene || question.trim().length === 0) return
    setQuery(question)
    try {
      const result = await askScene(scene, question)
      if (version !== sceneVersion.current) return
      setReply(result.reply)
      setHighlightedIds(result.highlightIds)
      setError(null)
    } catch {
      if (version !== sceneVersion.current) return
      setError('Ask failed. Is the backend running?')
    }
  }

  function handleAsk(event: FormEvent) {
    event.preventDefault()
    void ask(query)
  }

  return (
    <div
      className="app"
      data-glass={settings.glassBlur ? 'on' : 'off'}
      data-motion={settings.motion ? 'on' : 'off'}
      data-experience={play.active ? 'play' : rooms.candidate ? 'setup' : 'inspect'}
      data-room-source={importedView ? 'glb' : 'demo'}
      data-source={displayGraph?.source ?? 'demo'}
    >
      <Canvas
        shadows="percentage"
        dpr={dprFor(settings)}
        camera={{ position: [6.4, 4.2, 6.8], fov: 42 }}
        gl={{ antialias: true, localClippingEnabled: true }}
      >
        {importedView ? <ImportedRoomView
          key={importedView.id}
          room={importedView}
          scale={rooms.candidate ? unitScale : rooms.current!.scale}
          position={rooms.candidate ? [0, 0, 0] : rooms.current!.position}
          selecting={rooms.candidate !== null}
          playing={play.active}
          marker={floorPoint ? { point: floorPoint, valid: preparedRoom !== null } : null}
          onPick={point => { void pickFloor(point) }}
          settings={settings}
        /> : <ViewerScene
          key={displayGraph?.room.id ?? 'empty'}
          mode={mode}
          graph={displayGraph}
          scanProgress={measured ? 1 : scanProgress}
          settings={settings}
          highlightedIds={highlightedIds}
          editing={editing}
          dragging={dragging}
          onDraggingChange={setDragging}
          onMoveObject={onMoveObject}
          onSelectObject={(id) => setHighlightedIds([id])}
          gameplayActive={play.active}
          interactionTargetId={play.active ? interaction?.targetId : null}
          toggles={toggles}
          onAssetsReady={setAssetsReady}
        />}
        {play.active && environment && <PlayerMount
          environment={environment}
          paused={play.paused}
          resetToken={play.resetToken}
          settings={settings}
          onReady={play.markReady}
          onError={onPlayerError}
          allowSpawnSearch={!rooms.current}
          onTelemetry={onTelemetry}
          interactionRequest={interactionRequest}
          onInteractionChange={setInteraction}
          toggles={toggles}
          onToggle={onToggle}
        />}
        <SceneInspection graph={importedView ? null : displayGraph} />
      </Canvas>
      {play.active ? <PlayHud name={roomName} ready={play.ready} paused={play.paused}
        onExit={play.exit} onReset={play.reset} onResume={play.resume} settings={settings} onSettingsChange={setSettings}
        interaction={interaction?.label ? interaction : null} onInteract={() => setInteractionRequest(value => value + 1)}
      /> : rooms.candidate ? <ImportSetupHud
        name={rooms.candidate.name}
        dimensions={rooms.candidate.bounds.max.map((value, index) => value - rooms.candidate!.bounds.min[index]) as Vec3}
        scale={unitScale} onScale={changeUnits} validating={checkingSpawn} valid={preparedRoom !== null}
        message={spawnMessage} onCommit={() => { if (preparedRoom) rooms.commit(preparedRoom) }}
        onCancel={() => { spawnRequest.current++; rooms.cancel() }} settings={settings} onSettingsChange={setSettings}
      /> : rooms.current ? <ImportedRoomHud
        name={rooms.current.loaded.name} canPlay loading={rooms.loading} onPlay={startPlay} onImport={importFile}
        onBackDemo={rooms.backToDemo} settings={settings} onSettingsChange={setSettings}
      /> : <Hud
        experienceActions={<RoomActions canPlay={mode === 'twin' && assetsReady} loading={rooms.loading} onPlay={startPlay} onImport={importFile} />}
        mode={mode}
        graph={displayGraph}
        scanProgress={scanProgress}
        settings={settings}
        query={query}
        reply={reply}
        error={error}
        editing={editing}
        highlightedIds={highlightedIds}
        analysisSteps={analysisSteps}
        visibleStepCount={visibleStepCount}
        onToggleEdit={() => { setEditing((current) => renovating ? true : !current); setRenovating(false) }}
        onQueryChange={setQuery}
        onAsk={handleAsk}
        onAskSuggestion={(value) => {
          void ask(value)
        }}
        onReconstruct={() => {
          void onReconstruct()
        }}
        onSkipScan={skipScan}
        onSelectObject={onSelectObject}
        onSettingsChange={setSettings}
        onImportCapture={onImportCapture}
        renovating={renovating}
        onToggleRenovation={() => { setRenovating((current) => !current); setEditing(true) }}
      />}
      {!play.active && !importedView && editing && !renovating && mode === 'twin' && twinGraph && (
        <AppearanceEditor graph={twinGraph} selectedIds={highlightedIds} onSelect={onSelectObject}
          onChange={(id, patch) => setTwinGraph((current) => current ? updateAppearance(current, id, patch) : current)} />
      )}
      {!play.active && !importedView && renovating && mode === 'twin' && twinGraph && <RenovationPanel graph={twinGraph} selectedIds={highlightedIds}
        canUndo={renovationHistory.length > 0} message={renovationMessage} onSelect={(id) => setHighlightedIds([id])}
        onAdd={(assetId, height) => applyRenovation(() => addFurniture(twinGraph, assetId, `renovation:${crypto.getRandomValues(new Uint32Array(4)).join('-')}`, height))}
        onRemove={(id) => applyRenovation(() => removeFurniture(twinGraph, id))} onUndo={onUndoRenovation}
        onRotate={(id) => {
          try { setTwinGraph(rotateFurniture(twinGraph, id)); setRenovationMessage('Furniture rotated. Drag it to adjust its position.') }
          catch (cause) { setRenovationMessage(cause instanceof Error ? cause.message : 'Could not rotate furniture.') }
        }}
        onAppearance={() => setRenovating(false)} />}
      {rooms.loading && <div className="import-loading glass" role="status">
        <span>Reading room geometry…</span><button className="chip" type="button" onClick={rooms.cancel}>Cancel loading</button>
      </div>}
      {(rooms.error || playError) && <div className="experience-error glass" role="alert">{rooms.error || playError}</div>}
    </div>
  )
}
