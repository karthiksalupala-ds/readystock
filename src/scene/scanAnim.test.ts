import { describe, expect, it } from 'vitest'
import { approach, createScanAnim } from './scanAnim'

describe('createScanAnim', () => {
  it('starts before the sweep with the return cloud ready to fill', () => {
    expect(createScanAnim()).toEqual({ scan: 0, twin: 0, cloud: 1, think: 0, time: 0 })
  })
})

describe('approach', () => {
  it('closes on the target at a fixed rate per second', () => {
    expect(approach(0, 1, 0.5, 1)).toBeCloseTo(0.5)
    expect(approach(1, 0, 0.5, 1)).toBeCloseTo(0.5)
  })

  it('lands exactly on the target instead of easing forever', () => {
    expect(approach(0.9, 1, 4, 1)).toBe(1)
    expect(approach(0.1, 0, 4, 1)).toBe(0)
  })

  it('stays put with no time between frames', () => {
    expect(approach(0.3, 1, 8, 0)).toBe(0.3)
  })
})
