import { Edges, Html, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
  Plane,
  Vector2,
  Vector3,
  type GridHelper,
  type Group,
  type LineBasicMaterial,
  type Mesh,
  type PointLight,
} from 'three'
import { canDragObject } from './editScene'
import { preloadCatalogModels } from './catalogModel'
import { ceilingLights, isMeasured, needsFraming, shadowExtent, showsLabel } from './roomScale'
import { usesDemoFurniture } from '../assets/catalog'
import { fitFurniture, updateFurnitureMaterials } from '../assets/furniture'
import { useFurniture } from '../assets/useFurniture'
import { FurnitureModel } from './FurnitureModel'
import { ScanPoints } from './ScanPoints'
import { SensorBeacon } from './SensorBeacon'
import { approach, createScanAnim, type ScanAnim } from './scanAnim'
import { buildObjectCloud, buildRoomCloud } from './scanCloud'
import {
  TWIN_DURATION_MS,
  materialiseWindow,
  revealAmount,
  scanSchedule,
  sensorOrigin,
  type RevealWindow,
} from './scanReveal'
import type { GraphicsSettings } from '../settings/graphics'
import type { SceneGraph, SceneMode, SceneObject, SceneRoom, Vec3 } from './types'
import { interactionsForGraph } from '../interaction/profiles'
import { applyObjectPower, nearestEnabledLamps } from './furnitureEffects'
import { furnitureAssetsReady, furnitureLoadKey } from './furnitureReadiness'

const FALLBACK_ROOM: SceneRoom = {
  id: 'room-1',
  name: 'meeting room',
  width: 7.4,
  depth: 5.2,
  height: 2.8,
  units: 'm',
}

const ACCENT = '#3ee0c2'
const EMPTY_TOGGLES: Readonly<Record<string, boolean>> = {}
/** Objects with no scan window of their own are simply there. */
const WHOLE_WINDOW: RevealWindow = { start: 0, end: 0.0001 }

const floorHit = new Vector3()
const floorNdc = new Vector2()
const floorPlane = new Plane(new Vector3(0, 1, 0), 0)

type ViewerSceneProps = {
  mode: SceneMode
  graph: SceneGraph | null
  scanProgress: number
  settings: GraphicsSettings
  highlightedIds: string[]
  interactionTargetId?: string | null
  toggles?: Readonly<Record<string, boolean>>
  editing: boolean
  dragging: boolean
  onDraggingChange: (dragging: boolean) => void
  onMoveObject: (id: string, position: Vec3) => void
  gameplayActive?: boolean
  onAssetsReady?: (ready: boolean) => void
  onSelectObject: (id: string) => void
}

export function ViewerScene({
  mode,
  graph,
  scanProgress,
  settings,
  highlightedIds,
  interactionTargetId = null,
  toggles = EMPTY_TOGGLES,
  editing,
  dragging,
  onDraggingChange,
  onMoveObject,
  gameplayActive = false,
  onAssetsReady,
  onSelectObject,
}: ViewerSceneProps) {
  const reconstructed = mode === 'twin'
  // A measured scan had no beam in the room; a simulated one is honest about having none either.
  const measured = isMeasured(graph)
  const framed = needsFraming(graph)
  const sceneSettings = useMemo(() => measured ? { ...settings, pointCloud: false, beam: false } : settings, [settings, measured])
  const room = graph?.room ?? FALLBACK_ROOM
  const { camera, size: viewport } = useThree()
  const roomSpan = Math.max(room.width, room.depth, room.height)
  useEffect(() => {
    if (!framed) return
    // Fit the whole room, including portrait Safari screens.
    const distance = Math.hypot(room.width, room.depth, room.height) * Math.max(1.3, viewport.height / viewport.width * 1.4)
    camera.position.set(distance * 0.65, distance * 0.5 + room.height * 0.35, distance * 0.7)
    camera.far = Math.max(100, distance * 5)
    camera.updateProjectionMatrix()
  }, [camera, framed, room.width, room.depth, room.height, viewport.width, viewport.height])
  const objects = useMemo(() => graph?.objects ?? [], [graph])
  const assetIds = useMemo(() => objects.flatMap((object) => object.assetId ?? []).join(','), [objects])
  useEffect(() => {
    if (assetIds) preloadCatalogModels(assetIds.split(','))
  }, [assetIds])
  const anim = useMemo(createScanAnim, [])
  const origin = useMemo(() => sensorOrigin(room), [room])
  const schedule = useMemo(() => (graph ? scanSchedule(graph) : null), [graph])
  const sweeping = mode === 'raw' && scanProgress < 1
  const [loadedAssets, setLoadedAssets] = useState<Record<string, boolean>>({})
  const onAssetReady = useCallback((key: string, ready: boolean) => {
    setLoadedAssets((previous) => previous[key] === ready ? previous : { ...previous, [key]: ready })
  }, [])
  const assetsReady = furnitureAssetsReady(objects, reconstructed, loadedAssets)
  useEffect(() => { onAssetsReady?.(assetsReady) }, [assetsReady, onAssetsReady])

  const palette = useMemo(
    () => ({ raw: new Color('#05070a'), twin: new Color('#0b1016'), current: new Color('#05070a') }),
    [],
  )

  const shadowReach = useMemo(() => shadowExtent(room), [room])
  const lamps = useMemo(() => ceilingLights(room), [room])

  const twinStart = useRef(-1)

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.1)
    const now = state.clock.elapsedTime
    anim.time = now

    // Track the HUD's sweep clock, but fast enough to catch up when it is skipped.
    anim.scan = approach(
      anim.scan,
      scanProgress,
      Math.max(1.6, Math.abs(scanProgress - anim.scan) * 6),
      step,
    )

    // Wall-clock, not accumulated deltas: a slow first frame must not stretch the
    // materialisation, and a stalled one must not leave it half applied.
    if (reconstructed) {
      if (twinStart.current < 0) twinStart.current = now
      const span = settings.motion ? TWIN_DURATION_MS / 1000 : 0
      anim.twin = span > 0 && !gameplayActive ? Math.min(1, (now - twinStart.current) / span) : 1
    } else {
      twinStart.current = -1
      anim.twin = 0
    }

    anim.think = approach(anim.think, mode === 'analysing' ? 1 : 0, 1.6, step)
    anim.cloud = 1 - anim.twin

    palette.current.copy(palette.raw).lerp(palette.twin, anim.twin)
    state.scene.background = palette.current
    if (state.scene.fog) state.scene.fog.color.copy(palette.current)
  }, -1)

  return (
    <>
      <fog attach="fog" args={['#05070a', framed ? roomSpan * 3 : 9, framed ? roomSpan * 8 : 26]} />

      <hemisphereLight
        args={[reconstructed ? '#e3ecff' : '#8f9aac', '#1a1f27', reconstructed ? 0.95 : 0.28]}
      />
      <directionalLight
        position={[4.5, 7, 3.5]}
        intensity={reconstructed ? 1.5 : 0.4}
        castShadow={settings.shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0002}
        shadow-normalBias={0.06}
        shadow-camera-left={-shadowReach}
        shadow-camera-right={shadowReach}
        shadow-camera-top={shadowReach}
        shadow-camera-bottom={-shadowReach}
        shadow-camera-near={0.5}
        shadow-camera-far={shadowReach * 4 + 12}
      />
      {reconstructed && <directionalLight position={[-5, 4, -4.5]} intensity={0.45} color="#cfe0ff" />}
      {reconstructed && graph && <InteractiveLampLights graph={graph} toggles={toggles} />}
      {reconstructed && (
        <>
          {lamps.map((lamp, index) => (
            <pointLight
              key={index}
              position={lamp.position}
              intensity={1.4}
              distance={lamp.distance}
              color="#ffe9c4"
            />
          ))}
          <pointLight
            position={[room.width / 2 - 0.4, 1.6, 0]}
            intensity={1.1}
            distance={Math.max(7, room.depth)}
            color="#a9d4ff"
          />
        </>
      )}

      <OrbitControls
        makeDefault
        enableDamping
        enabled={!dragging && !gameplayActive}
        autoRotate={sweeping && settings.motion && !dragging && !gameplayActive}
        autoRotateSpeed={0.45}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={3}
        maxDistance={framed ? roomSpan * 8 : 16}
        target={[0, framed ? room.height * 0.35 : 1, 0]}
      />

      <group>
        <RoomShell room={room} anim={anim} solo={!sceneSettings.pointCloud} gameplayActive={gameplayActive} />
        {!gameplayActive && graph && sceneSettings.pointCloud && <RoomCloud room={room} origin={origin} anim={anim} />}

        {objects.map((object, index) => (
          <SceneMesh
            key={object.id}
            object={object}
            origin={origin}
            anim={anim}
            window={schedule?.get(object.id) ?? WHOLE_WINDOW}
            materialise={materialiseWindow(index, objects.length)}
            settings={sceneSettings}
            reconstructed={reconstructed}
            highlighted={highlightedIds.includes(object.id)}
            targeted={gameplayActive && interactionTargetId === object.id}
            powered={Boolean(toggles[object.id])}
            labelled={!gameplayActive && showsLabel({ total: objects.length, highlighted: highlightedIds.includes(object.id) })}
            editing={editing && !gameplayActive}
            gameplayActive={gameplayActive}
            onAssetReady={onAssetReady}
            onDraggingChange={onDraggingChange}
            onMoveObject={onMoveObject}
            onSelectObject={onSelectObject}
          />
        ))}

        {!gameplayActive && !measured && <SensorBeacon room={room} anim={anim} beam={settings.beam} />}
        {!gameplayActive && <FloorGrid room={room} anim={anim} />}
      </group>
    </>
  )
}

/** Keep four GPU light slots stable; moving the camera never schedules a React render. */
function InteractiveLampLights({ graph, toggles }: { graph: SceneGraph; toggles: Readonly<Record<string, boolean>> }) {
  const definitions = useMemo(() => interactionsForGraph(graph), [graph])
  const lights = useRef<(PointLight | null)[]>([])
  useFrame(({ camera }) => {
    const nearest = nearestEnabledLamps(definitions, toggles, camera.position.toArray())
    lights.current.forEach((light, index) => {
      if (!light) return
      const lamp = nearest[index]
      light.intensity = lamp ? 3.5 : 0
      if (lamp) light.position.set(...(lamp.lightPosition ?? lamp.point))
    })
  })
  return <>{[0, 1, 2, 3].map((index) => <pointLight key={index} ref={(light) => { lights.current[index] = light }} color="#ffd7a2" intensity={0} distance={4.5} decay={2} castShadow={false} />)}</>
}

function RoomCloud({ room, origin, anim }: { room: SceneRoom; origin: Vec3; anim: ScanAnim }) {
  const cloud = useMemo(() => buildRoomCloud(room, origin), [room, origin])
  return <ScanPoints cloud={cloud} anim={anim} size={0.05} hot="#9ef7e5" cool="#2b6e80" />
}

/**
 * Two shells in the same place: the wireframe the sensor measured, and the
 * surfaced room the reconstructor infers. The sweep draws the first one in, the
 * twin transition cross-fades to the second.
 */
function RoomShell({
  room,
  anim,
  solo,
  gameplayActive,
}: {
  room: SceneRoom
  anim: ScanAnim
  /** No return cloud to carry the scan, so the wireframe has to read on its own. */
  solo: boolean
  gameplayActive: boolean
}) {
  const raw = useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color('#39516b'),
        wireframe: true,
        transparent: true,
        opacity: 0,
        roughness: 1,
        side: DoubleSide,
      }),
    [],
  )

  const surfaces = useMemo(
    () => ({
      wall: new MeshStandardMaterial({
        color: new Color(room.id === 'photo-cafe-8179' ? '#665448' : '#d9d3c7'),
        roughness: 0.86,
        transparent: true,
        opacity: 0,
      }),
      floor: new MeshStandardMaterial({
        color: new Color(room.id === 'photo-cafe-8179' ? '#cba778' : '#b08968'),
        roughness: 0.74,
        transparent: true,
        opacity: 0,
      }),
      ceiling: new MeshStandardMaterial({
        color: new Color('#ece8df'),
        roughness: 0.95,
        transparent: true,
        opacity: 0,
      }),
      openWall: new MeshStandardMaterial({
        color: new Color(room.id === 'photo-cafe-8179' ? '#a99b88' : '#cfd8dc'),
        roughness: 0.7,
        transparent: true,
        opacity: 0,
      }),
    }),
    [room.id],
  )

  const rawGroup = useRef<Group>(null)
  const twinGroup = useRef<Group>(null)

  useEffect(
    () => () => {
      raw.dispose()
      Object.values(surfaces).forEach((material) => material.dispose())
    },
    [raw, surfaces],
  )

  useFrame(() => {
    raw.opacity = anim.scan * (1 - anim.twin) * (solo ? 0.85 : 0.5)
    if (rawGroup.current) rawGroup.current.visible = raw.opacity > 0.004

    surfaces.wall.opacity = anim.twin
    surfaces.floor.opacity = anim.twin
    surfaces.ceiling.opacity = anim.twin
    surfaces.openWall.opacity = anim.twin * (gameplayActive ? 1 : 0.38)
    surfaces.openWall.transparent = !gameplayActive || anim.twin < 1

    // Opaque once the transition lands, so the twin keeps crisp shadows.
    const settled = anim.twin >= 1
    surfaces.wall.transparent = !settled
    surfaces.floor.transparent = !settled
    surfaces.ceiling.transparent = !settled
    if (twinGroup.current) twinGroup.current.visible = anim.twin > 0.004
  })

  return (
    <>
      <group ref={rawGroup}>
        <Shell room={room} wall={raw} floor={raw} ceiling={raw} openWall={raw} />
      </group>
      <group ref={twinGroup}>
        <Shell
          room={room}
          wall={surfaces.wall}
          floor={surfaces.floor}
          ceiling={surfaces.ceiling}
          openWall={surfaces.openWall}
          shadows
        />
      </group>
    </>
  )
}

function Shell({
  room,
  wall,
  floor,
  ceiling,
  openWall,
  shadows = false,
}: {
  room: SceneRoom
  wall: MeshStandardMaterial
  floor: MeshStandardMaterial
  ceiling: MeshStandardMaterial
  openWall: MeshStandardMaterial
  shadows?: boolean
}) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={floor} receiveShadow={shadows}>
        <planeGeometry args={[room.width, room.depth]} />
      </mesh>
      <mesh position={[0, room.height, 0]} rotation={[Math.PI / 2, 0, 0]} material={ceiling}>
        <planeGeometry args={[room.width, room.depth]} />
      </mesh>
      <mesh position={[0, room.height / 2, -room.depth / 2]} material={wall} receiveShadow={shadows}>
        <planeGeometry args={[room.width, room.height]} />
      </mesh>
      <mesh
        position={[0, room.height / 2, room.depth / 2]}
        rotation={[0, Math.PI, 0]}
        material={wall}
        receiveShadow={shadows}
      >
        <planeGeometry args={[room.width, room.height]} />
      </mesh>
      <mesh
        position={[-room.width / 2, room.height / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        material={wall}
        receiveShadow={shadows}
      >
        <planeGeometry args={[room.depth, room.height]} />
      </mesh>
      <mesh
        position={[room.width / 2, room.height / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        material={openWall}
        receiveShadow={shadows}
      >
        <planeGeometry args={[room.depth, room.height]} />
      </mesh>
    </group>
  )
}

function FloorGrid({ room, anim }: { room: SceneRoom; anim: ScanAnim }) {
  const grid = useRef<GridHelper>(null)
  const size = useMemo(() => Math.round(Math.max(room.width, room.depth) + 4), [room])

  useEffect(() => {
    const material = grid.current?.material as LineBasicMaterial | undefined
    if (!material) return
    material.transparent = true
    material.opacity = 0
  }, [])

  useFrame(() => {
    const target = grid.current
    if (!target) return
    const material = target.material as LineBasicMaterial
    material.opacity = anim.scan * (1 - anim.twin) * 0.45
    target.visible = material.opacity > 0.004
  })

  return <gridHelper ref={grid} args={[size, size * 2, '#1d3b4a', '#132029']} position={[0, 0.002, 0]} />
}

function SceneMesh({
  object,
  origin,
  anim,
  window: scanWindow,
  materialise,
  settings,
  reconstructed,
  highlighted,
  targeted,
  powered,
  labelled,
  editing,
  gameplayActive,
  onAssetReady,
  onDraggingChange,
  onMoveObject,
  onSelectObject,
}: {
  object: SceneObject
  origin: Vec3
  anim: ScanAnim
  window: RevealWindow
  materialise: RevealWindow
  settings: GraphicsSettings
  reconstructed: boolean
  highlighted: boolean
  targeted: boolean
  powered: boolean
  /** Carries a floating name plate; a crowded scene names only the answer. */
  labelled: boolean
  editing: boolean
  gameplayActive: boolean
  onAssetReady: (key: string, ready: boolean) => void
  onDraggingChange: (dragging: boolean) => void
  onMoveObject: (id: string, position: Vec3) => void
  onSelectObject: (id: string) => void
}) {
  const { camera, gl, raycaster } = useThree()
  const dragging = useRef(false)
  const objectRef = useRef(object)
  const moveRef = useRef(onMoveObject)
  const dragChangeRef = useRef(onDraggingChange)
  objectRef.current = object
  moveRef.current = onMoveObject
  dragChangeRef.current = onDraggingChange

  const draggable = editing && canDragObject(object)
  const { instance, ready } = useFurniture(reconstructed && usesDemoFurniture(object) ? object.type : '')
  const fitted = useMemo(() => instance ? fitFurniture(instance.bounds, object.size) : null, [instance, object.size])
  const assetKey = furnitureLoadKey(object)
  const onCatalogReady = useCallback((value: boolean) => onAssetReady(assetKey, value), [assetKey, onAssetReady])
  useEffect(() => { if (!object.assetId) onAssetReady(assetKey, ready) }, [object.assetId, assetKey, ready, onAssetReady])

  useEffect(() => {
    if (!instance) return
    for (const { material } of instance.materials) {
      if (!(material instanceof MeshStandardMaterial)) continue
      if (!material.userData.originalColor) material.userData.originalColor = material.color.clone()
      if (object.color) material.color.set(object.color)
      else material.color.copy(material.userData.originalColor)
      material.roughness = object.material === 'metal' ? 0.32 : object.material === 'fabric' ? 0.9 : 0.55
      material.metalness = object.material === 'metal' ? 0.7 : 0
    }
  }, [instance, object.color, object.material])

  // Keyed on identity, not position: the returns belong to the object and travel
  // with it, so dragging furniture never re-scans the room.
  const cloudKey = `${object.id}:${object.size.join(',')}:${object.rotation?.join(',') ?? ''}`
  // A catalogue model draws no returns, and neither does a room being walked through,
  // so in both cases it never pays to sample the box.
  const wantsCloud = settings.pointCloud && !object.assetId && !gameplayActive
  const cloud = useMemo(
    () => (wantsCloud ? buildObjectCloud(objectRef.current, origin) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloudKey, origin, wantsCloud],
  )

  const rawMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color('#6a717c'),
        wireframe: true,
        transparent: true,
        opacity: 0,
        roughness: 1,
        emissive: new Color(ACCENT),
        emissiveIntensity: 0,
      }),
    [],
  )

  const shell = useRef<Group>(null)
  const rawMesh = useRef<Mesh>(null)
  const twinMesh = useRef<Group>(null)

  useEffect(
    () => () => {
      rawMaterial.dispose()
    },
    [rawMaterial],
  )

  useEffect(() => {
    function projectClient(clientX: number, clientY: number) {
      const current = objectRef.current
      const rect = gl.domElement.getBoundingClientRect()
      floorNdc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(floorNdc, camera)
      if (!raycaster.ray.intersectPlane(floorPlane, floorHit)) return
      moveRef.current(current.id, [floorHit.x, current.position[1], floorHit.z])
    }

    function onWindowMove(event: PointerEvent) {
      if (!dragging.current) return
      projectClient(event.clientX, event.clientY)
    }

    function onWindowUp() {
      if (!dragging.current) return
      dragging.current = false
      dragChangeRef.current(false)
      document.body.style.cursor = 'auto'
    }

    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowUp)
    window.addEventListener('blur', onWindowUp)
    return () => {
      onWindowUp()
      window.removeEventListener('pointermove', onWindowMove)
      window.removeEventListener('pointerup', onWindowUp)
      window.removeEventListener('pointercancel', onWindowUp)
      window.removeEventListener('blur', onWindowUp)
    }
  }, [camera, gl, raycaster])

  useFrame(() => {
    const found = revealAmount(anim.scan, scanWindow)
    const solid = revealAmount(anim.twin, materialise)

    if (shell.current) {
      // A box arrives slightly over size, then settles, the way a solver
      // tightens a bounding box as more returns land on it.
      const overshoot = found < 1 ? 1 + Math.sin(found * Math.PI) * 0.06 : 1
      shell.current.scale.setScalar((0.55 + 0.45 * found) * overshoot)
      shell.current.position.y = (1 - found) * -0.12
      shell.current.visible = found > 0.004
    }

    rawMaterial.opacity = found * (1 - solid) * 0.95
    // Fresh returns flare, then cool to the wireframe colour.
    rawMaterial.emissiveIntensity = (1 - found) ** 2 * 1.6 + anim.think * 0.4
    if (rawMesh.current) rawMesh.current.visible = rawMaterial.opacity > 0.004

    const glow = highlighted ? 0.45 + Math.sin(anim.time * 4.2) * 0.18 : draggable ? 0.12 : 0
    if (instance) {
      updateFurnitureMaterials(instance.materials, solid, glow * solid)
      applyObjectPower(instance.materials.flatMap(({ material }) => material instanceof MeshStandardMaterial ? [material] : []), object, powered, solid)
    }
    if (twinMesh.current) {
      twinMesh.current.visible = solid > 0.004
      // The last centimetre of the lift into place.
      twinMesh.current.position.y = (1 - solid) * 0.06
    }
  })

  const labelDelay = settings.motion ? (materialise.start * TWIN_DURATION_MS) / 1000 : 0

  return (
    <group position={object.position} rotation={object.rotation ?? [0, 0, 0]} name={`scene-object:${object.id}`} userData={{ semanticObjectId: object.id, powered, interactionTarget: targeted }}>
      {targeted && <mesh raycast={() => {}}>
        <boxGeometry args={object.size.map((value) => value + 0.035) as Vec3} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color="#78d7ff" raycast={() => {}} />
      </mesh>}
      <group ref={shell}>
        <mesh ref={rawMesh} material={rawMaterial}>
          <boxGeometry args={object.size} />
        </mesh>
        <group
          ref={twinMesh}
          onPointerOver={(event) => {
            if (!draggable) return
            event.stopPropagation()
            document.body.style.cursor = 'grab'
          }}
          onPointerOut={() => {
            if (!dragging.current) document.body.style.cursor = 'auto'
          }}
          onPointerDown={(event) => {
            if (!editing) return
            event.stopPropagation()
            onSelectObject(object.id)
            if (!draggable) return
            event.nativeEvent.stopImmediatePropagation()
            dragging.current = true
            onDraggingChange(true)
            document.body.style.cursor = 'grabbing'
          }}
        >
          {instance && fitted ? (
            <group position={fitted.position} scale={fitted.scale} dispose={null}>
              <primitive object={instance.scene} dispose={null} />
            </group>
          ) : reconstructed && <FurnitureModel object={object} anim={anim} materialise={materialise} highlighted={highlighted} draggable={draggable} powered={powered} onReady={onCatalogReady} labelled={labelled} />}
        </group>
        {cloud && <ScanPoints cloud={cloud} anim={anim} size={0.055} hot="#b9ffee" cool="#3c8f9c" />}
      </group>

      {reconstructed && labelled && (
        <Html
          zIndexRange={[5, 0]}
          position={[0, object.size[1] / 2 + 0.2, 0]}
          center
          distanceFactor={8}
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className={`label ${highlighted ? 'label-hot' : ''}`}
            style={{ animationDelay: `${labelDelay.toFixed(2)}s` }}
          >
            {object.label}
          </div>
        </Html>
      )}
    </group>
  )
}
