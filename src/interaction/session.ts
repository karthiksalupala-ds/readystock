import type { Vec3 } from '../scene/types'
import type { InteractionDefinition, SeatInteraction } from './types'

export const SEAT_REFERENCE_HEIGHT = .46
export const SEAT_TRANSITION_SECONDS = 20 / 30
export type InteractionPhase = 'standing' | 'aligning' | 'sitting_down' | 'seated' | 'standing_up'
export type InteractionSnapshot = {
  phase: InteractionPhase
  targetId: string | null
  interactionId: string | null
  label: string
  available: boolean
  reason?: string
}
export type SeatValidation = { valid: true; exit: Vec3 } | { valid: false; reason: string }
export type InteractionAdapter = {
  feet(): Vec3
  heading(): number
  visible(point: Vec3, objectId: string): boolean
  validateSeat(seat: SeatInteraction): SeatValidation
  validateExit(point: Vec3): Vec3 | null
  attach(position: Vec3, heading: number): void
  release(position: Vec3): void
}
export type InteractionOptions = {
  motion?: () => boolean
  onChange?: (snapshot: InteractionSnapshot) => void
  readToggle?: (objectId: string) => boolean
  onToggle?: (objectId: string) => void
}
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((n, i) => n + (b[i] - n) * t) as Vec3

/** Visibility is supplied by the active room's collision world. Hysteresis never retains an occluded target. */
export function selectTarget(definitions: readonly InteractionDefinition[], feet: Vec3, heading: number,
  visible: InteractionAdapter['visible'], previousId?: string | null): InteractionDefinition | null {
  const eye: Vec3 = [feet[0], feet[1] + .85, feet[2]]
  const candidates = definitions.flatMap(definition => {
    const dx = definition.point[0] - feet[0], dz = definition.point[2] - feet[2]
    const range = distance(eye, definition.point)
    const forward = (dx * Math.sin(heading) + dz * Math.cos(heading)) / (Math.hypot(dx, dz) || 1)
    return range <= 1.5 && forward >= .15 && visible(definition.point, definition.objectId) ? [{ definition, range }] : []
  }).sort((a, b) => a.range - b.range || a.definition.id.localeCompare(b.definition.id))
  const previous = candidates.find(item => item.definition.id === previousId)
  return (previous && previous.range <= (candidates[0]?.range ?? 0) + .18 ? previous : candidates[0])?.definition ?? null
}

/** Only live objects keep session state; re-adding a removed object starts off. */
export function reconcileToggles(current: Readonly<Record<string, boolean>>, definitions: readonly InteractionDefinition[]) {
  const ids = new Set(definitions.filter(d => d.kind === 'toggle').map(d => d.objectId))
  return Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id)))
}

/** Owns transient targeting and seat attachment. No React or timers; pause means no update calls. */
export function createInteractionSession(definitions: readonly InteractionDefinition[], adapter: InteractionAdapter, options: InteractionOptions = {}) {
  let phase: InteractionPhase = 'standing'
  let target: InteractionDefinition | null = null
  let active: SeatInteraction | null = null
  let elapsed = 0
  let from: Vec3 = [0, 0, 0], exit: Vec3 = [0, 0, 0]
  let reason: string | undefined
  let available = true
  let published = ''
  const seatedRoot = (): Vec3 => [active!.seat[0], active!.seat[1] - SEAT_REFERENCE_HEIGHT, active!.seat[2]]
  const snapshot = (): InteractionSnapshot => ({ phase, targetId: (active ?? target)?.objectId ?? null,
    interactionId: (active ?? target)?.id ?? null,
    label: phase === 'seated' ? 'Stand up' : phase === 'aligning' ? 'Getting into position…'
      : phase === 'sitting_down' ? 'Sitting down…' : phase === 'standing_up' ? 'Standing up…'
        : !target ? '' : target.kind === 'seat' ? `Sit on ${target.label}`
          : `Turn ${options.readToggle?.(target.objectId) ? 'off' : 'on'} ${target.label}`,
    available: available && (phase === 'standing' ? target !== null : phase === 'seated'), ...(reason ? { reason } : {}),
  })
  const publish = () => {
    const next = snapshot(), key = JSON.stringify(next)
    if (key !== published) { published = key; options.onChange?.(next) }
  }
  const setPhase = (next: InteractionPhase) => { phase = next; elapsed = 0; reason = undefined; available = true }
  const update = (delta: number) => {
    if (phase === 'standing') {
      target = selectTarget(definitions, adapter.feet(), adapter.heading(), adapter.visible, target?.id)
      const validation = target?.kind === 'seat' ? adapter.validateSeat(target) : null
      available = !validation || validation.valid
      reason = validation && !validation.valid ? validation.reason : undefined
    } else if (active) {
      elapsed += delta
      const duration = phase === 'aligning' ? .18 : SEAT_TRANSITION_SECONDS
      const t = options.motion?.() === false ? 1 : Math.min(1, elapsed / duration)
      const eased = t * t * (3 - 2 * t)
      if (phase === 'aligning') {
        adapter.attach(lerp(from, exit, eased), active.heading)
        if (t === 1) setPhase('sitting_down')
      } else if (phase === 'sitting_down') {
        adapter.attach(lerp(exit, seatedRoot(), eased), active.heading)
        if (t === 1) setPhase('seated')
      } else if (phase === 'standing_up') {
        adapter.attach(lerp(seatedRoot(), exit, eased), active.heading)
        if (t === 1) {
          const safe = adapter.validateExit(exit)
          if (safe) { adapter.release(safe); active = null; target = null; setPhase('standing') }
          else { adapter.attach(seatedRoot(), active.heading); setPhase('seated'); available = false; reason = 'Standing space is blocked. Use Reset position.' }
        }
      }
    }
    publish()
  }
  const interact = () => {
    if (phase === 'standing') {
      update(0)
      if (!target || !available) return
      if (target.kind === 'toggle') { options.onToggle?.(target.objectId); publish(); return }
      const validation = adapter.validateSeat(target)
      if (!validation.valid) { available = false; reason = validation.reason; publish(); return }
      active = target; from = adapter.feet(); exit = validation.exit
      setPhase('aligning'); adapter.attach(from, active.heading)
      if (options.motion?.() === false) { adapter.attach(seatedRoot(), active.heading); setPhase('seated') }
    } else if (phase === 'seated' && active) {
      const safe = adapter.validateExit(exit)
      if (!safe) { available = false; reason = 'Standing space is blocked. Use Reset position.'; publish(); return }
      exit = safe; setPhase('standing_up')
      if (options.motion?.() === false) { adapter.release(exit); active = null; target = null; setPhase('standing') }
    }
    publish()
  }
  return { update, interact, snapshot, attached: () => active !== null, phase: () => phase, elapsed: () => elapsed,
    seatHeight: () => active ? active.seat[1] - active.floorY : SEAT_REFERENCE_HEIGHT,
    seatWeight: () => {
      const t = Math.min(1, elapsed / SEAT_TRANSITION_SECONDS), eased = t * t * (3 - 2 * t)
      return phase === 'seated' ? 1 : phase === 'sitting_down' ? eased : phase === 'standing_up' ? 1 - eased : 0
    },
    cameraLowering: () => {
      const t = Math.min(1, elapsed / SEAT_TRANSITION_SECONDS)
      return phase === 'seated' ? .36 : phase === 'sitting_down' ? .36 * t : phase === 'standing_up' ? .36 * (1 - t) : 0
    },
    reset: () => { active = null; target = null; setPhase('standing'); publish() },
  }
}
