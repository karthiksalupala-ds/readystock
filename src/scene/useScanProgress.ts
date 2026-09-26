import { useCallback, useEffect, useRef, useState } from 'react'
import { SCAN_DURATION_MS } from './scanReveal'

/** Coarse enough to keep the HUD from re-rendering on every single frame. */
const STEP = 0.01

export type ScanProgress = {
  /** 0 → 1 across the opening LiDAR sweep. */
  progress: number
  /** Jump to a finished scan, for anyone who has seen it before. */
  skip: () => void
}

/**
 * Drives the opening sweep once the scan data is in.
 *
 * Whether the sweep should play at all is a graphics setting, not this hook's
 * call: pass a duration of 0 to hand over a finished scan immediately. Passing a
 * new `sceneKey` restarts the sweep, so importing a second room scans it again.
 */
export function useScanProgress(active: boolean, durationMs = SCAN_DURATION_MS, sceneKey?: string): ScanProgress {
  const [progress, setProgress] = useState(0)
  const skipped = useRef(false)

  const skip = useCallback(() => {
    skipped.current = true
    setProgress(1)
  }, [])

  useEffect(() => {
    if (!active) return
    skipped.current = false

    if (durationMs <= 0) {
      setProgress(1)
      return
    }
    // A new room is a new scan: rewind rather than inherit the last sweep's finish.
    setProgress(0)

    let frame = 0
    let start: number | null = null

    function tick(time: number) {
      if (skipped.current) return
      if (start === null) start = time
      const elapsed = time - start
      const next = Math.min(1, elapsed / durationMs)
      setProgress((current) => (next === 1 || next - current >= STEP ? next : current))
      if (next < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, durationMs, sceneKey])

  return { progress, skip }
}
