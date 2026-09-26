import { Quaternion, Vector3, type Bone, type Object3D } from 'three'

export const SEATED_REFERENCE_HEIGHT = 0.46
/** Seats outside this calibrated adult range should report an unavailable action. */
export const SEAT_POSE_HEIGHT_RANGE = [0.36, 0.64] as const

/**
 * Construct once on an unposed clone, before creating its AnimationMixer.
 * Call after mixer.update. Height is cushion height above its supporting floor;
 * weight must match the visual root offset: (height - 0.46) * weight.
 * Keeps the animated foot-forward position, solves knee flexion, and holds soles
 * flat without changing model scale, hip position, or the upper-body animation.
 */
export function createSeatPose(model: Object3D) {
  model.updateWorldMatrix(true, true)
  const modelRotation = model.getWorldQuaternion(new Quaternion())
  const modelInverse = modelRotation.clone().invert()
  const axis = new Vector3(1, 0, 0)
  const legs = ['L', 'R'].map(suffix => {
    const get = (name: string) => (model.getObjectByName(`${name}${suffix}`) ?? model.getObjectByName(`${name}.${suffix}`)) as Bone | undefined
    const thigh = get('thigh'), shin = get('shin'), foot = get('foot')
    if (!thigh?.isBone || !shin?.isBone || !foot?.isBone) return undefined
    const bind = (bone: Bone) => modelInverse.clone().multiply(bone.getWorldQuaternion(new Quaternion()))
    return {
      thigh, shin, foot,
      thighBind: bind(thigh), shinBind: bind(shin), footBind: bind(foot),
      upperLength: shin.position.length(), lowerLength: foot.position.length(),
      ankleHeight: model.worldToLocal(foot.getWorldPosition(new Vector3())).y,
      upperAngle: 0, lowerAngle: 0,
    }
  })
  const hip = new Vector3(), ankle = new Vector3()
  const parentInverse = new Quaternion(), desired = new Quaternion(), turn = new Quaternion()
  const rotate = (bone: Bone, bind: Quaternion, angle: number) => {
    bone.parent!.getWorldQuaternion(parentInverse).invert()
    turn.setFromAxisAngle(axis, angle)
    desired.copy(modelRotation).multiply(turn).multiply(bind)
    bone.quaternion.copy(parentInverse).multiply(desired).normalize()
    bone.updateWorldMatrix(false, false)
  }
  return {
    apply(height: number, weight: number): boolean {
      if (legs.some(leg => !leg) || !Number.isFinite(height) || !Number.isFinite(weight) ||
          height < SEAT_POSE_HEIGHT_RANGE[0] || height > SEAT_POSE_HEIGHT_RANGE[1]) return false
      const amount = Math.max(0, Math.min(1, weight))
      if (amount === 0) return true
      model.updateWorldMatrix(true, true)
      model.getWorldQuaternion(modelRotation)
      // Compute both solutions before changing either leg. Unreachable targets
      // leave the current mixer pose intact rather than partially bending it.
      for (const leg of legs) {
        if (!leg) return false
        model.worldToLocal(leg.thigh.getWorldPosition(hip))
        model.worldToLocal(leg.foot.getWorldPosition(ankle))
        const forward = ankle.z - hip.z
        const drop = hip.y - (leg.ankleHeight - (height - SEATED_REFERENCE_HEIGHT) * amount)
        const reach = Math.hypot(forward, drop)
        const { upperLength: upper, lowerLength: lower } = leg
        if (drop <= 0 || reach > upper + lower + 0.00001 || reach < Math.abs(upper - lower) + 0.00001) return false
        const bend = Math.acos(Math.max(-1, Math.min(1, (upper * upper + reach * reach - lower * lower) / (2 * upper * reach))))
        leg.upperAngle = -Math.atan2(forward, drop) - bend
        leg.lowerAngle = Math.atan2(-upper * Math.sin(leg.upperAngle) - forward, drop - upper * Math.cos(leg.upperAngle))
      }
      for (const leg of legs) {
        if (!leg) return false
        rotate(leg.thigh, leg.thighBind, leg.upperAngle)
        rotate(leg.shin, leg.shinBind, leg.lowerAngle)
        rotate(leg.foot, leg.footBind, 0)
      }
      return true
    },
  }
}
