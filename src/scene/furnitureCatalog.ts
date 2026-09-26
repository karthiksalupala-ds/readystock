import manifest from '../../models/manifest.json'
import type { Vec3 } from './types'

const files = import.meta.glob(['../../models/{furniture,plants,electronics}/*.glb', '!../../models/furniture/door_simple.glb'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const LABELS: Record<string, string> = {
  table_cafe: 'Café table', chair_cafe: 'Café chair', stool_bar: 'Bar stool',
  counter_cafe: 'Stone café bar', coffee_machine: 'Espresso machine',
  chess_king: 'Chess king', chess_pawn: 'Chess pawn', books_stack: 'Stacked books',
  pendant_cafe: 'Silver pendant', mountain_art: 'Mountain artwork',
  track_ceiling: 'Ceiling spotlights', floor_oak_cafe: 'Oak floor',
  chair_standard: 'Dining chair', chair_office: 'Office chair', stool_round: 'Round stool',
  table_dining: 'Dining table', table_side: 'Side table', table_coffee: 'Coffee table',
  cabinet_simple: 'Cabinet', shelf_open: 'Open shelf', bookshelf: 'Bookshelf', desk_small: 'Desk',
  sofa_2seat: 'Two-seat sofa', sofa_3seat: 'Three-seat sofa', bed_single: 'Single bed', bed_double: 'Double bed',
  lamp_floor: 'Floor lamp', rug_simple: 'Rug', trash_bin: 'Waste bin',
  plant_potted_small: 'Small potted plant', plant_potted_medium: 'Medium potted plant', plant_indoor_tall: 'Tall indoor plant', pot_empty: 'Plant pot',
  tv_flat: 'Television', monitor_desktop: 'Desktop monitor', computer_desktop: 'Desktop computer', keyboard: 'Keyboard', laptop: 'Laptop',
}

function typeFor(id: string) {
  if (/^(chair|stool)/.test(id)) return 'chair'
  if (/^(table|desk)/.test(id)) return 'table'
  if (/^(shelf|bookshelf|cabinet)/.test(id)) return 'shelf'
  if (/^(tv|monitor)/.test(id)) return 'monitor'
  if (id.startsWith('plant')) return 'plant'
  return id.split('_')[0]
}

export type FurnitureAsset = {
  id: string
  name: string
  description: string
  category: 'furniture' | 'plants' | 'electronics'
  type: string
  size: Vec3
  url: string
}

/** Only props: avatars and architectural doors are not furniture renovation items. */
export const FURNITURE_CATALOG: FurnitureAsset[] = manifest.assets
  .filter((asset) => Boolean(LABELS[asset.id]))
  .map((asset) => ({
    id: asset.id, name: LABELS[asset.id], description: asset.description,
    category: asset.category as FurnitureAsset['category'], type: typeFor(asset.id),
    size: [asset.dimensions_m.width, asset.dimensions_m.height, asset.dimensions_m.depth],
    url: files[`../../models/${asset.file}`],
  }))

const BY_ID = new Map(FURNITURE_CATALOG.map((asset) => [asset.id, asset]))
export function furnitureAsset(id: string | null | undefined) { return id ? BY_ID.get(id) : undefined }
