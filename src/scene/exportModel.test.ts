import { describe, expect, it } from 'vitest'
import { Mesh, type BoxGeometry, type Group } from 'three'
import { buildExportScene, disposeExportScene, exportGlb } from './exportModel'
import { parseCapture } from './importCapture'
import { simulatedCaptureJson } from './simulatedCapture'
import { MAX_ROOM_TRIANGLES } from '../room/importRoom'
import type { SceneGraph } from './types'

const floor = parseCapture(simulatedCaptureJson())

function named(root: Group, name: string) {
  let found: Mesh | undefined
  root.traverse((node) => { if (node instanceof Mesh && node.name === name) found = node })
  return found
}

describe('building the exportable scene', () => {
  const root = buildExportScene(floor)

  it('carries the room shell and one box per object', () => {
    const meshes: Mesh[] = []
    root.traverse((node) => { if (node instanceof Mesh) meshes.push(node) })
    // Floor, ceiling, four walls, and the contents.
    expect(meshes).toHaveLength(6 + floor.objects.length)
  })

  it('places each box at its measured pose and size', () => {
    const sofa = floor.objects.find((object) => object.id === 'sim:lounge-sofa-3')!
    const mesh = named(root, 'Three-seat sofa')!
    expect(mesh.position.toArray()).toEqual(sofa.position)
    const { width, height, depth } = (mesh.geometry as BoxGeometry).parameters
    expect([width, height, depth]).toEqual(sofa.size)
  })

  it('turns a box the way the graph turns it', () => {
    const shelf = floor.objects.find((object) => object.id === 'sim:store-bookshelf-1')!
    const mesh = named(root, 'Bookshelf')!
    expect(mesh.rotation.y).toBeCloseTo(shelf.rotation![1])
  })

  it('sends the semantics along with the geometry', () => {
    const mesh = named(root, 'Three-seat sofa')!
    expect(mesh.userData).toMatchObject({
      intelidarId: 'sim:lounge-sofa-3', type: 'sofa', category: 'furniture', label: 'Three-seat sofa',
    })
    expect(root.userData.room).toMatchObject({ name: 'open-plan office floor', width: 18, units: 'm' })
    expect(root.userData.geometry).toMatch(/not captured surface detail/i)
  })

  it('gives every node a distinct name, however many share a label', () => {
    const names: string[] = []
    root.traverse((node) => { if (node instanceof Mesh) names.push(node.name) })
    expect(new Set(names).size).toBe(names.length)
  })

  it('shares one material per colour instead of one per object', () => {
    const materials = new Set()
    root.traverse((node) => { if (node instanceof Mesh) materials.add(node.material) })
    expect(materials.size).toBeLessThan(12)
  })

  it('stays far inside the room importer triangle budget', () => {
    const meshes: Mesh[] = []
    root.traverse((node) => { if (node instanceof Mesh) meshes.push(node) })
    expect(meshes.length * 12).toBeLessThan(MAX_ROOM_TRIANGLES)
  })

  it('releases its geometry once it has been written', () => {
    const scratch = buildExportScene(floor)
    const mesh = named(scratch, 'Three-seat sofa')!
    let disposed = false
    mesh.geometry.addEventListener('dispose', () => { disposed = true })
    disposeExportScene(scratch)
    expect(disposed).toBe(true)
  })
})

describe('writing the glb', () => {
  it('writes a self-contained binary glTF 2 the room importer accepts', async () => {
    const bytes = await exportGlb(floor)
    const view = new DataView(bytes)
    expect(view.getUint32(0, true)).toBe(0x46546c67) // "glTF"
    expect(view.getUint32(4, true)).toBe(2)
    expect(view.getUint32(8, true)).toBe(bytes.byteLength)

    const length = view.getUint32(12, true)
    expect(view.getUint32(16, true)).toBe(0x4e4f534a) // JSON chunk first
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)))
    expect(json.asset.version).toBe('2.0')
    // The importer refuses a file that points at anything beside it, or that moves.
    expect(JSON.stringify(json)).not.toMatch(/"uri":"(?!data:)/)
    expect(json.animations ?? []).toHaveLength(0)
    expect(json.skins ?? []).toHaveLength(0)
    for (const mesh of json.meshes ?? []) {
      for (const primitive of mesh.primitives) {
        expect(primitive.mode === undefined || primitive.mode === 4).toBe(true)
        expect(primitive.targets ?? []).toHaveLength(0)
      }
    }
    for (const extension of json.extensionsRequired ?? []) {
      expect(extension).not.toBe('KHR_texture_basisu')
    }
  })

  it('keeps the semantics readable in the file itself', async () => {
    const bytes = await exportGlb(floor)
    const length = new DataView(bytes).getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)))
    const node = json.nodes.find((item: { name?: string }) => item.name === 'Three-seat sofa')
    expect(node.extras).toMatchObject({ intelidarId: 'sim:lounge-sofa-3', type: 'sofa' })
  })

  it('writes an empty room without complaint', async () => {
    const empty: SceneGraph = { room: floor.room, objects: [] }
    await expect(exportGlb(empty)).resolves.toBeInstanceOf(ArrayBuffer)
  })
})
