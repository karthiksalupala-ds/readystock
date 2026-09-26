# Export

Scans have always come into InteLiDar and never left. **Export** in the top bar writes the current scene out in four
formats, whichever room is loaded — the demo meeting room, a simulated floor, or an iPhone capture.

Everything is written in the browser. No export is uploaded anywhere.

## What you can take

| Format | File | What it is for |
| --- | --- | --- |
| Scan file | `<room>.intelidar.json` | Opens again through **Import scan**, with your edits in it |
| Object schedule | `<room>.csv` | A spreadsheet row per object: type, finish, confidence, pose, size, footprint |
| Floor plan | `<room>.svg` | A dimensioned drawing to print or drop into a document |
| 3D model | `<room>.glb` | Boxes at measured size, labels attached — Blender, Unreal, or **Import room** |

Files are named after the room, so `open-plan office floor` exports as `open-plan-office-floor.svg`.

## It exports the scene as it stands

Not the scene as it was scanned. Drag furniture, restyle it, add or remove pieces in **Renovate**, then export: the file
carries the room you are looking at. That is the answer to the viewer's session-only editing — an export is how a layout
survives a reload.

Export before you reconstruct and you get the raw scan: the same geometry, with every object still `unknown`.

## Provenance survives the round trip

A room measured by a device exports as `intelidar.roomplan` and imports back as **iPhone LiDAR · RoomPlan**, however much
furniture was moved around it — the geometry still came off a sensor. Everything else — the demo fixture, the generated
floor — exports as `intelidar.simulated`, because it is generated geometry, which is what that source means. Nothing is
ever promoted from generated to measured by passing through an export.

## The scan file

The same versioned format the iOS exporter writes and `parseCapture` validates, so an export and a capture are
interchangeable. Ids, poses, rotations, materials, colours, confidence, and catalogue model ids all survive; re-importing
gives back the graph that was exported.

This is also the way to hand a room to someone else, or to keep a before-and-after pair of the same space.

## The object schedule

One header row and one row per object:

```text
id,type,label,category,material,color,confidence,x_m,y_m,z_m,width_m,height_m,depth_m,footprint_m2,rotation_deg,asset_id
```

Metres to the millimetre, rotation in degrees about Y, footprint in square metres. This is the export behind the
"searchable spatial record of equipment" case: sort by type, filter by confidence, total the floor area a furniture class
takes up.

## The floor plan

A top-down drawing at 80 px per metre, with a metre grid, dimension lines on both axes, and a title block carrying the
room name, its size, its area, and its object count.

Drawing conventions, all of which the plan states:

- Openings are drawn in blue, equipment in grey-blue, furniture in stone.
- **Dashed outlines sit above the floor** — a monitor on a desk, a display on a wall, a window in its opening.
- Only furniture with room for its own name is labelled, and no two labels are allowed to collide. Floor coverings are
  never labelled: a rug would take the name off every piece standing on it. Everything else is in the schedule.

The title block says the shell is an enclosing rectangle and each object its bounding box, and that it is **not a survey
drawing** — a plan is exactly the kind of file that gets forwarded without its caveats.

## The 3D model

Self-contained binary glTF: the room shell plus one box per object, at measured pose and size, in metres, Y-up.

Each box carries its semantics in glTF `extras` — `intelidarId`, `type`, `label`, `category`, `material`, `confidence`,
`assetId` — so the meaning travels with the geometry instead of being left behind in the viewer. The root node carries the
room bounds and the scan's source.

**It is boxes, not the furniture you see in the viewer.** Those catalogue models are a generated representation, not
captured surface detail ([capture.md](./capture.md)), so exporting them would ship invented geometry as though it had been
scanned. The boxes are what InteLiDar actually knows.

Because it is self-contained, static, triangles-only and about 1,300 triangles for a hundred-object floor, it satisfies
every rule the local room importer enforces: an exported model can be opened straight back through **Import room** and
walked through ([playable rooms](./playable-rooms.md)).

## Related

- [Capture](./capture.md) — what comes in, and the simulated floor for demos with no device
- [Scene graph](./scene-graph.md) — the canonical fields every export is derived from
- [Playable rooms](./playable-rooms.md) — importing a GLB room and walking it
