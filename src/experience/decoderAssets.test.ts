// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decoderAssets } from '../../scripts/decoderAssets'

describe('local Draco assets', () => {
  it('maps only the decoder resources needed in dev and the production bundle', () => {
    const assets = decoderAssets()
    expect(assets.map(asset => asset.fileName)).toEqual([
      'decoders/draco/draco_wasm_wrapper.js', 'decoders/draco/draco_decoder.wasm', 'decoders/draco/draco_decoder.js',
    ])
    expect(assets.every(asset => asset.source.byteLength > 100)).toBe(true)
    expect(assets[1].source.subarray(0, 4)).toEqual(Buffer.from([0, 97, 115, 109]))
  })
})
