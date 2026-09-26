import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { avatarCameraOpacity, CAMERA_DISTANCE, CAMERA_TARGET_HEIGHT, cameraDirection, chooseInitialCameraYaw } from './camera'

describe('third person framing', () => {
  it('keeps the default direction when clear and selects an unobstructed alternative when blocked', () => {
    expect(chooseInitialCameraYaw(() => 3)).toBe(0)
    const yaw = chooseInitialCameraYaw(angle => Math.abs(angle - Math.PI / 2) < 0.01 ? 3 : 0.3)
    expect(yaw).toBeCloseTo(Math.PI / 2)
  })

  it('hides the avatar when a wall forces the camera into its body and fades back out of the way', () => {
    expect(avatarCameraOpacity(0.3)).toBe(0)
    expect(avatarCameraOpacity(0.7)).toBe(0)
    expect(avatarCameraOpacity(1.1)).toBeGreaterThan(0)
    expect(avatarCameraOpacity(1.1)).toBeLessThan(1)
    expect(avatarCameraOpacity(3)).toBe(1)
  })

  it('frames the full standing avatar with room around its head and feet', () => {
    const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 2000)
    const target = new Vector3(0, CAMERA_TARGET_HEIGHT, 0)
    camera.position.copy(target).addScaledVector(new Vector3(...cameraDirection(0)), CAMERA_DISTANCE)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    const feet = new Vector3(0, 0, 0).project(camera)
    const head = new Vector3(0, 1.8, 0).project(camera)
    expect(feet.y).toBeGreaterThan(-0.9)
    expect(head.y).toBeLessThan(0.9)
    expect(head.y - feet.y).toBeLessThan(1.8)
  })
})
