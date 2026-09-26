import type { SceneObject, Vec3 } from '../scene/types'
import type { RoomCollider } from './types'
import { CylinderGeometry, Vector3 } from 'three'
import { usesDemoFurniture } from '../assets/catalog'
import { shapeFor } from '../scene/appearance'
import { objectAnchor } from '../interaction/profiles'

/** Component bounds follow each supported table renderer, leaving space below the top. */
export function furnitureColliders(object: SceneObject): RoomCollider[] {
  const result: RoomCollider[] = []
  const box = (size: Vec3, center: Vec3) => result.push({ kind: 'box', objectId: object.id, center: objectAnchor(object, center),
    halfExtents: size.map((value, axis) => value * object.size[axis] / 2) as Vec3,
    ...(object.rotation ? { rotation: [...object.rotation] as Vec3 } : {}) })
  const cylinder = (radius: number, height: number, center: Vec3) => {
    // The same 24-sided mesh as the procedural renderer, including nonuniform scale.
    const geometry = new CylinderGeometry(radius, radius, height, 24)
    const position = geometry.getAttribute('position')
    const vertices = new Float32Array(position.count * 3)
    const local = new Vector3()
    for (let index = 0; index < position.count; index++) {
      local.fromBufferAttribute(position, index).add(new Vector3(...center))
      vertices.set(objectAnchor(object, local.toArray()), index * 3)
    }
    result.push({ kind: 'trimesh', objectId: object.id, vertices, indices: new Uint32Array(geometry.index!.array) })
    geometry.dispose()
  }
  if (object.assetId === 'table_dining' || (object.type === 'table' && usesDemoFurniture(object))) {
    // Dining GLB source bounds are 1.4 × .75 × .8; build_pack.py uses a floor origin.
    const sourceBox = (size: Vec3, center: Vec3) => box([size[0] / 1.4, size[1] / .75, size[2] / .8], [center[0] / 1.4, center[1] / .75 - .5, center[2] / .8])
    sourceBox([1.4, .045, .8], [0, .7275, 0])
    for (const x of [-.615, .615]) for (const z of [-.315, .315]) sourceBox([.06, .705, .06], [x, .3525, z])
    for (const z of [-.315, .315]) sourceBox([1.28, .085, .025], [0, .655, z])
  } else if (object.assetId === 'table_cafe') {
    // The café pedestal has open knee space. Feet remain obstacles near the floor.
    box([1, .048, 1], [0, .476, 0])
    box([.10, .905, .10], [0, -.014, 0])
    box([.85, .12, .066], [0, -.44, 0])
    box([.066, .12, .85], [0, -.44, 0])
  } else if (!object.assetId && object.type === 'table') {
    const shape = shapeFor(object)
    if (shape === 'oval') cylinder(.5, .075, [0, .4625, 0])
    else box([1, .075, 1], [0, .4625, 0])
    box([.72, .08, .62], [0, .385, 0])
    if (shape === 'oval') {
      for (const x of [-.24, .24]) {
        cylinder(.035, .79, [x, -.045, 0])
        box([.23, .06, .6], [x, -.47, 0])
      }
    } else {
      for (const x of [-.39, .39]) for (const z of [-.36, .36]) {
        box([.035, .85, .055], [x, -.075, z])
        box([.045, .02, .065], [x, -.49, z])
      }
    }
  } else box([1, 1, 1], [0, 0, 0])
  return result
}
