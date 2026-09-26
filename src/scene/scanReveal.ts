import type { SceneGraph, SceneObject, SceneRoom, Vec3 } from './types'

const TAU = Math.PI * 2

/** Wall-clock length of the opening LiDAR sweep. */
export const SCAN_DURATION_MS = 4600
/** Length of the raw → semantic twin materialisation. */
export const TWIN_DURATION_MS = 1900

/** Fraction of the scan timeline the beam needs for one full turn. */
export const SWEEP_SPAN = 0.82
/** How long a surface takes to resolve once the beam has passed it. */
export const REVEAL_SPAN = 0.18
/** Fraction of the twin transition a single object spends materialising. */
export const MATERIALISE_SPAN = 0.55
/** Cosmetic return count reported by the capture readout. */
export const SCAN_POINT_TOTAL = 214_000

export type RevealWindow = {
  start: number
  end: number
}

/** The scanner sits mid-room at eye height and turns on the spot. */
export function sensorOrigin(room: SceneRoom): Vec3 {
  return [0, Math.min(1.55, room.height - 0.6), 0]
}

/**
 * Where a point sits on the sweep, as a fraction of one turn.
 * 0 is +Z, 0.25 is +X, and the beam travels 0 → 1 clockwise seen from above.
 */
export function scanBearing(x: number, z: number, origin: Vec3): number {
  const angle = Math.atan2(x - origin[0], z - origin[2])
  return ((angle % TAU) + TAU) % TAU / TAU
}

/** Y rotation that aims a group's local +X axis along the beam. */
export function beamRotationY(progress: number): number {
  return (progress / SWEEP_SPAN) * TAU - Math.PI / 2
}

/** When the beam reaches a bearing, and when the surface there has resolved. */
export function revealWindowFor(bearing: number): RevealWindow {
  const start = bearing * SWEEP_SPAN
  return { start, end: Math.min(1, start + REVEAL_SPAN) }
}

/** Eased 0 → 1 across a reveal window: fast arrival, soft settle. */
export function revealAmount(progress: number, window: RevealWindow): number {
  const span = window.end - window.start
  if (span <= 0) return progress >= window.start ? 1 : 0
  const linear = clamp01((progress - window.start) / span)
  return 1 - (1 - linear) ** 3
}

/** Reveal window per object id, keyed off each object's bearing. */
export function scanSchedule(graph: SceneGraph): Map<string, RevealWindow> {
  const origin = sensorOrigin(graph.room)
  return new Map(
    graph.objects.map((object) => [
      object.id,
      revealWindowFor(scanBearing(object.position[0], object.position[2], origin)),
    ]),
  )
}

/** Objects the sweep has found so far, in graph order. */
export function revealedObjects(graph: SceneGraph | null, progress: number): SceneObject[] {
  if (!graph) return []
  const schedule = scanSchedule(graph)
  return graph.objects.filter((object) => {
    const window = schedule.get(object.id)
    return window !== undefined && revealAmount(progress, window) > 0
  })
}

/** Returns logged by the sensor so far. */
export function capturedPoints(progress: number): number {
  return Math.round(clamp01(progress) * SCAN_POINT_TOTAL)
}

/** Stagger so objects gain their materials one after another, never all at once. */
export function materialiseWindow(index: number, count: number): RevealWindow {
  if (count <= 1) return { start: 0, end: 1 }
  const start = (index / (count - 1)) * (1 - MATERIALISE_SPAN)
  return { start, end: start + MATERIALISE_SPAN }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
