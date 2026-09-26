import { useState } from 'react'
import { FurniturePreview } from '../scene/CatalogFurniture'
import { FURNITURE_CATALOG, furnitureAsset } from '../scene/furnitureCatalog'
import { canDragObject } from '../scene/editScene'
import type { SceneGraph } from '../scene/types'
import { useSpecular } from './useSpecular'

export function RenovationPanel({ graph, selectedIds, canUndo, message, onSelect, onAdd, onRemove, onUndo, onRotate, onAppearance }: {
  graph: SceneGraph
  selectedIds: string[]
  canUndo: boolean
  message: string | null
  onSelect: (id: string) => void
  onAdd: (assetId: string, baseHeight: number) => void
  onRemove: (id: string) => void
  onUndo: () => void
  onRotate: (id: string) => void
  onAppearance: () => void
}) {
  const specular = useSpecular()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [assetId, setAssetId] = useState('sofa_2seat')
  const [baseHeight, setBaseHeight] = useState('0')
  const selected = selectedIds.length === 1 ? graph.objects.find((object) => object.id === selectedIds[0]) : undefined
  const asset = furnitureAsset(assetId)!
  const entries = FURNITURE_CATALOG.filter((item) => (category === 'all' || item.category === category) && `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
  return <aside className="renovation-panel glass" aria-label="Renovation" {...specular}>
    <div className="renovation-heading"><div><p className="panel-kicker">Plan your room</p><h2>Renovation</h2></div>
      <button type="button" className="renovation-undo" onClick={onUndo} disabled={!canUndo}>Undo</button>
    </div>
    <p className="renovation-intro">Add from the model library, then drag furniture into place.</p>
    <label htmlFor="renovation-object">Selected in room</label>
    <select id="renovation-object" value={selected?.id ?? ''} onChange={(event) => onSelect(event.target.value)}>
      <option value="" disabled>Select furniture to change</option>
      {graph.objects.map((object, i) => <option key={object.id} value={object.id}>{object.label} · {i + 1}</option>)}
    </select>
    <div className="renovation-actions">
      <button type="button" disabled={!selected || !canDragObject(selected)} onClick={() => selected && onRotate(selected.id)}>Rotate 90°</button>
      <button type="button" disabled={!selected} onClick={onAppearance}>Appearance</button>
      <button type="button" className="remove-furniture" disabled={!selected || !canDragObject(selected)} onClick={() => selected && onRemove(selected.id)}>Remove</button>
    </div>
    {selected && !canDragObject(selected) && <p className="appearance-note">Doors, windows, and structure stay fixed.</p>}
    {message && <p className="renovation-message" role="status">{message}</p>}
    <div className="renovation-library-head"><h3>Furniture library</h3><span>{entries.length} models</span></div>
    <input type="search" aria-label="Search furniture" placeholder="Search sofas, chairs, plants…" value={query} onChange={(event) => setQuery(event.target.value)} />
    <select aria-label="Furniture category" value={category} onChange={(event) => setCategory(event.target.value)}>
      <option value="all">All categories</option><option value="furniture">Furniture</option><option value="plants">Plants</option><option value="electronics">Electronics</option>
    </select>
    <div className="furniture-catalog" aria-label="Furniture models">
      {entries.map((item) => <button type="button" key={item.id} aria-pressed={assetId === item.id} onClick={() => setAssetId(item.id)}>
        <span>{item.name}</span><small>{item.size[0].toFixed(2)} × {item.size[2].toFixed(2)} m</small>
      </button>)}
      {!entries.length && <p className="appearance-note">No matching models. Try a different search.</p>}
    </div>
    <FurniturePreview assetId={assetId} />
    <div className="catalog-detail"><strong>{asset.name}</strong><span>{asset.size[0].toFixed(2)} W × {asset.size[2].toFixed(2)} D × {asset.size[1].toFixed(2)} H m</span></div>
    <label htmlFor="furniture-base-height">Base height (m)</label>
    <input id="furniture-base-height" type="number" min="0" max={Math.max(0, graph.room.height - asset.size[1])} step="0.05" value={baseHeight} onChange={(event) => setBaseHeight(event.target.value)} />
    <p className="appearance-note">Use 0 for the floor, or a tabletop’s height for electronics. Placement checks space; dragging and rotation allow layout experiments.</p>
    <button type="button" className="add-furniture" disabled={baseHeight.trim() === '' || !Number.isFinite(Number(baseHeight))} onClick={() => onAdd(asset.id, Number(baseHeight))}>Add {asset.name}</button>
    <p className="appearance-note">Undo restores the last add or remove. Changes last for this page session.</p>
  </aside>
}
