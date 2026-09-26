import { Euler, Vector3 } from 'three'
import { revealWindowFor, scanBearing } from './scanReveal'
import type { SceneObject, SceneRoom, Vec3 } from './types'

/** Returns per square metre of surface. Enough to read as a scan, cheap to draw. */
const ROOM_DENSITY = 58
const OBJECT_DENSITY = 260
const OBJECT_MIN_POINTS = 160
const OBJECT_MAX_POINTS = 900

export type ScanCloud = {
  /** xyz per return, in the owning group's local space. */
  positions: Float32Array
  /** start, end of the reveal window per return. */
  windows: Float32Array
  /** Stable 0 → 1 jitter seed per return. */
  seeds: Float32Array
  count: number
}

/**
 * Returns scattered over one object's box, in the object's own local space so
 * the cloud travels with it when a user drags the furniture around.
 */
export function buildObjectCloud(object: SceneObject, origin: Vec3): ScanCloud {
  const [width, height, depth] = object.size
  const area = 2 * (width * height + width * depth + height * depth)
  const count = clamp(Math.round(area * OBJECT_DENSITY), OBJECT_MIN_POINTS, OBJECT_MAX_POINTS)
  const random = seededRandom(object.id)
  const builder = new CloudBuilder(count)

  const faces = boxFaces(width, height, depth)
  const total = faces.reduce((sum, face) => sum + face.area, 0)
  const rotation = new Euler(...(object.rotation ?? [0, 0, 0]))
  const world = new Vector3()

  for (let index = 0; index < count; index += 1) {
    const face = pickFace(faces, random() * total)
    const u = random() - 0.5
    const v = random() - 0.5
    const local: Vec3 = [
      face.centre[0] + face.u[0] * u + face.v[0] * v,
      face.centre[1] + face.u[1] * u + face.v[1] * v,
      face.centre[2] + face.u[2] * u + face.v[2] * v,
    ]
    world.fromArray(local).applyEuler(rotation)
    builder.push(local, object.position[0] + world.x, object.position[2] + world.z, origin, random)
  }

  return builder.done()
}

/** Returns scattered over the floor, ceiling and four walls, in world space. */
export function buildRoomCloud(room: SceneRoom, origin: Vec3): ScanCloud {
  const { width, depth, height } = room
  const halfW = width / 2
  const halfD = depth / 2
  const surfaces: Face[] = [
    face([0, 0.002, 0], [width, 0, 0], [0, 0, depth]),
    face([0, height - 0.002, 0], [width, 0, 0], [0, 0, depth]),
    face([0, height / 2, -halfD], [width, 0, 0], [0, height, 0]),
    face([0, height / 2, halfD], [width, 0, 0], [0, height, 0]),
    face([-halfW, height / 2, 0], [0, 0, depth], [0, height, 0]),
    face([halfW, height / 2, 0], [0, 0, depth], [0, height, 0]),
  ]

  const total = surfaces.reduce((sum, item) => sum + item.area, 0)
  const count = Math.round(total * ROOM_DENSITY)
  const random = seededRandom(`${room.id}:${width}x${depth}x${height}`)
  const builder = new CloudBuilder(count)

  for (let index = 0; index < count; index += 1) {
    const surface = pickFace(surfaces, random() * total)
    const u = random() - 0.5
    const v = random() - 0.5
    const point: Vec3 = [
      surface.centre[0] + surface.u[0] * u + surface.v[0] * v,
      surface.centre[1] + surface.u[1] * u + surface.v[1] * v,
      surface.centre[2] + surface.u[2] * u + surface.v[2] * v,
    ]
    builder.push(point, point[0], point[2], origin, random)
  }

  return builder.done()
}

class CloudBuilder {
  private readonly positions: Float32Array
  private readonly windows: Float32Array
  private readonly seeds: Float32Array
  private cursor = 0

  constructor(private readonly capacity: number) {
    this.positions = new Float32Array(capacity * 3)
    this.windows = new Float32Array(capacity * 2)
    this.seeds = new Float32Array(capacity)
  }

  push(local: Vec3, worldX: number, worldZ: number, origin: Vec3, random: () => number) {
    const index = this.cursor
    this.positions[index * 3] = local[0]
    this.positions[index * 3 + 1] = local[1]
    this.positions[index * 3 + 2] = local[2]

    // A hair of jitter keeps the leading edge of the beam from looking like a ruler.
    const window = revealWindowFor(scanBearing(worldX, worldZ, origin))
    const jitter = (random() - 0.5) * 0.012
    const start = clamp(window.start + jitter, 0, window.end - 1e-4)
    this.windows[index * 2] = start
    this.windows[index * 2 + 1] = window.end

    this.seeds[index] = random()
    this.cursor += 1
  }

  done(): ScanCloud {
    return {
      positions: this.positions,
      windows: this.windows,
      seeds: this.seeds,
      count: this.capacity,
    }
  }
}

type Face = {
  centre: Vec3
  u: Vec3
  v: Vec3
  area: number
}

function face(centre: Vec3, u: Vec3, v: Vec3): Face {
  return { centre, u, v, area: length(u) * length(v) }
}

function boxFaces(width: number, height: number, depth: number): Face[] {
  const x = width / 2
  const y = height / 2
  const z = depth / 2
  return [
    face([0, 0, z], [width, 0, 0], [0, height, 0]),
    face([0, 0, -z], [width, 0, 0], [0, height, 0]),
    face([x, 0, 0], [0, 0, depth], [0, height, 0]),
    face([-x, 0, 0], [0, 0, depth], [0, height, 0]),
    face([0, y, 0], [width, 0, 0], [0, 0, depth]),
    face([0, -y, 0], [width, 0, 0], [0, 0, depth]),
  ]
}

function pickFace(faces: Face[], target: number): Face {
  let running = 0
  for (const item of faces) {
    running += item.area
    if (target <= running) return item
  }
  return faces[faces.length - 1]
}

function length(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2])
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** mulberry32 over a string hash: same object, same scan, every render. */
function seededRandom(seed: string): () => number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  let state = hash >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
