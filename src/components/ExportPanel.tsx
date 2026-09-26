import { useRef, useState } from 'react'
import { downloadFile } from '../scene/download'
import { captureJsonFor, exportName, floorPlanSvg, objectScheduleCsv } from '../scene/exportScene'
import { exportGlb } from '../scene/exportModel'
import type { SceneGraph } from '../scene/types'

type Format = {
  id: string
  name: string
  extension: string
  type: string
  hint: string
  /** Slow enough to be worth saying so; the model is serialised before the download. */
  async?: boolean
}

const FORMATS: Format[] = [
  {
    id: 'scan',
    name: 'Scan file',
    extension: 'intelidar.json',
    type: 'application/json',
    hint: 'The scene graph. Opens again through Import scan, with your edits in place.',
  },
  {
    id: 'schedule',
    name: 'Object schedule',
    extension: 'csv',
    type: 'text/csv;charset=utf-8',
    hint: 'One row per object: type, finish, confidence, position, size, and footprint.',
  },
  {
    id: 'plan',
    name: 'Floor plan',
    extension: 'svg',
    type: 'image/svg+xml;charset=utf-8',
    hint: 'A dimensioned drawing to print or drop into a document.',
  },
  {
    id: 'model',
    name: '3D model',
    extension: 'glb',
    type: 'model/gltf-binary',
    hint: 'Boxes at measured size, labels attached. Opens in Blender, Unreal, or Import room.',
    async: true,
  },
]

export function ExportPanel({ graph, disabled = false }: { graph: SceneGraph | null; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  async function save(format: Format) {
    if (!graph) return
    setError(null)
    setSaved(null)
    setBusy(format.id)
    try {
      const name = exportName(graph, format.extension)
      // Everything slow happens before the download, which must stay in this click.
      const data = format.id === 'model'
        ? await exportGlb(graph)
        : format.id === 'schedule' ? objectScheduleCsv(graph)
          : format.id === 'plan' ? floorPlanSvg(graph)
            : captureJsonFor(graph)
      downloadFile(name, data as BlobPart, format.type)
      setSaved(name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not write this export. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return <>
    <button type="button" className="chip" disabled={disabled || !graph}
      onClick={() => { setError(null); setSaved(null); dialog.current?.showModal() }}>Export</button>
    <dialog ref={dialog} className="capture-import export-panel" aria-labelledby="export-title">
      <div className="capture-import-heading">
        <p className="panel-kicker">Export</p>
        <button type="button" aria-label="Close export" onClick={() => dialog.current?.close()}>×</button>
      </div>
      <h2 id="export-title">Take this room with you</h2>
      <p>{graph
        ? `${graph.room.name} · ${graph.room.width} × ${graph.room.depth} m · ${graph.objects.length} objects, exactly as the scene stands now.`
        : 'Load a scan first.'}</p>

      <ul className="export-formats">
        {FORMATS.map((format) => (
          <li key={format.id}>
            <button type="button" disabled={!graph || busy !== null} onClick={() => { void save(format) }}>
              <span className="export-name">{busy === format.id ? `Writing ${format.name.toLowerCase()}…` : format.name}</span>
              <span className="export-ext">.{format.extension}</span>
              <span className="export-hint">{format.hint}</span>
            </button>
          </li>
        ))}
      </ul>

      {saved && <p className="export-saved" role="status">Saved <strong>{saved}</strong>.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="appearance-note">Exports are written in your browser and never sent anywhere. The 3D model carries
        one box per object at its measured size, not the catalogue furniture you see in the viewer: that detail is a
        generated representation, not captured surface detail.</p>
    </dialog>
  </>
}
