import { Euler, Vector3 } from 'three'
import { usesDemoFurniture } from '../assets/catalog'
import type { SceneGraph, SceneObject, Vec3 } from '../scene/types'
import type { InteractionDefinition } from './types'

/** Coordinates are normalized to the same centered unit box as procedural geometry. */
export const PROCEDURAL_CHAIR_SEAT: Vec3 = [0, 0.085, 0.03]
export const STANDARD_CHAIR_SEAT: Vec3 = [0, 0.48 / 0.88 - 0.5, 0]
export const PROCEDURAL_SOFA = { seatTop: 0.025, seatCenterZ: 0.06, innerWidth: 0.80, cushionDepth: 0.72, cushionHeight: 0.16 } as const

export function proceduralSofaSeats(width: number): Vec3[] {
  const count = width >= 2 ? 3 : 2
  return Array.from({ length: count }, (_, index) => [
    -PROCEDURAL_SOFA.innerWidth / 2 + PROCEDURAL_SOFA.innerWidth / count * (index + 0.5),
    PROCEDURAL_SOFA.seatTop, PROCEDURAL_SOFA.seatCenterZ,
  ])
}

/** Includes the procedural renderer's implicit quarter-turn for thin monitors. */
export function objectAnchor(object: SceneObject, normalized: Vec3): Vec3 {
  const thin = !object.assetId && !usesDemoFurniture(object) && !object.rotation &&
    ['shelf', 'window', 'door', 'monitor'].includes(object.type) && object.size[0] < object.size[2]
  const [w, h, d] = object.size
  const local = new Vector3(...normalized).multiply(new Vector3(...(thin ? [d, h, w] as Vec3 : object.size)))
  if (thin) local.applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  return local.applyEuler(new Euler(...(object.rotation ?? [0, 0, 0]))).add(new Vector3(...object.position)).toArray()
}

function seatAnchors(object: SceneObject): Vec3[] {
  const profile = object.assetId || (usesDemoFurniture(object) && object.type === 'chair' ? 'chair_standard' : object.type)
  // These constants are measured from models/source/build_pack.py and checked against bundled GLB surfaces.
  if (profile === 'chair_cafe') return [[0, (0.4775 - 0.0123464966) / 0.8176535034 - 0.5, 0]]
  if (profile === 'chair_standard') return [STANDARD_CHAIR_SEAT]
  if (profile === 'chair_office') return [[0, 0.4875 / 0.97 - 0.5, 0.005 / 0.5851022]]
  if (profile === 'stool_round') return [[0, 0.5, 0]]
  if (profile === 'chair') return [PROCEDURAL_CHAIR_SEAT]
  if (profile === 'sofa') return proceduralSofaSeats(object.size[0])
  if (profile === 'sofa_2seat' || profile === 'sofa_3seat') {
    const count = profile === 'sofa_2seat' ? 2 : 3
    const width = count === 2 ? 1.62 : 2.18
    const inner = width - 0.31
    return Array.from({ length: count }, (_, index) => [(-inner / 2 + inner / count * (index + 0.5)) / width, 0.455 / 0.86 - 0.5, 0.06 / 0.86])
  }
  return []
}

export function interactionsForObject(object: SceneObject): InteractionDefinition[] {
  const seats = seatAnchors(object)
  if (seats.length) {
    // A seated avatar requires an upright support; furniture lying on its side is not a seat.
    if (new Vector3(0, 1, 0).applyEuler(new Euler(...(object.rotation ?? [0, 0, 0]))).y < 0.995) return []
    const forward = new Vector3(0, 0, 1).applyEuler(new Euler(...(object.rotation ?? [0, 0, 0])))
    const heading = Math.atan2(forward.x, forward.z)
    const floorY = objectAnchor(object, [0, -0.5, 0])[1]
    return seats.map((local, index) => {
      const seat = objectAnchor(object, local)
      const approach = objectAnchor(object, [local[0], -0.5, 0.5 + 0.42 / object.size[2]])
      const armless = object.assetId ? ['chair_cafe', 'chair_standard', 'stool_round'].includes(object.assetId) : object.type === 'chair' && object.shape !== 'armchair'
      const approaches = armless ? [-1, 1].map((side) => objectAnchor(object,
        [local[0] + side * (0.5 + 0.50 / object.size[0]), -0.5, local[2] + 0.02 / object.size[2]])) : undefined
      return { kind: 'seat', id: `${object.id}:seat:${index}`, objectId: object.id,
        label: (object.assetId ?? object.type).startsWith('sofa') ? 'sofa' : object.assetId === 'stool_round' ? 'stool' : 'chair',
        point: seat, seat, approach, ...(approaches ? { approaches } : {}), floorY, heading }
    })
  }
  const profile = object.assetId ?? object.type
  if (profile === 'lamp_floor' || profile === 'lamp') {
    const lightPosition = objectAnchor(object, [0, 1.4 / 1.6 - 0.5, 0])
    return [{ kind: 'toggle', id: `${object.id}:lamp`, objectId: object.id, label: 'lamp', toggle: 'lamp',
      point: objectAnchor(object, [0, 0.15, 0]), lightPosition }]
  }
  if (profile === 'tv_flat' || profile === 'monitor_desktop' || profile === 'monitor' || profile === 'laptop') {
    // Laptop display center measured from its open, tilted lid in the bundled GLB.
    const normalized: Vec3 = profile === 'laptop' ? [0, 0.126139026 / 0.228916183 - 0.5, -0.097067811 / 0.262247592]
      : profile === 'tv_flat' ? [0, 0.491 / 0.808 - 0.5, 0.025 / 0.31]
      : profile === 'monitor_desktop' || usesDemoFurniture(object) ? [0, 0.3085 / 0.478 - 0.5, 0.018 / 0.2]
      : [0, 0.19, 0.16]
    return [{ kind: 'toggle', id: `${object.id}:screen`, objectId: object.id, label: 'screen', toggle: 'screen', point: objectAnchor(object, normalized) }]
  }
  return []
}
export function interactionsForGraph(graph: SceneGraph): InteractionDefinition[] {
  return graph.objects.flatMap(interactionsForObject)
}
