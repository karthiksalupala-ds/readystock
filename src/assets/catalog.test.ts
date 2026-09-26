import { describe, expect, it } from 'vitest'
import { usesDemoFurniture } from './catalog'

describe('demo model selection alongside appearance and renovation', () => {
  it('keeps standard demo furniture as GLBs and respects alternate shapes and catalog models', () => {
    expect(usesDemoFurniture({ type: 'chair' })).toBe(true)
    expect(usesDemoFurniture({ type: 'table', shape: 'rounded' })).toBe(true)
    expect(usesDemoFurniture({ type: 'chair', shape: 'task' })).toBe(true)
    expect(usesDemoFurniture({ type: 'table', shape: 'oval' })).toBe(false)
    expect(usesDemoFurniture({ type: 'chair', shape: 'armchair' })).toBe(false)
    expect(usesDemoFurniture({ type: 'chair', assetId: 'chair_office' })).toBe(false)
    expect(usesDemoFurniture({ type: 'window' })).toBe(false)
  })
})
