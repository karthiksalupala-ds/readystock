# Desktop playable rooms

InteLiDar lets you walk around the demo, imported RoomPlan scenes, and saved GLB rooms with a rigged avatar. In semantic rooms, you can also sit on supported chairs and sofas, toggle floor lamps, and switch TVs and monitors on or off. Renovation furniture uses the same interactions.

Gameplay targets desktop browsers with a keyboard and mouse. Mobile browsers can view, import, and edit RoomPlan scenes. The repository includes a native iPhone RoomPlan capture app; building and sensor verification require Xcode and a supported phone. Mobile gameplay, touch controls, and AI texture generation are deferred.

## Play in the demo

1. Run the API and frontend using `npm run backend` and `npm run dev` in separate terminals.
2. Finish or skip the scan sweep, then select **AI Reconstruct**.
3. The dining chairs, table, shelf, and monitor appear using the existing asset library. Use **Edit** to rearrange furniture if needed.
4. Select **Play** once assets finish loading. The casual avatar starts in a clear part of the room.

| Input | Action |
| --- | --- |
| WASD or arrow keys | Move relative to the camera |
| Hold Shift | Run |
| Drag the scene with the left mouse button | Rotate the following camera |
| E or the contextual action button | Sit, stand up, or toggle the highlighted object |
| Escape or **Exit play** | Return to inspection |
| **Reset position** | Return to the starting point |

The character stays on supported floors, slides along walls, and is blocked by furniture. Idle, walk, and run animations follow actual movement. The camera moves closer when a wall or other object would obstruct it.

Switching away from the browser clears held inputs and pauses play, including sitting transitions. Select **Resume** when you return. Exiting play preserves furniture edits, leaves the seat, and restores the inspection camera. Renovation remains available from inspection.

## Interact with furniture

Walk close to an object and face its interaction point. Within 1.5 metres, the nearest visible action appears above the control guide: **E · Sit on chair**, **E · Turn on lamp**, or **E · Turn off screen**. Only the targeted object receives the interaction highlight. Walls and other furniture block targeting.

- **Chairs and sofas:** standard and office chairs, stools, procedural chair variants, and catalog sofas support sitting. Every sofa cushion is a separate seat; labeled RoomPlan sofas have a procedural cushion model. Approach from a clear side and press **E** once. The character aligns, sits down, and remains seated until you press **E** again to stand. Movement keys do not slide the character off the seat; mouse dragging still controls the camera.
- **Safe access:** sitting requires a clear approach, room for the body and bent legs, and a supported place to stand. Armless chairs and stools can also offer checked side entries. The casual avatar is calibrated for upright seats 0.36–0.64 metres above their supporting floor; its legs adapt without resizing the character. If a seat is unavailable, the prompt explains why. Move around the chair or rearrange surrounding furniture in inspection. **Reset position** returns to the starting point, including while seated.
- **Lamps and screens:** floor lamps glow with warm light; TVs, monitors, and laptop displays show a static illuminated surface. Each object toggles independently. Additional light sources are shadowless, with the four nearest enabled lamps supplying real light; the remaining enabled lamps retain their glow.
- **Reduced motion:** the system preference skips alignment and pose transitions. Camera obstruction handling remains active.

Holding **E** performs only one action. Interaction shortcuts are inactive while paused or typing. The on-screen button performs the same action and explains any unavailable state.

Lamps and screens begin off. Their state survives exiting and re-entering Play in the current semantic room session. Replacing the semantic room or refreshing clears it. Removing furniture drops its state; undo restores the furniture with default toggle state. Layout edits are reflected when entering Play again. Toggle state is separate from the scene graph and does not alter appearance edits.

Doors, drawers, picking up objects, lying on beds, jumping, climbing, pushing furniture, and multiplayer are not included. Plain GLB imports retain walking and collisions; they do not gain furniture interactions through automatic object recognition.

## Import a RoomPlan scan

1. Build and install InteLiDar Capture on a LiDAR-equipped iPhone using the [native capture instructions](../ios/README.md).
2. Scan one room, finish processing, and export the `.intelidar.json` file to Files.
3. Select **Import scan → Choose scan from Files** in the browser. The capture opens as a semantic twin, with measured furniture positions and device labels.
4. On desktop, use **Edit** or **Renovate** to adjust the layout, then select **Play** to walk and interact with supported furniture.

Opening and editing the scan is local. Asking a spatial question sends the semantic room graph to the configured API and reasoner. Refreshing clears the imported scene and edits, so keep the exported file. The native source is included; its Xcode build and real-device capture remain unverified in the Windows development environment.

## Import a saved room

Local import runs in the browser and remains available if the demo API is offline. No scan file is uploaded.

1. Select **Import room** and choose a `.glb` file.
2. In the setup preview, choose the model's units: meters, centimeters, or millimeters. Check the displayed room dimensions.
3. Drag to orbit or scroll to zoom. Click an open, level part of the floor to place the avatar preview. The app checks floor support and headroom before accepting the position.
4. Select **Open room**, then **Play**. You can import another file or select **Back to demo** from inspection.

The room is kept for the current browser session. Refreshing requires selecting the file again. Cancelling an import or encountering an invalid file leaves the previous room available.

### Supported files

- A self-contained static GLB, with embedded geometry and textures; external resource URLs are rejected.
- At most **50 MiB** and **250,000 rendered triangles**, including mesh instances.
- A single-level room using glTF's Y-up orientation. Select the unit conversion during setup.
- Existing materials and textures are preserved. Draco and Meshopt geometry compression are supported with bundled decoders. KTX2 textures are not supported; export PNG or JPEG textures instead.
- Animated meshes, skinning, morph targets, point clouds, and line-only models are unsupported.

Imported geometry supplies the physical surfaces: actual doorways remain open, and missing floor patches remain holes. Import does not repair geometry, infer furniture labels, replace objects, or generate textures. Use a complete floor surface and choose a clear starting point. The character resets if it falls below the room.

## Development

The backend launcher selects `backend/.venv/Scripts/python.exe` on Windows and `backend/.venv/bin/python` on macOS/Linux. Both `npm run backend` and `npm run test:backend` use it. Set `INTELIDAR_PYTHON` to an explicit Python executable path to use a different environment.

For a new Windows environment, run from the repository root in PowerShell:

```powershell
python -m venv backend/.venv
& ./backend/.venv/Scripts/python.exe -m pip install -e './backend[dev]'
npm install
npm run backend
```

See [Getting started](./getting-started.md) for other platforms and environment configuration. `npm test` runs launcher tests, frontend tests, backend tests, and Playwright flows, including mobile import and editing. `npm run build` verifies the production bundle. Run WebGL browser checks with one worker (`npm run test:e2e -- --workers=1`) to avoid competing for graphics resources.

Frontend room adapters normalize semantic demo/RoomPlan graphs or imported meshes into meter-scaled visual geometry, bounds, colliders, and a spawn position. Semantic environments additionally provide optional interaction definitions derived from the rendered furniture profiles and transformed with each object's scale and rotation. Gameplay consumes that shared environment independently of the capture source; runtime interaction state stays separate from the semantic graph. The interaction module owns targeting, seat availability, and transitions without React updates on every frame.
