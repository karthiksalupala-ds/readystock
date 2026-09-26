import { FINISHES, SHAPES, SWATCHES, shapeFor, type AppearancePatch } from '../scene/appearance'
import type { SceneGraph } from '../scene/types'
import { useSpecular } from './useSpecular'

export function AppearanceEditor({ graph, selectedIds, onSelect, onChange }: {
  graph: SceneGraph
  selectedIds: string[]
  onSelect: (id: string) => void
  onChange: (id: string, patch: AppearancePatch) => void
}) {
  const specular = useSpecular()
  const selected = selectedIds.length === 1 ? graph.objects.find((item) => item.id === selectedIds[0]) : undefined
  return (
    <aside className="appearance-editor glass" aria-label="Object appearance" {...specular}>
      <p className="panel-kicker">Appearance</p>
      <label htmlFor="appearance-object">Object</label>
      <select id="appearance-object" value={selected?.id ?? ''} onChange={(event) => onSelect(event.target.value)}>
        <option value="" disabled>Select an object</option>
        {graph.objects.map((object, index) => <option key={object.id} value={object.id}>{object.label} · {index + 1}</option>)}
      </select>
      {selected ? <>
        {!selected.assetId && <>
        <label htmlFor="appearance-shape">Shape</label>
        <select id="appearance-shape" value={shapeFor(selected)} onChange={(event) => onChange(selected.id, { shape: event.target.value })}>
          {(SHAPES[selected.type] ?? ['rounded', 'rectangular']).map((shape) => <option key={shape} value={shape}>{shape[0].toUpperCase() + shape.slice(1)}</option>)}
        </select>
        {selected.type !== 'window' && <>
          <label htmlFor="appearance-material">Material</label>
          <select id="appearance-material" value={selected.material ?? 'wood'} onChange={(event) => onChange(selected.id, { material: event.target.value })}>
            {FINISHES.map((finish) => <option key={finish} value={finish}>{finish[0].toUpperCase() + finish.slice(1)}</option>)}
          </select>
        </>}
        </>}
        <div className="appearance-color">
          <label htmlFor="appearance-color">{selected.type === 'window' ? 'Glass tint' : 'Color'}</label>
          <input id="appearance-color" type="color" value={selected.color ?? '#a58a68'} onChange={(event) => onChange(selected.id, { color: event.target.value })} />
        </div>
        <div className="appearance-swatches" aria-label="Color presets">
          {SWATCHES.map((color) => <button key={color} type="button" aria-label={`Use color ${color}`} aria-pressed={selected.color?.toLowerCase() === color} style={{ background: color }} onClick={() => onChange(selected.id, { color })} />)}
        </div>
        {selected.assetId && <button type="button" className="reset-model-color" onClick={() => onChange(selected.id, { color: null })}>Restore model colors</button>}
        <p className="appearance-note">{selected.assetId ? 'Tint applies to the whole model. The library geometry and dimensions are preserved.' : 'Changes apply live to this object. Dimensions stay true to the scan.'}</p>
      </> : <p className="appearance-note">Select an object to explore its shapes, textures, and colors.</p>}
    </aside>
  )
}
