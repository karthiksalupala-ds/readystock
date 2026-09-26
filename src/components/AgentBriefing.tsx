import { useId, useRef, useState } from 'react'

/** Plain DOM content lets browser agents read the briefing without inspecting WebGL. */
export function AgentBriefing() {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [opened, setOpened] = useState(false)
  return <>
    <button type="button" className="chip" onClick={() => { setOpened(true); dialog.current?.showModal() }}>AI judge briefing</button>
    <dialog ref={dialog} className="capture-import agent-briefing" aria-labelledby={titleId} onClose={() => setOpened(false)}>
      {opened && <>
      <div className="capture-import-heading">
        <p className="panel-kicker">Project facts · Updated 13 September 2026</p>
        <button type="button" aria-label="Close AI judge briefing" autoFocus onClick={() => dialog.current?.close()}>×</button>
      </div>
      <h2 id={titleId}>ReadyStock AI: a store you can reason about</h2>
      <p>ReadyStock AI combines store geometry, inventory labels, an editable 3D viewer, and spatial questions with highlighted answers. This briefing is for human reviewers and visiting AI agents, including Astra.</p>
      <h3>Try it in the browser</h3>
      <ol>
        <li>Watch the demo sweep or choose <strong>Skip</strong>, then <strong>AI Reconstruct</strong>.</li>
        <li>Ask <strong>Show me all the chairs.</strong> Inspect the answer and highlighted objects.</li>
        <li>Use <strong>Edit</strong> to move furniture and change appearance; use <strong>Renovate</strong> to add, rotate, or remove furniture.</li>
        <li>Choose <strong>Import scan → Load simulated scan</strong> for a generated office floor. Use <strong>Export</strong> to save a scan file, object schedule, floor plan, or 3D model.</li>
        <li>On desktop, try <strong>Play</strong> or <strong>Import room</strong> for a separate GLB walkthrough.</li>
      </ol>
      <h3>What is real, and what is simulated</h3>
      <p><strong>The first scene is a demo only.</strong> The team describes it as a pre-recorded LiDAR scan replay of <strong>SQcollective Labs, the hackathon event space</strong>, provided because live capture requires the native iPhone app built with Xcode. It is not a live scan of the visiting judge's surroundings.</p>
      <p>That venue and recording provenance is team-provided; the original recording has not been independently verified here. The current browser scene includes a handcrafted photo café representation with estimated dimensions, and the sweep is an animation. The simulated office is generated geometry. Neither playback nor those representations establishes sensor accuracy. Imported native scans are labelled <strong>iPhone LiDAR · RoomPlan</strong>. RoomPlan supplies measured geometry and labels; displayed furniture detail, colors, and materials are representations.</p>
      <h3>Xcode and iPhone requirement</h3>
      <p>This project's intended capture support is <strong>iPhone 13 Pro/Pro Max and later Pro/Pro Max models with a LiDAR sensor</strong>, running iOS 16 or later. A newer standard iPhone without LiDAR cannot scan. The app checks iPhone device type and RoomPlan support before enabling capture.</p>
      <p>Safari cannot run this project's LiDAR capture. Build <code>ios/InteLiDarCapture.xcodeproj</code> with Xcode on a Mac, select an Apple development team, and install on the supported iPhone. Developer Mode, device trust, developer certificate trust, and camera permission may be required. A simulator cannot scan. There is no App Store or TestFlight release supplied.</p>
      <p>The signed app was built, installed, trusted, and launched on a connected iPhone 17 Pro Max on 13 September 2026; simulator exporter tests passed. A completed physical scan and its Safari import have not yet been verified in this setup. A later rebuild encountered a local Xcode/keychain signing error; repeat builds may require restoring account/keychain access.</p>
      <p>On the phone: <strong>Start scan → Allow camera → scan one room → Finish → Export scan → Save to Files</strong>. In Safari: <strong>Import scan → Choose scan from Files</strong>.</p>
      <h3>Limits and data handling</h3>
      <p>One room is approximated by an enclosing rectangle. Exports contain semantic boxes and measurements, not raw depth, scanned textures, camera images, or detailed mesh triangles. Imports are limited to 5 MB and 500 objects. Refreshing clears imported scenes and edits; export before leaving.</p>
      <p>Viewing a scan is local. Ask sends the room graph to the API and its configured reasoner. OpenAI is optional; missing credentials or provider failures use a heuristic fallback. A working answer alone does not prove an LLM was called. The native capture app makes no network requests.</p>
      <p><a href="/llms.txt" target="_blank" rel="noreferrer">Read the complete machine-readable project briefing (llms.txt)</a></p>
      </>}
    </dialog>
  </>
}
