import { Box3, Euler, Matrix4, Quaternion, Ray, Vector3 } from 'three'
import type { SceneGraph, Vec3 } from '../scene/types'
import type { RoomCollider, RoomEnvironment } from './types'
import { interactionsForGraph } from '../interaction/profiles'
import { furnitureColliders } from './furnitureColliders'

export function demoEnvironment(graph: SceneGraph): RoomEnvironment {
  const { width, depth, height } = graph.room
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const thickness = 0.06
  const box = (center: Vec3, halfExtents: Vec3): RoomCollider => ({ kind: 'box', center, halfExtents })
  const furniture = graph.objects.filter((object) => object.category === 'furniture' || object.category === 'equipment')
  const colliders: RoomCollider[] = [
    box([0, -thickness, 0], [halfWidth, thickness, halfDepth]),
    box([0, height + thickness, 0], [halfWidth, thickness, halfDepth]),
    box([-halfWidth - thickness, height / 2, 0], [thickness, height / 2, halfDepth]),
    box([halfWidth + thickness, height / 2, 0], [thickness, height / 2, halfDepth]),
    box([0, height / 2, -halfDepth - thickness], [halfWidth, height / 2, thickness]),
    box([0, height / 2, halfDepth + thickness], [halfWidth, height / 2, thickness]),
    ...furniture.flatMap(furnitureColliders),
  ]

  // A conservative candidate keeps the avatar away from furniture. Physics makes
  // the final clearance check, so the adapter is independent of a physics engine.
  const obstacles = furniture.map((object) => {
    const half = new Vector3(...object.size).multiplyScalar(0.5)
    const pose = new Matrix4().compose(
      new Vector3(...object.position),
      new Quaternion().setFromEuler(new Euler(...(object.rotation ?? [0, 0, 0]))),
      new Vector3(1, 1, 1),
    )
    return new Box3(half.clone().negate(), half).applyMatrix4(pose).expandByScalar(0.3)
  })
  const candidates: Vec3[] = []
  for (let z = -halfDepth + 0.7; z <= halfDepth - 0.7; z += 0.6) {
    for (let x = -halfWidth + 0.7; x <= halfWidth - 0.7; x += 0.6) {
      const character = new Box3(new Vector3(x - 0.22, 0.02, z - 0.22), new Vector3(x + 0.22, 1.82, z + 0.22))
      if (!obstacles.some((obstacle) => obstacle.intersectsBox(character))) candidates.push([x, 0.02, z])
    }
  }
  // Start near the rear quarter of the room, with a corridor for the default
  // camera behind the avatar. A clear capsule alone can still put it at a shelf.
  // In the photo café, look toward the bar from the main aisle. Leave three
  // metres behind the avatar for the follow camera, just as in the photo.
  const preferred = new Vector3(halfWidth / 2, 0.02, graph.room.id === 'photo-cafe-8179' ? halfDepth - 3.5 : -halfDepth + 0.7)
  candidates.sort((a, b) => new Vector3(...a).distanceToSquared(preferred) - new Vector3(...b).distanceToSquared(preferred))
  const cameraDirection = new Vector3(0, Math.sin(0.17), Math.cos(0.17))
  const clearCamera = candidates.find(candidate => {
    const origin = new Vector3(candidate[0], candidate[1] + 1, candidate[2])
    const ray = new Ray(origin, cameraDirection)
    const end = ray.at(3, new Vector3())
    if (end.z > halfDepth - 0.2 || end.y > height - 0.2) return false
    return obstacles.every(obstacle => {
      const hit = ray.intersectBox(obstacle, new Vector3())
      return !hit || hit.distanceTo(origin) > 3
    })
  })
  const spawn: Vec3 = clearCamera ?? candidates[0] ?? [0, 0.02, 0]
  return {
    id: `demo:${graph.room.id}`,
    bounds: { min: [-halfWidth, 0, -halfDepth], max: [halfWidth, height, halfDepth] },
    colliders,
    spawn,
    interactions: interactionsForGraph(graph),
  }
}
