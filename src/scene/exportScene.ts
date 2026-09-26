/**
 * Getting a room back out of InteLiDar.
 *
 * Scans have always come in and never left. These are the three text exports of
 * a scene graph — the scan file it can be re-imported from, the schedule a
 * spreadsheet can read, and the plan a person can print — each a pure function
 * of the graph so they can be tested without a canvas or a download.
 *
 * The graph is the product, so every one of these describes the graph as it
 * stands: measured poses plus whatever the user moved, added, or restyled.
 */
import type { CaptureFile, CaptureFileObject } from './simulatedCapture'
import type { SceneGraph, SceneObject } from './types'

/**
 * Provenance survives the round trip.
 *
 * A room measured by a device stays `roomplan` however much furniture was
 * dragged around it: the geometry still came off a sensor. Anything else —
 * the demo fixture, the generated floor — is generated geometry, which is
 * exactly what `simulated` means, and is never promoted to a measurement.
 */
function provenance(graph: SceneGraph): { format: string; source: string } {
  return graph.source === 'roomplan'
    ? { format: 'intelidar.roomplan', source: 'roomplan' }
    : { format: 'intelidar.simulated', source: 'simulated' }
}

/** Optional fields are omitted when absent; the importer rejects an explicit null. */
function present<T>(value: T | null | undefined, key: string): Record<string, T> {
  return value === null || value === undefined ? {} : { [key]: value } as Record<string, T>
}

function captureObject(object: SceneObject): CaptureFileObject {
  return {
    id: object.id,
    type: object.type,
    label: object.label,
    category: object.category as CaptureFileObject['category'],
    position: [...object.position],
    size: [...object.size],
    rotation: [...(object.rotation ?? [0, 0, 0])],
    ...present(object.material, 'material'),
    ...present(object.color, 'color'),
    ...present(object.shape, 'shape'),
    ...present(object.confidence, 'confidence'),
    ...present(object.assetId, 'assetId'),
  } as CaptureFileObject
}

/** The scene as a capture file, in the format `parseCapture` reads back. */
export function captureFileFor(graph: SceneGraph): CaptureFile {
  const { format, source } = provenance(graph)
  return {
    format,
    version: 1,
    source,
    room: { ...graph.room, units: 'm' },
    objects: graph.objects.map(captureObject),
  }
}

export function captureJsonFor(graph: SceneGraph): string {
  return JSON.stringify(captureFileFor(graph), null, 2)
}

const CSV_COLUMNS = [
  'id', 'type', 'label', 'category', 'material', 'color', 'confidence',
  'x_m', 'y_m', 'z_m', 'width_m', 'height_m', 'depth_m', 'footprint_m2', 'rotation_deg', 'asset_id',
] as const

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Metres to three decimals: a millimetre is finer than any of this is accurate. */
function metres(value: number): number {
  return Math.round(value * 1000) / 1000
}

function degrees(radians: number): number {
  return Math.round(((radians * 180) / Math.PI) * 10) / 10
}

/**
 * One row per object, for a spreadsheet, an inventory, or a facilities record.
 *
 * This is the export behind "searchable equipment in space": every object with
 * its type, its finish, how confident the reconstructor was, and where and how
 * big it is.
 */
export function objectScheduleCsv(graph: SceneGraph): string {
  const rows = graph.objects.map((object) => [
    object.id,
    object.type,
    object.label,
    object.category,
    object.material ?? '',
    object.color ?? '',
    object.confidence ?? '',
    metres(object.position[0]), metres(object.position[1]), metres(object.position[2]),
    metres(object.size[0]), metres(object.size[1]), metres(object.size[2]),
    metres(object.size[0] * object.size[2]),
    degrees(object.rotation?.[1] ?? 0),
    object.assetId ?? '',
  ].map(csvCell).join(','))
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n'
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character])
}

/** Drawing scale. Big enough to read a chair, small enough to print a floor. */
const PX_PER_M = 80
const MARGIN = 96
const TITLE_H = 108

/** Round to a tenth of a millimetre so the file has no floating-point noise in it. */
function px(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * A dimensioned top-down plan of the room.
 *
 * Drawn looking down, +x to the right and +z down the page, so a Y rotation in
 * the graph becomes the negative of itself on the page.
 *
 * It is a drawing of the scene graph, not a survey: the shell is an enclosing
 * rectangle and every object is its bounding box. The title block says so,
 * because a plan is exactly the kind of artifact someone forwards without the
 * caveat attached.
 */
export function floorPlanSvg(graph: SceneGraph): string {
  const { room, objects } = graph
  const planW = room.width * PX_PER_M
  const planH = room.depth * PX_PER_M
  const width = px(planW + MARGIN * 2)
  const height = px(planH + MARGIN * 2 + TITLE_H)
  const area = Math.round(room.width * room.depth * 10) / 10

  // Room-space metres to page pixels, with the room centred under the title block.
  const toX = (x: number) => px(MARGIN + (x + room.width / 2) * PX_PER_M)
  const toY = (z: number) => px(MARGIN + (z + room.depth / 2) * PX_PER_M)

  const shapes = objects.map((object) => {
    const w = px(object.size[0] * PX_PER_M)
    const d = px(object.size[2] * PX_PER_M)
    const turn = px(-degrees(object.rotation?.[1] ?? 0))
    const cx = toX(object.position[0])
    const cy = toY(object.position[2])
    const kind = object.category === 'opening' ? 'opening' : object.category === 'equipment' ? 'equipment' : 'furniture'
    // Plan convention: what is not on the floor is drawn dashed, so a monitor on a
    // desk and a display on a wall read as over the plan rather than in it.
    const klass = isRaised(object) ? `${kind} raised` : kind
    const title = `${object.label} · ${metres(object.size[0])} × ${metres(object.size[2])} m`
    return `    <g transform="translate(${cx} ${cy}) rotate(${turn})">
      <title>${xml(title)}</title>
      <rect class="${klass}" x="${px(-w / 2)}" y="${px(-d / 2)}" width="${w}" height="${d}" rx="2" />
    </g>`
  })

  const labels = planLabels(objects).map((object) =>
    `    <text class="tag" x="${toX(object.position[0])}" y="${px(toY(object.position[2]) + 4)}">${xml(object.label)}</text>`)

  const grid: string[] = []
  for (let x = 1; x < room.width; x += 1) grid.push(`    <line class="grid" x1="${toX(x - room.width / 2)}" y1="${toY(-room.depth / 2)}" x2="${toX(x - room.width / 2)}" y2="${toY(room.depth / 2)}" />`)
  for (let z = 1; z < room.depth; z += 1) grid.push(`    <line class="grid" x1="${toX(-room.width / 2)}" y1="${toY(z - room.depth / 2)}" x2="${toX(room.width / 2)}" y2="${toY(z - room.depth / 2)}" />`)

  const dimY = px(toY(room.depth / 2) + 44)
  const dimX = px(toX(room.width / 2) + 44)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(`Floor plan of ${room.name}`)}">
  <style>
    .sheet { fill: #fbfaf7; }
    .shell { fill: #ffffff; stroke: #1b1f24; stroke-width: 3; }
    .grid { stroke: #e2e0da; stroke-width: 1; }
    .furniture { fill: #d8d2c6; stroke: #6a6257; stroke-width: 1.4; }
    .equipment { fill: #cdd6dd; stroke: #5a6b78; stroke-width: 1.4; }
    .opening { fill: #8fd0e6; stroke: #2f6f88; stroke-width: 1.4; }
    .raised { fill-opacity: 0.35; stroke-dasharray: 4 3; }
    .dim { stroke: #1b1f24; stroke-width: 1.2; }
    text { font-family: "Helvetica Neue", Arial, sans-serif; fill: #1b1f24; }
    .tag { font-size: 11px; text-anchor: middle; fill: #3a3630; }
    .dim-text { font-size: 14px; text-anchor: middle; }
    .title { font-size: 26px; font-weight: 600; }
    .meta { font-size: 14px; fill: #5c5852; }
    .caveat { font-size: 12px; fill: #7a746c; }
  </style>
  <rect class="sheet" x="0" y="0" width="${width}" height="${height}" />

  <g>
${grid.join('\n')}
    <rect class="shell" x="${toX(-room.width / 2)}" y="${toY(-room.depth / 2)}" width="${px(planW)}" height="${px(planH)}" />
${shapes.join('\n')}
${labels.join('\n')}
  </g>

  <g>
    <line class="dim" x1="${toX(-room.width / 2)}" y1="${dimY}" x2="${toX(room.width / 2)}" y2="${dimY}" />
    <text class="dim-text" x="${px((toX(-room.width / 2) + toX(room.width / 2)) / 2)}" y="${px(dimY + 20)}">${room.width} m</text>
    <line class="dim" x1="${dimX}" y1="${toY(-room.depth / 2)}" x2="${dimX}" y2="${toY(room.depth / 2)}" />
    <text class="dim-text" x="${dimX}" y="${px((toY(-room.depth / 2) + toY(room.depth / 2)) / 2)}" transform="rotate(-90 ${dimX} ${px((toY(-room.depth / 2) + toY(room.depth / 2)) / 2)})">${room.depth} m</text>
  </g>

  <g transform="translate(${MARGIN} ${px(height - TITLE_H + 24)})">
    <text class="title" x="0" y="0">${xml(room.name)}</text>
    <text class="meta" x="0" y="26">${room.width} × ${room.depth} m · ${area} m² · ${room.height} m high · ${objects.length} objects</text>
    <text class="caveat" x="0" y="48">InteLiDar semantic scene graph. Shell is an enclosing rectangle and each object its bounding box; dashed outlines sit above the floor. Not a survey drawing.</text>
  </g>
</svg>
`
}

/** Anything whose underside clears the floor is drawn as being over the plan. */
function isRaised(object: SceneObject): boolean {
  return object.position[1] - object.size[1] / 2 > 0.4
}

/** An object's footprint on the page, after its own turn about Y. */
function planFootprint(object: SceneObject): { w: number; d: number } {
  const turn = object.rotation?.[1] ?? 0
  const cos = Math.abs(Math.cos(turn))
  const sin = Math.abs(Math.sin(turn))
  const [w, , d] = object.size
  return { w: w * cos + d * sin, d: w * sin + d * cos }
}

/**
 * Which objects get named on the drawing.
 *
 * Three rules, all learned from looking at the thing. A name needs a footprint
 * wide enough to sit inside, measured after the object's rotation, or a turned
 * bookshelf pushes its name through the wall. No two names may land on top of
 * each other, largest first, since that is the one a reader is looking for.
 * And a floor covering is never named: it is the biggest thing in its corner and
 * would take the label off every piece standing on it — the same reason a rug is
 * not an obstacle to the placer or to the assistant. Everything else is in the
 * schedule.
 */
function planLabels(objects: SceneObject[]): SceneObject[] {
  const candidates = objects
    .filter((object) => {
      const { w, d } = planFootprint(object)
      return !isRaised(object) && object.type !== 'rug' && w * PX_PER_M > 54 && d * PX_PER_M > 26
    })
    .sort((a, b) => planFootprint(b).w * planFootprint(b).d - planFootprint(a).w * planFootprint(a).d)

  const placed: [number, number][] = []
  return candidates.filter((object) => {
    const x = object.position[0] * PX_PER_M
    const z = object.position[2] * PX_PER_M
    if (placed.some(([px0, pz0]) => Math.abs(px0 - x) < 62 && Math.abs(pz0 - z) < 15)) return false
    placed.push([x, z])
    return true
  })
}

/** A filename stem from a room name: lowercase, hyphenated, and safe on every OS. */
export function slug(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'room'
}

export function exportName(graph: SceneGraph, extension: string): string {
  return `${slug(graph.room.name)}.${extension}`
}
