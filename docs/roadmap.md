# Scope and roadmap

What the hackathon MVP must prove, what can wait, and how that maps to this repo. Engineering order: [design.md](../design.md).

The goal is not to solve general 3D reconstruction in a day.

The goal is to show that AI can turn a raw spatial scan into an **intelligent digital environment**.

## Must have

| Item | In this repo |
| --- | --- |
| LiDAR room scan | iPhone RoomPlan capture source + Safari file import implemented; native build and device verification pending ([capture.md](./capture.md)). A generated office floor stands in when no device is available ([capture.md](./capture.md#no-iphone-use-the-simulated-floor)) |
| Exported 3D mesh | Axis-aligned boxes from the graph |
| Browser 3D viewer | React Three Fiber |
| Basic object or surface recognition | Reconstruct (demo ids + size heuristics) |
| Semantic labels on the scene | Twin graph + HUD list + 3D labels |
| AI question interface | Ask bar + OpenAI or heuristics |
| Object highlighting in 3D | `highlightIds` → emissive meshes |

## Nice to have

| Item | Status |
| --- | --- |
| Automatic material assignment | Partial — reconstruct sets `material` / `color` |
| Floor-plan editing | Done — drag furniture and equipment |
| Clean 3D asset replacement | Not started |
| Mesh smoothing | Out of scope for boxes |
| AI-generated textures | Not started |
| Scene comparison between two scans | Not started |
| Large, furnished demo scene without a device | Done — simulated 18 × 11.6 m office floor, 106 objects |
| Export the twin | Done — scan file, object schedule, floor plan, glTF model ([export.md](./export.md)) |

## Future work

- Verify native RoomPlan capture on an iPhone; add glTF ingest
- Vision: detection, segmentation, openings from RGB
- LLM-driven reconstruct (not only ask)
- Full geometry completion and photorealistic reconstruction
- Persistent room memory and multi-room mapping
- Automatic change detection
- Construction-site twins, warehouse monitoring, safety analysis
- Robot navigation maps
- AR overlays

## Why this cut

LiDAR (or a measured fixture) gives **pose and size**. AI gives **names, materials, and questions**. The viewer stays a thin projection of a stable graph so capture and vision can slot in without a rewrite.

## Applications (later)

**Construction.** Site twins, equipment, hazards, obstacles, work areas, change between scans.

**Robotics.** Semantic maps of unfamiliar rooms.

**Interior design.** Editable 3D from a phone scan.

**Real estate.** Interactive property models.

**Warehousing.** Inventory locations and circulation.

**Facility management.** Searchable spatial records of equipment.
