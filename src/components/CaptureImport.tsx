import { useRef, useState, type ChangeEvent } from 'react'
import { MAX_CAPTURE_BYTES, parseCapture } from '../scene/importCapture'
import { simulatedCaptureJson } from '../scene/simulatedCapture'
import { downloadFile } from '../scene/download'
import type { SceneGraph } from '../scene/types'

export function CaptureImport({ onImport, disabled = false }: { onImport: (graph: SceneGraph) => void; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setReading(true)
    try {
      if (file.size > MAX_CAPTURE_BYTES) throw new Error('The scan must be smaller than 5 MB.')
      onImport(parseCapture(await file.text()))
      dialog.current?.close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read this scan. Please try again.')
    } finally { setReading(false) }
  }
  /** The generated floor takes the same validated route as a file off the device. */
  function loadSimulated() {
    setError(null)
    try {
      onImport(parseCapture(simulatedCaptureJson()))
      dialog.current?.close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build the simulated scan.')
    }
  }
  function downloadSimulated() {
    downloadFile('simulated-office-floor.intelidar.json', simulatedCaptureJson(), 'application/json')
  }
  return <>
    <button type="button" className="chip" disabled={disabled} onClick={() => { setError(null); dialog.current?.showModal() }}>Import scan</button>
    <dialog ref={dialog} className="capture-import" aria-labelledby="capture-import-title">
      <div className="capture-import-heading">
        <p className="panel-kicker">iPhone LiDAR</p>
        <button type="button" aria-label="Close scan import" onClick={() => dialog.current?.close()}>×</button>
      </div>
      <h2 id="capture-import-title">Bring your room into ReadyStock AI</h2>
      <p>Scan with ReadyStock AI Capture on a LiDAR-equipped iPhone, then open your saved scan here.</p>
      <ol>
        <li>In the iOS app, tap <strong>Start scan</strong> and walk around the room.</li>
        <li>Tap <strong>Finish</strong>, then <strong>Export scan → Save to Files</strong>.</li>
        <li>Choose the saved <strong>.intelidar.json</strong> file below.</li>
      </ol>
      <label className="capture-import-file">{reading ? 'Reading scan…' : 'Choose scan from Files'}
        <input type="file" accept=".json,application/json" aria-label="Choose scan from Files" disabled={reading} onChange={(event) => { void readFile(event) }} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="capture-import-simulated">
        <p className="panel-kicker">No iPhone to hand</p>
        <p>Load a generated <strong>open-plan office floor</strong> — 18 × 11.6 m, over a hundred objects — and run the
          whole pipeline on it: sweep, reconstruct, ask, edit, renovate.</p>
        <div className="capture-import-actions">
          <button type="button" onClick={loadSimulated}>Load simulated scan</button>
          <button type="button" className="ghost-button" onClick={downloadSimulated}>Save the scan file</button>
        </div>
        <p className="appearance-note">No sensor produced this floor. It is generated geometry in the same file format a
          capture uses, labelled <strong>Simulated</strong> throughout so it is never mistaken for a measured room.</p>
      </div>

      <p className="appearance-note">Safari views and edits your scan; the native app uses the LiDAR sensor. Viewing is local. Asking a question sends the room model to the configured spatial assistant. Reloading clears the imported scene.</p>
      <p className="appearance-note">The capture app must first be built and installed from this project's <code>ios/</code> folder using Xcode on a Mac.</p>
    </dialog>
  </>
}
