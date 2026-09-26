/**
 * The scene graph as a 3D model.
 *
 * What leaves here is the graph, not the picture of it: the room shell and one
 * box per object, at measured pose and size. The catalogue models in the viewer
 * are a generated representation — `docs/capture.md` is explicit that furniture
 * detail is not captured surface detail — so exporting them would ship invented
 * geometry as though it had been scanned. The boxes are what InteLiDar actually
 * knows, and each one carries its semantics in glTF `extras`, so the meaning
 * travels with the geometry rather than being left behind in the viewer.
 *
 * The result is a self-contained binary glTF: openable in Blender or Unreal, and
 * readable back by this app's own room importer.
 */
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { SceneGraph, SceneObject } from './types'

/** Enough to read as a surface and to stand on, without pretending to be a survey. */
const WALL_M = 0.05

const CATEGORY_COLOR: Record<string, string> = {
  structure: '#cfc9bd',
  furniture: '#b08968',
  equipment: '#4a525e',
  opening: '#7ec8e3',
}

const SHELL_COLOR = { floor: '#b08968', wall: '#d9d3c7', ceiling: '#ece8df' }

function box(
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  color: string,
  materials: Map<string, MeshStandardMaterial>,
  extras?: Record<string, unknown>,
): Mesh {
  let material = materials.get(color)
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 })
    material.name = `IDAR_${color.replace('#', '')}`
    materials.set(color, material)
  }
  const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), material)
  mesh.name = name
  mesh.position.set(position[0], position[1], position[2])
  if (extras) mesh.userData = extras
  return mesh
}

/** glTF node names must be distinct to survive a round trip through most tools. */
function nodeName(object: SceneObject, taken: Set<string>): string {
  const base = (object.label || object.type || 'object').replace(/[^\w\-. ]+/g, '').trim() || 'object'
  let name = base
  for (let n = 2; taken.has(name); n += 1) name = `${base} ${n}`
  taken.add(name)
  return name
}

/**
 * The exportable scene, as three.js objects.
 *
 * Split out from the export itself so the geometry can be checked without
 * serialising anything.
 */
export function buildExportScene(graph: SceneGraph): Group {
  const { room, objects } = graph
  const materials = new Map<string, MeshStandardMaterial>()
  const root = new Group()
  root.name = room.name || 'Room'
  root.userData = {
    generator: 'InteLiDar',
    room: { id: room.id, name: room.name, width: room.width, depth: room.depth, height: room.height, units: 'm' },
    source: graph.source ?? 'demo',
    objectCount: objects.length,
    geometry: 'Bounding boxes from the semantic scene graph, not captured surface detail.',
  }

  const shell = new Group()
  shell.name = 'Shell'
  shell.add(box('Floor', [room.width, WALL_M, room.depth], [0, -WALL_M / 2, 0], SHELL_COLOR.floor, materials))
  shell.add(box('Ceiling', [room.width, WALL_M, room.depth], [0, room.height + WALL_M / 2, 0], SHELL_COLOR.ceiling, materials))
  const halfW = room.width / 2 + WALL_M / 2
  const halfD = room.depth / 2 + WALL_M / 2
  shell.add(box('Wall north', [room.width + WALL_M * 2, room.height, WALL_M], [0, room.height / 2, -halfD], SHELL_COLOR.wall, materials))
  shell.add(box('Wall south', [room.width + WALL_M * 2, room.height, WALL_M], [0, room.height / 2, halfD], SHELL_COLOR.wall, materials))
  shell.add(box('Wall west', [WALL_M, room.height, room.depth], [-halfW, room.height / 2, 0], SHELL_COLOR.wall, materials))
  shell.add(box('Wall east', [WALL_M, room.height, room.depth], [halfW, room.height / 2, 0], SHELL_COLOR.wall, materials))
  root.add(shell)

  const contents = new Group()
  contents.name = 'Objects'
  const taken = new Set<string>()
  for (const object of objects) {
    const color = object.color ?? CATEGORY_COLOR[object.category] ?? CATEGORY_COLOR.furniture
    const mesh = box(
      nodeName(object, taken),
      [object.size[0], object.size[1], object.size[2]],
      [object.position[0], object.position[1], object.position[2]],
      color,
      materials,
      {
        intelidarId: object.id,
        type: object.type,
        label: object.label,
        category: object.category,
        ...(object.material ? { material: object.material } : {}),
        ...(object.confidence != null ? { confidence: object.confidence } : {}),
        ...(object.assetId ? { assetId: object.assetId } : {}),
      },
    )
    const [rx, ry, rz] = object.rotation ?? [0, 0, 0]
    mesh.rotation.set(rx, ry, rz)
    contents.add(mesh)
  }
  root.add(contents)
  return root
}

/** Free the geometry and materials a built scene holds; it is never rendered. */
export function disposeExportScene(root: Object3D): void {
  const materials = new Set<MeshStandardMaterial>()
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return
    node.geometry.dispose()
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material as MeshStandardMaterial)
    }
  })
  for (const material of materials) material.dispose()
}

/**
 * The scene as a self-contained binary glTF.
 *
 * Binary and embedded on purpose: the room importer rejects any GLB that points
 * at a file beside it, and a single file is what a person can actually send.
 */
export async function exportGlb(graph: SceneGraph): Promise<ArrayBuffer> {
  const root = buildExportScene(graph)
  try {
    const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false, includeCustomExtensions: false })
    if (!(result instanceof ArrayBuffer)) throw new Error('The model exporter did not return binary glTF.')
    return result
  } finally {
    disposeExportScene(root)
  }
}
