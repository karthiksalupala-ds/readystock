/** Tiny deterministic room fixture shared by importer tests and browser tests. */
export function encodeGlb(document: object, binary = new Uint8Array()): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(document))
  const jsonSize = Math.ceil(json.length / 4) * 4
  const binarySize = Math.ceil(binary.length / 4) * 4
  const output = new ArrayBuffer(12 + 8 + jsonSize + (binarySize ? 8 + binarySize : 0))
  const view = new DataView(output)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, output.byteLength, true)
  view.setUint32(12, jsonSize, true)
  view.setUint32(16, 0x4e4f534a, true)
  const bytes = new Uint8Array(output)
  bytes.fill(0x20, 20, 20 + jsonSize)
  bytes.set(json, 20)
  if (binarySize) {
    view.setUint32(20 + jsonSize, binarySize, true)
    view.setUint32(24 + jsonSize, 0x004e4942, true)
    bytes.set(binary, 28 + jsonSize)
  }
  return output
}

export function createRoomFixtureGlb({ textured = false } = {}): ArrayBuffer {
  const positions: number[] = []
  const uvs: number[] = []
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d)
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
  }
  quad([-3, 0, -3], [-3, 0, 3], [3, 0, 3], [3, 0, -3])
  // The back wall has a 1m wide, 2.2m high doorway. No triangles fill its gap.
  quad([-3, 0, -3], [-0.5, 0, -3], [-0.5, 3, -3], [-3, 3, -3])
  quad([0.5, 0, -3], [3, 0, -3], [3, 3, -3], [0.5, 3, -3])
  quad([-0.5, 2.2, -3], [0.5, 2.2, -3], [0.5, 3, -3], [-0.5, 3, -3])
  quad([-3, 0, 3], [-3, 0, -3], [-3, 3, -3], [-3, 3, 3])
  quad([3, 0, -3], [3, 0, 3], [3, 3, 3], [3, 3, -3])
  const vertices = new Float32Array(positions)
  const textureCoords = new Float32Array(uvs)
  const binary = new Uint8Array(vertices.byteLength + textureCoords.byteLength)
  binary.set(new Uint8Array(vertices.buffer))
  binary.set(new Uint8Array(textureCoords.buffer), vertices.byteLength)
  return encodeGlb({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ translation: [10, 2, 20], children: [1] }, { mesh: 0, scale: [2, 2, 2] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: vertices.byteLength },
      { buffer: 0, byteOffset: vertices.byteLength, byteLength: textureCoords.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-3, 0, -3], max: [3, 3, 3] },
      { bufferView: 1, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    materials: [{
      doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [0.68, 0.73, 0.71, 1], roughnessFactor: 0.9, metallicFactor: 0, ...(textured ? { baseColorTexture: { index: 0 } } : {}) },
    }],
    ...(textured ? {
      textures: [{ source: 0 }],
      images: [{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' }],
    } : {}),
  }, binary)
}
