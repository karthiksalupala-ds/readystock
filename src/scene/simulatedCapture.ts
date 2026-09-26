/**
 * A simulated LiDAR capture, for demos with no iPhone in the room.
 *
 * This emits the same versioned file the native RoomPlan exporter writes, so it
 * travels the validated `parseCapture` path rather than being cast straight onto
 * the graph. Only its `format` and `source` differ: nothing here was measured by
 * a sensor, and the HUD must never present it as if it were.
 *
 * The layout is an open-plan office floor, declared rather than randomised, so a
 * demo looks the same every time it is run and a test can lock the geometry down.
 */
import type { Vec3 } from './types'

export const SIMULATED_FORMAT = 'intelidar.simulated'

export type CaptureFile = {
  format: string
  version: number
  source: string
  room: { id: string; name: string; width: number; depth: number; height: number; units: 'm' }
  objects: CaptureFileObject[]
}

export type CaptureFileObject = {
  id: string
  type: string
  label: string
  category: 'furniture' | 'equipment' | 'opening' | 'structure'
  position: Vec3
  size: Vec3
  rotation: Vec3
  material?: string
  color?: string
  confidence?: number
  assetId?: string
}

export const SIMULATED_ROOM = { width: 18, depth: 11.6, height: 3.1 }

const QUARTER = Math.PI / 2
const HALF = Math.PI

/** Catalogue sizes, repeated here so a capture declares measured extents like a real scan. */
const ASSET_SIZE: Record<string, Vec3> = {
  desk_small: [1.1, 0.75, 0.56],
  chair_office: [0.645, 0.97, 0.585],
  chair_standard: [0.46, 0.88, 0.46],
  stool_round: [0.37, 0.446, 0.37],
  table_dining: [1.4, 0.75, 0.8],
  table_coffee: [1, 0.4, 0.55],
  table_side: [0.45, 0.5, 0.45],
  cabinet_simple: [0.94, 0.9, 0.463],
  shelf_open: [0.8, 1.8, 0.38],
  bookshelf: [0.8, 1.8, 0.38],
  sofa_2seat: [1.62, 0.86, 0.86],
  sofa_3seat: [2.18, 0.86, 0.86],
  lamp_floor: [0.45, 1.6, 0.45],
  trash_bin: [0.28, 0.32, 0.28],
  rug_simple: [1.6, 0.009, 2.2],
  monitor_desktop: [0.58, 0.478, 0.2],
  computer_desktop: [0.2, 0.413, 0.381],
  keyboard: [0.43, 0.024, 0.14],
  laptop: [0.34, 0.229, 0.262],
  tv_flat: [1.1, 0.808, 0.31],
  plant_potted_small: [0.21, 0.402, 0.21],
  plant_potted_medium: [0.375, 0.863, 0.34],
  plant_indoor_tall: [0.852, 1.74, 0.753],
  pot_empty: [0.3, 0.24, 0.3],
}

/** Type, label, and finish per catalogue asset, matching the reconstructor's vocabulary. */
const ASSET_STYLE: Record<string, { type: string; label: string; category: CaptureFileObject['category']; material: string }> = {
  desk_small: { type: 'table', label: 'Desk', category: 'furniture', material: 'wood' },
  chair_office: { type: 'chair', label: 'Office chair', category: 'furniture', material: 'fabric' },
  chair_standard: { type: 'chair', label: 'Chair', category: 'furniture', material: 'fabric' },
  stool_round: { type: 'chair', label: 'Stool', category: 'furniture', material: 'wood' },
  table_dining: { type: 'table', label: 'Table', category: 'furniture', material: 'wood' },
  table_coffee: { type: 'table', label: 'Coffee table', category: 'furniture', material: 'wood' },
  table_side: { type: 'table', label: 'Side table', category: 'furniture', material: 'wood' },
  cabinet_simple: { type: 'shelf', label: 'Cabinet', category: 'furniture', material: 'wood' },
  shelf_open: { type: 'shelf', label: 'Open shelf', category: 'furniture', material: 'wood' },
  bookshelf: { type: 'shelf', label: 'Bookshelf', category: 'furniture', material: 'wood' },
  sofa_2seat: { type: 'sofa', label: 'Two-seat sofa', category: 'furniture', material: 'fabric' },
  sofa_3seat: { type: 'sofa', label: 'Three-seat sofa', category: 'furniture', material: 'fabric' },
  lamp_floor: { type: 'lamp', label: 'Floor lamp', category: 'furniture', material: 'metal' },
  trash_bin: { type: 'bin', label: 'Waste bin', category: 'furniture', material: 'plastic' },
  rug_simple: { type: 'rug', label: 'Rug', category: 'furniture', material: 'fabric' },
  monitor_desktop: { type: 'monitor', label: 'Monitor', category: 'equipment', material: 'plastic' },
  computer_desktop: { type: 'computer', label: 'Desktop computer', category: 'equipment', material: 'metal' },
  keyboard: { type: 'keyboard', label: 'Keyboard', category: 'equipment', material: 'plastic' },
  laptop: { type: 'laptop', label: 'Laptop', category: 'equipment', material: 'metal' },
  tv_flat: { type: 'monitor', label: 'Television', category: 'equipment', material: 'plastic' },
  plant_potted_small: { type: 'plant', label: 'Small potted plant', category: 'furniture', material: 'fabric' },
  plant_potted_medium: { type: 'plant', label: 'Potted plant', category: 'furniture', material: 'fabric' },
  plant_indoor_tall: { type: 'plant', label: 'Tall indoor plant', category: 'furniture', material: 'fabric' },
  pot_empty: { type: 'plant', label: 'Plant pot', category: 'furniture', material: 'stone' },
}

/** A plausible per-object spread, so the HUD shows a scan's confidence and not a flat 1.0. */
const CONFIDENCE: Record<string, number> = {
  structure: 0.96, opening: 0.94, furniture: 0.89, equipment: 0.84,
}

type Placement = {
  asset: keyof typeof ASSET_SIZE
  /** Floor-plan centre in metres. Y is derived from the asset height unless `base` is given. */
  at: [number, number]
  /** Y of the object's underside; defaults to the floor. */
  base?: number
  /** Y rotation in radians. */
  turn?: number
  size?: Vec3
  color?: string
  label?: string
}

function place(id: string, item: Placement): CaptureFileObject {
  const size = item.size ?? ASSET_SIZE[item.asset]
  const style = ASSET_STYLE[item.asset]
  return {
    id,
    type: style.type,
    label: item.label ?? style.label,
    category: style.category,
    position: [item.at[0], (item.base ?? 0) + size[1] / 2, item.at[1]],
    size: [...size],
    rotation: [0, item.turn ?? 0, 0],
    material: style.material,
    ...(item.color ? { color: item.color } : {}),
    confidence: CONFIDENCE[style.category],
    assetId: item.asset,
  }
}

function opening(id: string, kind: 'door' | 'window', position: Vec3, size: Vec3): CaptureFileObject {
  return {
    id,
    type: kind,
    label: kind === 'door' ? 'Door' : 'Window',
    category: 'opening',
    position,
    size,
    rotation: [0, 0, 0],
    material: kind === 'door' ? 'wood' : 'glass',
    color: kind === 'door' ? '#5c4030' : '#7ec8e3',
    confidence: CONFIDENCE.opening,
  }
}

/** Desk pods: three columns of four, each with a chair, a screen, and its peripherals. */
function workstations(): CaptureFileObject[] {
  const objects: CaptureFileObject[] = []
  const columns = [-7.9, -6.1, -4.3]
  const rows = [-5, -3.1, -1.2, 0.7]
  const deskTop = ASSET_SIZE.desk_small[1]

  columns.forEach((x, column) => {
    rows.forEach((z, row) => {
      const pod = `sim:desk-${column + 1}-${row + 1}`
      objects.push(place(pod, { asset: 'desk_small', at: [x, z] }))
      objects.push(place(`${pod}-chair`, { asset: 'chair_office', at: [x, z + 0.78], turn: HALF }))

      // Alternate the kit per pod the way a real floor is never uniform.
      if ((column + row) % 2 === 0) {
        objects.push(place(`${pod}-monitor`, { asset: 'monitor_desktop', at: [x, z - 0.12], base: deskTop }))
        objects.push(place(`${pod}-keyboard`, { asset: 'keyboard', at: [x, z + 0.14], base: deskTop }))
        if (row % 2 === 0) {
          objects.push(place(`${pod}-tower`, { asset: 'computer_desktop', at: [x + 0.42, z - 0.05], base: deskTop }))
        }
      } else {
        objects.push(place(`${pod}-laptop`, { asset: 'laptop', at: [x - 0.1, z], base: deskTop }))
        if (row % 2 === 1) {
          objects.push(place(`${pod}-plant`, { asset: 'plant_potted_small', at: [x + 0.42, z - 0.08], base: deskTop }))
        }
      }
      if (row === 1) objects.push(place(`${pod}-bin`, { asset: 'trash_bin', at: [x + 0.72, z] }))
    })
  })
  return objects
}

/** Conference zone: a joined table, eight chairs, and a wall display. */
function conference(): CaptureFileObject[] {
  const objects: CaptureFileObject[] = [
    place('sim:conf-table-a', { asset: 'table_dining', at: [0.95, -3.6], label: 'Conference table' }),
    place('sim:conf-table-b', { asset: 'table_dining', at: [2.35, -3.6], label: 'Conference table' }),
    place('sim:conf-display', { asset: 'tv_flat', at: [1.65, -5.74], base: 1.15, size: [1.6, 0.92, 0.12], label: 'Wall display' }),
    place('sim:conf-plant', { asset: 'plant_indoor_tall', at: [4.1, -4.9] }),
  ]
  const seats = [0.6, 1.35, 2.1, 2.85]
  seats.forEach((x, index) => {
    objects.push(place(`sim:conf-chair-n${index + 1}`, { asset: 'chair_standard', at: [x, -4.45], turn: HALF }))
    objects.push(place(`sim:conf-chair-s${index + 1}`, { asset: 'chair_standard', at: [x, -2.75] }))
  })
  return objects
}

/** Lounge and reception: the zone a visitor sees first. */
function lounge(): CaptureFileObject[] {
  return [
    place('sim:lounge-rug', { asset: 'rug_simple', at: [4.3, 3.2], size: [3.4, 0.012, 4.2] }),
    place('sim:lounge-sofa-3', { asset: 'sofa_3seat', at: [4.3, 1.65], color: '#7086a3' }),
    place('sim:lounge-sofa-2', { asset: 'sofa_2seat', at: [2.45, 3.3], turn: QUARTER, color: '#467568' }),
    place('sim:lounge-coffee', { asset: 'table_coffee', at: [4.3, 3.1], size: [1.2, 0.4, 0.7] }),
    place('sim:lounge-side', { asset: 'table_side', at: [5.9, 1.9] }),
    place('sim:lounge-lamp', { asset: 'lamp_floor', at: [6.35, 3.45] }),
    place('sim:lounge-stool-1', { asset: 'stool_round', at: [7.05, 2.4] }),
    place('sim:lounge-stool-2', { asset: 'stool_round', at: [7.05, 3.75] }),
    place('sim:lounge-plant-tall', { asset: 'plant_indoor_tall', at: [5.1, 5.2] }),
    place('sim:lounge-plant-med', { asset: 'plant_potted_medium', at: [2.2, 5.25] }),
    place('sim:lounge-display', { asset: 'tv_flat', at: [8.95, 3.0], base: 0.95, size: [1.4, 0.8, 0.1], turn: QUARTER, label: 'Lounge television' }),
    place('sim:lounge-bin', { asset: 'trash_bin', at: [7.4, 1.4] }),
    place('sim:reception-desk', { asset: 'desk_small', at: [7.2, 5.15], size: [1.9, 0.76, 0.7], label: 'Reception desk' }),
    place('sim:reception-chair', { asset: 'chair_office', at: [7.2, 4.35], turn: HALF }),
    place('sim:reception-laptop', { asset: 'laptop', at: [7.2, 5.15], base: 0.76 }),
  ]
}

/** Kitchenette and break area, behind the desk bank. */
function kitchenette(): CaptureFileObject[] {
  const objects: CaptureFileObject[] = [
    place('sim:break-table', { asset: 'table_dining', at: [-6.5, 3.6], label: 'Break table' }),
    place('sim:break-plant', { asset: 'plant_indoor_tall', at: [-3.95, 4.6] }),
    place('sim:break-bin', { asset: 'trash_bin', at: [-4.3, 5.35] }),
    place('sim:break-pot', { asset: 'pot_empty', at: [-8.5, 3.1] }),
  ]
  ;[-8.3, -7.3, -6.3, -5.3].forEach((x, index) => {
    objects.push(place(`sim:kitchen-cabinet-${index + 1}`, { asset: 'cabinet_simple', at: [x, 5.52] }))
  })
  ;[[-7.2, 2.95], [-5.8, 2.95], [-7.2, 4.25], [-5.8, 4.25]].forEach(([x, z], index) => {
    objects.push(place(`sim:break-stool-${index + 1}`, { asset: 'stool_round', at: [x, z] }))
  })
  return objects
}

/** Storage run along the far wall. */
function storage(): CaptureFileObject[] {
  const objects: CaptureFileObject[] = []
  ;[-4.6, -3.7, -2.8, -1.9].forEach((z, index) => {
    objects.push(place(`sim:store-bookshelf-${index + 1}`, { asset: 'bookshelf', at: [8.75, z], turn: QUARTER }))
  })
  objects.push(place('sim:store-shelf', { asset: 'shelf_open', at: [8.75, -1], turn: QUARTER }))
  objects.push(place('sim:store-cabinet', { asset: 'cabinet_simple', at: [8.75, 0.1], turn: QUARTER }))
  objects.push(place('sim:store-plant', { asset: 'plant_potted_medium', at: [8.7, 1.2] }))
  return objects
}

function openings(): CaptureFileObject[] {
  const sill = 1.75
  const objects: CaptureFileObject[] = []
  // Glazing on the back wall, with the conference display's span left solid.
  ;[-6.5, -2.2, 6.4].forEach((x, index) => {
    objects.push(opening(`sim:window-back-${index + 1}`, 'window', [x, sill, -5.75], [2.4, 1.5, 0.1]))
  })
  ;[-3, 0.4].forEach((z, index) => {
    objects.push(opening(`sim:window-left-${index + 1}`, 'window', [-8.95, sill, z], [0.1, 1.5, 2.4]))
  })
  objects.push(opening('sim:door-main', 'door', [-1.6, 1.075, 5.74], [1.1, 2.15, 0.12]))
  objects.push(opening('sim:door-side', 'door', [3.3, 1.075, 5.74], [1.1, 2.15, 0.12]))
  return objects
}

/**
 * The whole floor, as a capture file.
 *
 * Returns a fresh object each call: callers hand it to `parseCapture`, which is
 * the only thing allowed to turn it into a scene graph.
 */
export function simulatedCaptureFile(): CaptureFile {
  return {
    format: SIMULATED_FORMAT,
    version: 1,
    source: 'simulated',
    room: {
      id: 'sim:floor-2',
      name: 'open-plan office floor',
      width: SIMULATED_ROOM.width,
      depth: SIMULATED_ROOM.depth,
      height: SIMULATED_ROOM.height,
      units: 'm',
    },
    objects: [
      ...workstations(),
      ...conference(),
      ...lounge(),
      ...kitchenette(),
      ...storage(),
      ...openings(),
    ],
  }
}

/** The capture as the bytes a device would have written, for download or import. */
export function simulatedCaptureJson(): string {
  return JSON.stringify(simulatedCaptureFile(), null, 2)
}
