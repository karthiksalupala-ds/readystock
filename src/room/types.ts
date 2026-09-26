import type { Group } from 'three'
import type { Vec3 } from '../scene/types'
import type { InteractionDefinition } from '../interaction/types'

export type RoomBounds = { min: Vec3; max: Vec3 }

export type RoomCollider =
  | { kind: 'box'; center: Vec3; halfExtents: Vec3; rotation?: Vec3; objectId?: string }
  | { kind: 'trimesh'; vertices: Float32Array; indices: Uint32Array; objectId?: string }

/** Source-independent, meter-scaled input to gameplay; spawn is the feet position. */
export type RoomEnvironment = {
  id: string
  bounds: RoomBounds
  colliders: RoomCollider[]
  spawn: Vec3
  interactions?: InteractionDefinition[]
}

export type LoadedRoom = {
  id: string
  name: string
  root: Group
  bounds: RoomBounds
  triangleCount: number
  dispose(): void
}

export type NormalizedRoom = {
  environment: RoomEnvironment
  /** Apply this translation and scale to a wrapper around the unchanged root. */
  position: Vec3
  scale: number
}
