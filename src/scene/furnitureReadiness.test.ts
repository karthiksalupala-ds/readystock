import { describe, expect, it } from 'vitest'
import { furnitureAssetsReady, furnitureLoadKey } from './furnitureReadiness'
import type { SceneObject } from './types'

const chair: SceneObject = { id: 'chair', type: 'chair', label: 'Chair', category: 'furniture', size: [0.46, 0.88, 0.46], position: [0, 0.44, 0] }

describe('visible furniture readiness', () => {
  it('waits for both demo and placed catalog geometry before enabling play', () => {
    const sofa = { ...chair, id: 'sofa', type: 'sofa', assetId: 'sofa_2seat' }
    expect(furnitureAssetsReady([chair, sofa], true, {})).toBe(false)
    expect(furnitureAssetsReady([chair, sofa], true, { [furnitureLoadKey(chair)]: true })).toBe(false)
    expect(furnitureAssetsReady([chair, sofa], true, { [furnitureLoadKey(chair)]: true, [furnitureLoadKey(sofa)]: true })).toBe(true)
    expect(furnitureAssetsReady([{ ...sofa, assetId: 'sofa_3seat' }], true, { [furnitureLoadKey(sofa)]: true })).toBe(false)
  })

  it('does not wait for procedural furniture or raw scan boxes', () => {
    expect(furnitureAssetsReady([{ ...chair, shape: 'visitor' }], true, {})).toBe(true)
    expect(furnitureAssetsReady([chair], false, {})).toBe(true)
  })
})
