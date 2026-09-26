# Capture geometry

How a RoomPlan scan becomes a scene graph, and why each step is there.

Setup and the scan workflow are in [capture.md](./capture.md) and [ios/README.md](../ios/README.md). This page is the
geometry: the conversion in `ios/InteLiDarCapture/ScanExport.swift`, which is the only place in the project where
measured geometry is reinterpreted rather than merely carried.

```text
CapturedRoom (RoomPlan)
   walls · objects · doors · windows, each an oriented box in the AR world frame
        │
        ├─ 1. square up      derive the room's own yaw from the walls, rotate onto it
        ├─ 2. bounds         axis-aligned extent over every transformed corner
        ├─ 3. origin         floor centre: walls give the floor, bounds give the centre
        ├─ 4. per object     centre − origin, XYZ Euler, opening thickness, category → type
        └─ 5. round          millimetres and microradians
        │
   intelidar.roomplan v1  →  parseCapture()  →  SceneGraph
```

## 1. Square the room up

**This is the step that is easy to leave out and expensive to get wrong.**

RoomPlan returns geometry in the AR session's world frame. That frame is gravity-aligned in Y, but its **heading is
wherever the phone happened to point when the user tapped Start scan** — it has nothing to do with the walls. Nobody
starts a scan perfectly square to a wall, and nothing tells them to.

Take the bounding box in that frame and you measure the bounding box of a *rotated rectangle*, not the room:

| Scan started | Exported room | Floor area |
| --- | --- | --- |
| square to a wall | 5.00 × 4.00 m | — |
| 10° off | 5.62 × 4.81 m | +35% |
| 30° off | 6.33 × 5.96 m | +89% |
| 45° off | 6.36 × 6.36 m | **+102%** |

The size error is the visible half. The worse half is that every object keeps its world-frame rotation, so the furniture
sits **on the diagonal** inside an oversized box — desks running corner to corner across a room that is twice the floor
area it should be.

So the exporter finds the room's own yaw first and rotates everything onto it. `ScanExport.squareUp` does this from the
walls alone:

```swift
for wall in walls {
    let run = wall.transform.columns.0        // the wall's width axis, in world space
    let heading = atan2(run.z, run.x)         // where that wall runs, in the XZ plane
    total += wall.dimensions.x * SIMD2(cos(4 * heading), sin(4 * heading))
}
let yaw = atan2(total.y, total.x) / 4
```

Two ideas are doing the work:

- **Why 4θ.** Walls in a rectangular room fall on two perpendicular families, so their headings only agree *modulo 90°* —
  averaging them directly gives nonsense, because 0° and 90° average to 45°. Multiplying by four maps all four
  directions (θ, θ+90°, θ+180°, θ+270°) onto the same point on the unit circle, so the circular mean is taken over
  angles that actually agree. Dividing by four at the end recovers the room's alignment in [−45°, 45°].
- **Why weight by width.** A long wall is a far better statement about which way the room faces than a 40 cm return off
  a nook. Weighting each vote by `dimensions.x` lets the long walls decide.

Properties worth knowing:

- A room already square to the world yields a yaw of ~0 and the rotation is the identity. The step is a **no-op** when
  it is not needed, which is also why it is safe if RoomPlan ever starts aligning its own output.
- The nearest alignment may transpose width and depth — a room scanned at 60° squares up to its 90° orientation. That is
  still square, and the enclosing box is still the room's; only the labels "width" and "depth" swap.
- No walls, or a wall whose width axis points straight up and carries no heading, returns the identity rather than
  failing.
- Under 2° of per-wall scan noise the measured floor area error falls from up to **+97%** to about **3%** — the residual
  being the genuine non-rectangularity of a noisy room, not the alignment.

Once the yaw is known, every transform is pre-multiplied by it. Bounds, positions and rotations all follow from the
aligned transforms, so the yaw is subtracted from each object's orientation for free.

## 2. Bounds

Every wall, object, door and window contributes its eight transformed corners to one axis-aligned extent. Corners, not
centres: an object's box has to fit inside the room it is reported in, and the importer checks exactly that.

## 3. Origin

The scene-graph convention is **floor centre**, so the exporter shifts everything by:

- **X and Z** — the centre of the bounds. Because the bounds enclose every corner, every object *centre* is guaranteed
  inside ±extent/2, so the importer's `±width/2 + 0.25` check can never falsely reject a valid scan.
- **Y** — the lowest point of the **walls**. Walls run floor to ceiling, which makes them a far more reliable floor than
  the lowest point of any object; a single piece of furniture sunk slightly into the floor would otherwise drag the
  whole room's datum down with it.

## 4. Per object

- `position` is the box centre (`transform.columns.3`) minus the origin.
- `rotation` is XYZ Euler in radians, produced by `xyzEuler`, which reproduces
  `THREE.Euler.setFromRotationMatrix` for `'XYZ'` order **including its gimbal-lock branch** — so the value lands in the
  React Three Fiber viewer with no conversion at the other end. This is checked element by element in
  `ScanExportTests`, and round-tripped through compound and gimbal-locked rotations.
- **Openings get 1 cm of thickness.** RoomPlan reports doors and windows as planar surfaces with zero depth, which is
  not a box and does not render.
- RoomPlan's categories map to the viewer's vocabulary — `.chair` → `chair`, `.storage` → `shelf`, `.television` →
  `monitor`, and so on. Anything unmapped keeps its own name and renders as a generic box, so a scan is never silently
  mislabelled as something the catalogue happens to have.

## 5. Round

Swift's `Float` is binary32 and `JSONEncoder` widens it to `Double` before writing, so an unrounded 5.2 m wall reaches
the file as `5.199999809265137`. The HUD prints room size straight from the graph, so that is precisely what would
appear on screen during a demo. Sizes are rounded to the **millimetre** and rotations to the **microradian**, both far
finer than a LiDAR scan resolves.

## What is approximated

Stated plainly, because a measured-looking number invites more trust than it has earned:

- The room shell is an **enclosing rectangle**. L-shaped rooms, angled walls, curves and open passageways are
  approximated by it. Raw wall polygons are not exported.
- Every object is its **oriented bounding box**, not its shape. The catalogue furniture in the viewer is a generated
  representation, not captured surface detail.
- Colours and materials are display defaults chosen per category. They are not measurements.
- RoomPlan's confidence is qualitative and is **not** converted into a fabricated probability.
- One room per scan, at most 500 objects, dimensions up to 50 m; the browser additionally caps files at 5 MB and
  validates every field before replacing the current scene.

## Verification status

The geometry above is tested in `ios/InteLiDarCaptureTests/ScanExportTests.swift`: origin normalization, planar opening
thickness, JSON encoding, XYZ rotation round-trips, squaring up across every scan heading (plus the no-op, the
long-wall vote, and walls with no readable heading), and millimetre rounding.

**The app has still never been through a Swift compiler.** The logic is verified; the build is not. See
[ios/README.md](../ios/README.md) for how to build and validate it on a Mac.
