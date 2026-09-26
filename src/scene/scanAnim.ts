/**
 * One mutable clock shared by everything in the canvas.
 *
 * The HUD re-renders on scan progress; the canvas must not. Each piece of the
 * scene reads these numbers inside its own frame callback and writes straight
 * to a material or a transform, so a four-second sweep costs no React renders.
 */
export type ScanAnim = {
  /** Smoothed sweep progress, 0 → 1. */
  scan: number
  /** Raw → semantic twin materialisation, 0 → 1. */
  twin: number
  /** Visibility of the return cloud, 0 → 1. */
  cloud: number
  /** How hard the reconstructor is thinking, 0 → 1. */
  think: number
  /** Seconds since the canvas started. */
  time: number
}

export function createScanAnim(): ScanAnim {
  return { scan: 0, twin: 0, cloud: 1, think: 0, time: 0 }
}

/** Move `current` toward `target` at a fixed rate per second. */
export function approach(current: number, target: number, rate: number, delta: number): number {
  const step = rate * delta
  if (current < target) return Math.min(target, current + step)
  return Math.max(target, current - step)
}
