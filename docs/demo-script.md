# Demo script

A short path through the running app. Setup: [getting-started.md](./getting-started.md).

The demonstration is deliberately simple: **raw scan looks unfinished, reconstruct looks understood, ask lights up objects.**

## Before you present

- Backend on 8000, Vite on 5173, browser fullscreen if you can.
- No OpenAI key required. Heuristics cover the three suggestion chips.
- Reload just before you present: the opening sweep runs once per load and is the best four seconds of the demo.
- If you have already shown it, or you are short on time, press **Skip** in the capture card.
- On a borrowed or weak machine, open **Graphics** in the top bar and pick **Balanced** or **Low** before you start. Low drops the point cloud, shadows, beam, blur and animation; the room, the labels, reconstruct and ask all still work. The choice is remembered on that machine.

## Step 1 — The sweep

On load the sensor turns on the spot and the room arrives with it. Returns land where the beam points, boxes resolve one at a time behind it, and the capture card counts returns and volumes found. Nothing is drawn before the beam reaches it.

Talking point: geometry like this comes from measurement, not from a model's imagination — that is the premise of the product.

Do not claim a live scanner. There is no hardware behind the sweep; it replays a demo room the backend already had ([capture.md](./capture.md)). If someone asks, the Source row in the left panel says *LiDAR demo mesh*, and the honest answer is that `/scene/ingest` is the seam a real device would POST to.

## Step 2 — Raw capture

Once the sweep finishes the status pill reads **Raw mesh**: wireframe room, unlabelled boxes, a settled point cloud. Left panel: *Unlabelled scan*, object rows all `unknown`.

Talking point: this is what a cheap LiDAR mesh feels like — structure without meaning.

## Step 3 — Reconstruct

Press **✨ AI Reconstruct**.

The HUD plays computer-vision-style steps, for example:

```text
Unknown surface  →  Wall
Unknown surface  →  Floor
Unknown object   →  Table
Unknown object   →  Chair × 4
Unknown opening  →  Door
Unknown opening  →  Window
Unknown object   →  Display
Unknown object   →  Shelf
```

Talking point: InteLiDar is classifying the graph, not hallucinating a new room.

## Step 4 — Semantic twin

Materials, lighting and labels arrive object by object rather than all at once, and the point cloud dissolves as they land. Status: **Semantic twin**. The object list shows types and confidence.

## Step 5 — Ask

Use a chip or type:

```text
Show me all the chairs.
```

Four chairs glow. Reply mentions the count.

Then:

```text
Where is the door?
```

```text
What objects could obstruct movement through this room?
```

Talking point: the assistant returns ids; the viewer only paints those ids. The model is not picking pixels.

Clicking a row in the left panel highlights that object too, if you would rather point than type.

## Step 6 — The bigger room (strong closer, no device needed)

The meeting room makes the point in nine objects. If you have another minute, make it in a hundred.

**Import scan → Load simulated scan.** A generated **open-plan office floor** replaces the demo room: 18 × 11.6 × 3.1 m,
106 objects across a twelve-desk bank, a meeting zone, a lounge and reception, a kitchenette, and a storage run.

It arrives as raw geometry, so the whole path runs again on a room five times the area: sweep, **AI Reconstruct**, ask.
The classification log grows with the room (`Chair × 27`, `Table × 18`, and so on), and *Show me all the chairs* now
lights 27 objects across four zones at once.

Watch what the viewer does with the density: in the twin it names nothing until you ask, then names only what the answer
highlighted. The scene list on the left still carries all 106.

Do not call this a scan either — it is the strongest slide and the easiest to overclaim. Nothing in it was measured. It is
generated geometry in the same file format a real capture uses, read through the same validation, and the HUD reads
**Simulated LiDAR · no device** and **Simulated scan · no device** the whole time. If someone wants it, **Save the scan
file** hands them `simulated-office-floor.intelidar.json`, which imports like any other export.

## Step 7 — Edit (optional but strong)

Toggle **Edit**. Drag a chair. Show that the door does not move. Ask chairs again if you want to show highlights following the new pose (twin-graph ask uses current positions in the JSON, even though heuristics do not mention coordinates in the reply).

## Step 8 — Export (the answer to "can I keep this?")

Someone always asks. Press **Export**.

Four files, all written in the browser and none of them uploaded: the **scan file** re-imports here with the furniture
exactly where you left it, the **object schedule** opens in a spreadsheet with every object's type, size and footprint,
the **floor plan** is a dimensioned SVG you can print, and the **3D model** is a glTF that opens in Blender — or straight
back through **Import room** to walk around.

Talking point: editing in the viewer lasts a session; an export is how a layout outlives one. And the model carries each
object's label and type in its glTF `extras`, so the semantics leave with the geometry rather than staying in the app.

The honest note, if it comes up: the exported model is one box per object, not the catalogue furniture on screen. That
furniture is a generated representation, so shipping it would export invented detail as though it had been scanned.

## If something fails

| Symptom | Fix |
| --- | --- |
| Backend unavailable | Start `npm run backend`, reload |
| No Reconstruct button | The sweep is still running; wait, or press **Skip** |
| Sweep never starts | Backend is down — the capture card only appears once ingest returns |
| No sweep at all, room just appears | The machine is set to reduced motion; that path is deliberate |
| Ask disabled | You are still in raw / analysing |
| Generic ask reply | Expected without a key, unless the question hits a keyword |
| Simulated floor slow to furnish | ~100 models load on reconstruct; give it a few seconds, or pick **Balanced** in Graphics |

## One-line pitch

**InteLiDar transforms a LiDAR scan into an AI-enhanced semantic digital twin.** Scan a room. Recover its structure. Let AI name what is there. Then work with the physical world through its digital copy.
