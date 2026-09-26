import RAPIER from '@dimforge/rapier3d-compat'
import { Euler, Quaternion } from 'three'
import type { RoomEnvironment } from '../room/types'
import type { Vec3 } from '../scene/types'
import { movementAnimation, movementVelocity, type PlayerAnimation, type PlayerInput } from './controls'
import { createInteractionSession, SEAT_REFERENCE_HEIGHT, type InteractionOptions, type SeatValidation } from '../interaction/session'
import type { SeatInteraction } from '../interaction/types'
import { SEAT_POSE_HEIGHT_RANGE } from './seatPose'

export const PHYSICS_STEP = 1 / 60
export const PLAYER_HEIGHT = 1.8
export const PLAYER_RADIUS = 0.22
let initialized: Promise<void> | undefined
export function initializePhysics() { return initialized ??= RAPIER.init() }
const HALF_HEIGHT = PLAYER_HEIGHT / 2
const CAPSULE_HALF_SEGMENT = HALF_HEIGHT - PLAYER_RADIUS
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const vector = ([x, y, z]: Vec3) => ({ x, y, z })
const SPAWN_MESSAGE = 'Choose a clear floor point with enough room for the character to stand.'

function attachEnvironment(world: RAPIER.World, environment: RoomEnvironment) {
  const colliders: RAPIER.Collider[] = []
  try {
    for (const shape of environment.colliders) {
      let description: RAPIER.ColliderDesc
      if (shape.kind === 'box') {
        description = RAPIER.ColliderDesc.cuboid(...shape.halfExtents).setTranslation(...shape.center)
        if (shape.rotation) description.setRotation(new Quaternion().setFromEuler(new Euler(...shape.rotation)))
      } else {
        description = RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      }
      colliders.push(world.createCollider(description))
    }
    // Rapier updates its scene-query acceleration structure during a step.
    world.timestep = PHYSICS_STEP
    world.step()
    return colliders
  } catch (error) {
    colliders.forEach((collider) => world.removeCollider(collider, false))
    throw error
  }
}

function supportedSpawn(world: RAPIER.World, candidate: Vec3, excludeCollider?: RAPIER.Collider, excludeBody?: RAPIER.RigidBody): Vec3 | null {
  const origin = { x: candidate[0], y: candidate[1] + 0.1, z: candidate[2] }
  const hit = world.castRayAndGetNormal(new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 }), 0.35, false,
    undefined, undefined, excludeCollider, excludeBody)
  if (!hit || hit.normal.y < Math.cos(Math.PI / 4)) return null
  const feet: Vec3 = [candidate[0], origin.y - hit.timeOfImpact + 0.015, candidate[2]]
  let blocked = false
  world.intersectionsWithShape(
    { x: feet[0], y: feet[1] + HALF_HEIGHT, z: feet[2] }, IDENTITY,
    new RAPIER.Capsule(CAPSULE_HALF_SEGMENT, PLAYER_RADIUS),
    () => { blocked = true; return false },
    undefined, undefined, excludeCollider, excludeBody,
  )
  return blocked ? null : feet
}

function chooseSpawn(world: RAPIER.World, environment: RoomEnvironment, allowSearch: boolean): Vec3 | null {
  const preferred = supportedSpawn(world, environment.spawn)
  if (preferred || !allowSearch) return preferred
  const candidates: Vec3[] = []
  const { min, max } = environment.bounds
  for (let x = min[0] + 0.35; x <= max[0] - 0.35; x += 0.45) {
    for (let z = min[2] + 0.35; z <= max[2] - 0.35; z += 0.45) candidates.push([x, environment.spawn[1], z])
  }
  candidates.sort((a, b) => Math.hypot(a[0] - environment.spawn[0], a[2] - environment.spawn[2])
    - Math.hypot(b[0] - environment.spawn[0], b[2] - environment.spawn[2]))
  for (const candidate of candidates) {
    const spawn = supportedSpawn(world, candidate)
    if (spawn) return spawn
  }
  return null
}

/** Runs the same capsule/floor queries as gameplay, without mounting a canvas. */
export async function validateEnvironmentSpawn(environment: RoomEnvironment): Promise<{ valid: boolean; message?: string }> {
  await initializePhysics()
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  try {
    attachEnvironment(world, environment)
    return chooseSpawn(world, environment, false) ? { valid: true } : { valid: false, message: SPAWN_MESSAGE }
  } catch {
    return { valid: false, message: 'This room could not be prepared for collisions. Try another GLB.' }
  } finally { world.free() }
}

/** Owns only its room and character bodies; callers advance the shared world at 60 Hz. */
export function createPlayerSession(world: RAPIER.World, environment: RoomEnvironment, allowSpawnSearch = false, interactionOptions: InteractionOptions = {}) {
  const environmentColliders = attachEnvironment(world, environment)
  const spawn = chooseSpawn(world, environment, allowSpawnSearch)
  if (!spawn) {
    environmentColliders.forEach((collider) => world.removeCollider(collider, false))
    throw new Error(SPAWN_MESSAGE)
  }
  const center = { x: spawn[0], y: spawn[1] + HALF_HEIGHT, z: spawn[2] }
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z))
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE_HALF_SEGMENT, PLAYER_RADIUS), body)
  const controller = world.createCharacterController(0.01)
  controller.setSlideEnabled(true)
  controller.enableSnapToGround(0.12)
  controller.setMaxSlopeClimbAngle(Math.PI / 4)
  controller.setMinSlopeSlideAngle(Math.PI / 4)
  controller.disableAutostep()
  world.step()
  let verticalSpeed = 0
  let grounded = false
  let animation: PlayerAnimation = 'idle'
  let heading = Math.PI
  const objectIds = new Map(environmentColliders.map((c, i) => [c.handle, environment.colliders[i].objectId]))
  const feet = (): Vec3 => {
    const position = body.translation()
    return [position.x, position.y - HALF_HEIGHT, position.z]
  }
  const moveBody = (point: Vec3) => {
    const position = { x: point[0], y: point[1] + HALF_HEIGHT, z: point[2] }
    body.setTranslation(position, true)
    body.setNextKinematicTranslation(position)
    world.propagateModifiedBodyPositionsToColliders()
  }
  const clearBody = (point: Vec3, ignoredObject?: string) => {
    let clear = true
    world.intersectionsWithShape({ x: point[0], y: point[1] + HALF_HEIGHT, z: point[2] }, IDENTITY,
      new RAPIER.Capsule(CAPSULE_HALF_SEGMENT, PLAYER_RADIUS), () => { clear = false; return false },
      undefined, undefined, collider, body, c => !ignoredObject || objectIds.get(c.handle) !== ignoredObject)
    return clear
  }
  const clearPath = (from: Vec3, to: Vec3, ignoredObject?: string) => {
    if (!clearBody(from, ignoredObject) || !clearBody(to, ignoredObject)) return false
    const direction = { x: to[0] - from[0], y: to[1] - from[1], z: to[2] - from[2] }
    const hit = world.castShape({ x: from[0], y: from[1] + HALF_HEIGHT, z: from[2] }, IDENTITY, direction,
      new RAPIER.Capsule(CAPSULE_HALF_SEGMENT, PLAYER_RADIUS), 0, 1, true,
      undefined, undefined, collider, body, c => !ignoredObject || objectIds.get(c.handle) !== ignoredObject)
    return !hit
  }
  const validateExit = (point: Vec3): Vec3 | null => {
    const standing = supportedSpawn(world, point, collider, body)
    if (!standing) return null
    if (interactions.attached()) {
      const current = feet()
      const root: Vec3 = [current[0], Math.max(current[1], standing[1]), current[2]]
      if (!clearPath(root, standing, interactions.snapshot().targetId ?? undefined)) return null
    }
    return standing
  }
  const validateSeat = (seat: SeatInteraction): SeatValidation => {
    const height = seat.seat[1] - seat.floorY
    if (height < SEAT_POSE_HEIGHT_RANGE[0] || height > SEAT_POSE_HEIGHT_RANGE[1]) return { valid: false, reason: 'This seat is too low or high for this character.' }
    // The upright controller capsule does not cover knees and shoes when seated.
    // Split thighs from the lower forward section so feet can fit below real table aprons.
    const rotation = new Quaternion().setFromEuler(new Euler(0, seat.heading, 0))
    for (const [near, far, top] of [[0, .32, seat.seat[1] + .18], [.32, .66, seat.seat[1] + .10]]) {
      const middle = (near + far) / 2, bottom = seat.floorY + .03
      let blocked = false
      world.intersectionsWithShape({ x: seat.seat[0] + Math.sin(seat.heading) * middle,
        y: (bottom + top) / 2, z: seat.seat[2] + Math.cos(seat.heading) * middle }, rotation,
      new RAPIER.Cuboid(.23, (top - bottom) / 2, (far - near) / 2), () => { blocked = true; return false },
      undefined, undefined, collider, body, c => objectIds.get(c.handle) !== seat.objectId)
      if (blocked) return { valid: false, reason: 'There is not enough clear space for your legs.' }
    }
    let failure: SeatValidation = { valid: false, reason: 'Clear the space in front of this seat.' }
    for (const approach of [seat.approach, ...(seat.approaches ?? [])]) {
      const result = validateApproach(seat, approach)
      if (result.valid) return result
      failure = result
    }
    return failure
  }
  const validateApproach = (seat: SeatInteraction, approach: Vec3): SeatValidation => {
    const standing = validateExit(approach)
    if (!standing) return { valid: false, reason: 'Clear floor and headroom are needed in front of this seat.' }
    const start = feet()
    const length = Math.hypot(start[0] - standing[0], start[2] - standing[2])
    if (length > 1.25) return { valid: false, reason: 'Walk closer to the front of this seat.' }
    if (!clearPath(start, standing)) return { valid: false, reason: 'The approach is blocked. Walk around to the front.' }
    for (let t = 0; t <= 1; t += .1) {
      const point: Vec3 = [start[0] + (standing[0] - start[0]) * t, standing[1], start[2] + (standing[2] - start[2]) * t]
      if (!validateExit(point)) return { valid: false, reason: 'The approach needs a continuous, clear floor.' }
    }
    // Reserve the entire entry/exit body corridor, ignoring only the seat's own coarse collider.
    // Sitting geometry is smaller, so this conservatively also protects headroom and bent legs.
    const root: Vec3 = [seat.seat[0], Math.max(standing[1], seat.seat[1] - SEAT_REFERENCE_HEIGHT), seat.seat[2]]
    if (!clearPath(standing, root, seat.objectId)) return { valid: false, reason: 'There is not enough space around this seat.' }
    return { valid: true, exit: standing }
  }
  const interactions = createInteractionSession(environment.interactions ?? [], {
    feet, heading: () => heading, validateExit, validateSeat,
    visible: (point, objectId) => {
      const position = feet(), origin = { x: position[0], y: position[1] + .85, z: position[2] }
      return !world.castRay(new RAPIER.Ray(origin, { x: point[0] - origin.x, y: point[1] - origin.y, z: point[2] - origin.z }),
        .999, true, undefined, undefined, collider, body, c => objectIds.get(c.handle) !== objectId)
    },
    attach: (point, angle) => { collider.setEnabled(false); moveBody(point); heading = angle; verticalSpeed = 0; grounded = true },
    release: point => { moveBody(point); collider.setEnabled(true); verticalSpeed = 0; grounded = true; animation = 'idle' },
  }, interactionOptions)
  const reset = () => {
    interactions.reset()
    collider.setEnabled(true)
    body.setTranslation(center, true)
    body.setNextKinematicTranslation(center)
    world.propagateModifiedBodyPositionsToColliders()
    verticalSpeed = 0
    grounded = false
    animation = 'idle'
  }
  return {
    feet, reset,
    interact: interactions.interact,
    interaction: interactions.snapshot,
    transitionTime: interactions.elapsed,
    seatHeight: interactions.seatHeight,
    seatWeight: interactions.seatWeight,
    cameraLowering: interactions.cameraLowering,
    grounded: () => grounded,
    animation: (): PlayerAnimation => {
      const phase = interactions.phase()
      return phase === 'sitting_down' ? 'sit_down' : phase === 'standing_up' ? 'stand_up' : phase === 'seated' ? 'seated_idle' : phase === 'aligning' ? 'idle' : animation
    },
    heading: () => heading,
    setHeading: (next: number) => { heading = next },
    beforeStep: (input: PlayerInput, yaw: number) => {
      interactions.update(PHYSICS_STEP)
      if (interactions.attached()) return
      if (feet()[1] < environment.bounds.min[1] - 2) { reset(); return }
      const [vx, vz] = movementVelocity(input, yaw)
      verticalSpeed = grounded ? -0.5 : Math.max(-20, verticalSpeed - 9.81 * PHYSICS_STEP)
      controller.computeColliderMovement(collider, { x: vx * PHYSICS_STEP, y: verticalSpeed * PHYSICS_STEP, z: vz * PHYSICS_STEP })
      const movement = controller.computedMovement()
      const position = body.translation()
      body.setNextKinematicTranslation({ x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z })
      grounded = controller.computedGrounded()
      animation = movementAnimation(Math.hypot(movement.x, movement.z), PHYSICS_STEP, input.run)
      if (animation !== 'idle') heading = Math.atan2(movement.x, movement.z)
    },
    cameraDistance: (target: Vec3, direction: Vec3, maximum: number) => {
      const occupied = interactions.attached() ? interactions.snapshot().targetId : null
      const hit = world.castShape(vector(target), IDENTITY, vector(direction), new RAPIER.Ball(0.14), 0, maximum, true,
        undefined, undefined, collider, body, c => !occupied || objectIds.get(c.handle) !== occupied)
      return hit ? Math.max(0.02, hit.time_of_impact - 0.04) : maximum
    },
    dispose: () => {
      world.removeCharacterController(controller)
      world.removeRigidBody(body)
      environmentColliders.forEach((environmentCollider) => world.removeCollider(environmentCollider, false))
    },
  }
}
