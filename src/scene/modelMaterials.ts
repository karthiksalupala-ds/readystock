import { Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat } from 'three'

/** Neutral, seamless surface maps: tint stays independent of the texture. */
export function surfaceTexture(kind: string): DataTexture {
  const size = 128
  const data = new Uint8Array(size * size * 4)
  let seed = 173
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const noise = seed / 4294967296
      const wave = Math.sin((x / size) * Math.PI * 2)
      let value = 0.9 + noise * 0.06
      if (kind === 'wood') {
        const grain = Math.sin(y / size * Math.PI * 32 + wave * 2 + Math.sin(x / size * Math.PI * 4) * 0.6)
        value = 0.83 + grain * 0.055 + noise * 0.045
      } else if (kind === 'fabric') {
        value = 0.7 + ((x % 4 < 2) !== (y % 4 < 2) ? 0.2 : 0) + noise * 0.08
      } else if (kind === 'leather') {
        value = 0.78 + noise * 0.18
      } else if (kind === 'metal') {
        value = 0.88 + Math.sin(y * Math.PI / 2) * 0.035 + noise * 0.035
      } else if (kind === 'stone') {
        value = 0.8 + Math.sin(x / size * Math.PI * 8 + Math.sin(y / size * Math.PI * 4) * 2) * 0.07 + noise * 0.08
      }
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = Math.round(value * 255)
      data[i + 3] = 255
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.repeat.set(kind === 'fabric' ? 3 : 1, kind === 'fabric' ? 3 : 1)
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

export function makeSurface(color: string, finish: string, map?: DataTexture) {
  const material = new MeshStandardMaterial({
    color, map, bumpMap: map,
    bumpScale: finish === 'fabric' ? 0.008 : finish === 'wood' ? 0.004 : 0.001,
    roughness: finish === 'metal' ? 0.32 : finish === 'leather' ? 0.48 : finish === 'plastic' ? 0.38 : 0.78,
    metalness: finish === 'metal' ? 0.7 : 0,
  })
  material.userData.baseColor = new Color(color)
  material.userData.baseOpacity = 1
  return material
}
