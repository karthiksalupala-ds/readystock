import type { Vec3 } from '../scene/types'

export const CAMERA_TARGET_HEIGHT = 1
export const CAMERA_DISTANCE = 3
export const CAMERA_PITCH = 0.17
export function chooseInitialCameraYaw(distanceAt: (yaw: number) => number): number {
  const preferred = distanceAt(0)
  if (preferred >= CAMERA_DISTANCE - 0.1) return 0
  let yaw = 0
  let best = preferred
  for (let step = 1; step < 16; step++) {
    const candidate = step * Math.PI / 8
    const distance = distanceAt(candidate)
    if (distance > best + 0.01) { yaw = candidate; best = distance }
  }
  return yaw
}
export function avatarCameraOpacity(distance: number): number {
  return Math.max(0, Math.min(1, (distance - 0.7) / 0.8))
}
export function cameraDirection(yaw: number, pitch = CAMERA_PITCH): Vec3 {
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
}
