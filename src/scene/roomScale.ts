/**
 * What a room's size and density cost the viewer.
 *
 * The demo meeting room is 7.4 × 5.2 m with nine objects. A captured or
 * simulated floor can be five times the area with a hundred, and the constants
 * tuned for the small room stop working: shadows fall outside the light's
 * frustum, one ceiling lamp leaves the far end black, and a label per object
 * buries the room in HTML. These are the rules that scale with the room, kept
 * here so they can be tested without a canvas.
 */
import type { SceneGraph, SceneRoom } from './types'

/** Labels stay readable up to this many objects; past it they overlap into noise. */
export const LABEL_BUDGET = 24

/** Above this span a room needs its own camera framing and light layout. */
const SPACIOUS_M = 9

export function isSpacious(room: SceneRoom): boolean {
  return Math.max(room.width, room.depth) > SPACIOUS_M
}

/**
 * Whether a scan was measured by a device.
 *
 * Only a real capture suppresses the sweep: there was no beam in the room, and
 * replaying one over measured geometry would dress a file up as a live session.
 * A simulated floor has no device either, and says so, so it keeps the sweep.
 */
export function isMeasured(graph: SceneGraph | null): boolean {
  return graph?.source === 'roomplan'
}

/** Whether the camera should frame the whole room instead of the demo's fixed shot. */
export function needsFraming(graph: SceneGraph | null): boolean {
  if (!graph) return false
  return graph.source !== undefined && graph.source !== 'demo' ? true : isSpacious(graph.room)
}

/**
 * Whether an object carries a floating name plate.
 *
 * In a dense scene only the answer is named: a hundred plates cost a hundred
 * DOM nodes and hide the room behind them, and the scene list already names
 * everything. Asking a question still labels exactly what it highlighted.
 */
export function showsLabel({ total, highlighted }: { total: number; highlighted: boolean }): boolean {
  return highlighted || total <= LABEL_BUDGET
}

/** Half-extent the shadow camera must cover to catch the whole floor. */
export function shadowExtent(room: SceneRoom): number {
  return Math.max(room.width, room.depth) / 2 + 1.5
}

/**
 * Ceiling lamps along the room's long axis.
 *
 * One lamp lights a meeting room. A floor needs a row of them, spaced so their
 * pools overlap rather than leaving the far corners unlit.
 */
export function ceilingLights(room: SceneRoom): { position: [number, number, number]; distance: number }[] {
  const long = Math.max(room.width, room.depth)
  const lamps = Math.max(1, Math.min(4, Math.round(long / 6)))
  const y = room.height - 0.4
  const reach = long / lamps + room.height
  const alongX = room.width >= room.depth
  return Array.from({ length: lamps }, (_, index) => {
    // Centre a single lamp; otherwise spread them evenly and inset from the walls.
    const offset = lamps === 1 ? 0 : (long * (index / (lamps - 1) - 0.5)) * 0.72
    return {
      position: alongX ? [offset, y, 0] : [0, y, offset],
      distance: reach,
    }
  })
}
