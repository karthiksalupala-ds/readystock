// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { AnimationMixer, Group, LoopOnce, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createSeatPose, SEAT_POSE_HEIGHT_RANGE } from './seatPose'

async function avatar() {
  const bytes = await readFile(new URL('../../models/avatars/avatar_casual.glb', import.meta.url))
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}

describe('seat pose calibration with the exported casual rig', () => {
  it('keeps soles grounded across seat heights and transition poses without scaling the avatar', async () => {
    const gltf = await avatar()
    const model = gltf.scene
    const pose = createSeatPose(model)
    const mixer = new AnimationMixer(model)
    const parent = new Group()
    parent.position.set(2, 1.3, -5)
    parent.rotation.y = Math.PI / 2
    parent.add(model)
    for (const height of [0.4, 0.446, 0.455, 0.46, 0.48, 0.4875, 0.6]) {
      for (const name of ['sit_down', 'seated_idle', 'stand_up']) {
        const clip = gltf.animations.find(animation => animation.name === name)!
        const action = mixer.clipAction(clip).setLoop(LoopOnce, 1)
        action.clampWhenFinished = true
        action.reset().play()
        for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
          mixer.setTime(clip.duration * fraction)
          const amount = fraction * fraction * (3 - 2 * fraction)
          const weight = name === 'seated_idle' ? 1 : name === 'sit_down' ? amount : 1 - amount
          model.position.y = (height - 0.46) * weight
          parent.updateMatrixWorld(true)
          const hipsBefore = model.getObjectByName('hips')!.position.clone()
          expect(pose.apply(height, weight)).toBe(true)
          parent.updateMatrixWorld(true)
          for (const suffix of ['L', 'R']) {
            const foot = model.getObjectByName(`foot${suffix}`)!
            expect(foot.getWorldPosition(new Vector3()).y).toBeCloseTo(1.4287, 3)
            expect(foot.quaternion.toArray().every(Number.isFinite)).toBe(true)
          }
          expect(model.scale.toArray()).toEqual([1, 1, 1])
          expect(model.getObjectByName('hips')!.position.toArray()).toEqual(hipsBefore.toArray())
        }
        mixer.stopAllAction()
      }
    }
  })

  it('does not accumulate correction when called repeatedly on the same pose', async () => {
    const gltf = await avatar()
    const pose = createSeatPose(gltf.scene)
    const mixer = new AnimationMixer(gltf.scene)
    mixer.clipAction(gltf.animations.find(clip => clip.name === 'seated_idle')!).play()
    mixer.update(0.3)
    pose.apply(0.6, 1)
    const thigh = gltf.scene.getObjectByName('thighL')!
    const first = thigh.quaternion.clone()
    for (let index = 0; index < 10; index += 1) pose.apply(0.6, 1)
    expect(thigh.quaternion.angleTo(first)).toBeLessThan(0.00001)
  })

  it('leaves unsupported rigs, heights, and nonfinite input untouched', async () => {
    expect(createSeatPose(new Group()).apply(0.46, 1)).toBe(false)
    const gltf = await avatar()
    const pose = createSeatPose(gltf.scene)
    const thigh = gltf.scene.getObjectByName('thighL')!
    const before = thigh.quaternion.clone()
    for (const height of [SEAT_POSE_HEIGHT_RANGE[0] - 0.01, SEAT_POSE_HEIGHT_RANGE[1] + 0.01, Number.NaN]) {
      expect(pose.apply(height, 1)).toBe(false)
      expect(thigh.quaternion.equals(before)).toBe(true)
    }
    expect(pose.apply(0.46, Number.NaN)).toBe(false)
  })
})
