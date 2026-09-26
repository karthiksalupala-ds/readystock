import type { Vec3 } from '../scene/types'

type InteractionBase = {
  id: string
  objectId: string
  label: string
  point: Vec3
}

export type SeatInteraction = InteractionBase & {
  kind: 'seat'
  /** World-space cushion contact point, before the avatar's pelvis offset. */
  seat: Vec3
  /** The avatar faces +Z at zero radians. */
  heading: number
  /** Supported standing feet position in front of this cushion. */
  approach: Vec3
  /** Optional side/front standing entries for seats without arms. */
  approaches?: Vec3[]
  floorY: number
}

export type ToggleInteraction = InteractionBase & {
  kind: 'toggle'
  toggle: 'lamp' | 'screen'
  lightPosition?: Vec3
}

export type InteractionDefinition = SeatInteraction | ToggleInteraction
