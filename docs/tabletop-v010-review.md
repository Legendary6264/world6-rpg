# Modular tabletop — preview v0.10

The first playable construction slice follows the supplied tabletop reference: a cohesive open-roof tavern, dining room, bar, bedroom, yard, trees and a stone path to a dungeon entrance. Characters remain full 3D miniatures. The existing world rules, character sheets, four-player lobby limit and time calculations remain authoritative.

## Construction and presentation

The library contains 23 original procedural models: three floor surfaces; timber walls, windows and doors; stone walls; tables, chairs, benches, bar counters, barrels, shelves, beds, rugs and chests; candles, braziers and a fireplace; steps, an arch, a pit hatch and retractable spike presentation. Models remain ordinary editable scene objects. Joinery, window openings, furniture legs and backs, crockery, barrel hoops, curved chest lids and flames are actual geometry. The set uses oak, lime plaster, stone and iron, with existing local PBR materials.

Native model transforms are baked before resizing, keeping details within the saved physical bounds. Static parts batch by material. There are no additional remote models, dependencies or paid services. Existing bundled pine and rock models are reused. Cardinal rotation swaps physical width/depth, rotates supported token positions and keeps the existing rectangular collision system consistent. Lamp state removes both the emitter and its local light.

The floor brush interpolates pointer movement on a fixed 2 m grid. Brush widths cover one, two or three cells. A stroke previews up to 250 cells, captures the pointer, suspends camera orbit, and commits once on release. Escape, lost capture and blur cancel it. Alt preserves camera orbit. Repainting reuses tile IDs; erasing removes floor tiles while retaining furnishings. Object limits reject the complete command without partial state changes. A finished stroke occupies one undo step.

The renderer adds an orthographic camera and optional camera-relative wall cutaway. Cutaway changes the view only and is unavailable on restricted player maps. New tabletop views initially hide dense labels. Orthographic zoom controls shadow coverage. Existing on-demand drawing, ray picking, direct object dragging, scene focus, saved camera positions and rendering resource disposal remain in use.

## Storage and play

Optional `asset`, cardinal `facing` and boolean `active` fields extend the existing version-1 object format. Copying, component projection/restoration and disclosed object snapshots retain them. Unknown catalog IDs, incompatible mechanical kinds, non-cardinal rotations and malformed state flags are rejected. Remembered objects retain their previous presentation states rather than receiving hidden live changes.

The preview adds the tavern once and reopens its edited copy on later visits. Historical browser copies are retained. Fresh copies open the tavern with four sample miniatures. Furniture can be dragged and doors/lamps operated directly in the overview, using the same saved state as the editor.

The ordinary lobby scene editor adds an optional “Показывать изменения игрокам сразу” control. Completed edits are coalesced for 450 ms and sent through the existing permission-checked, revision-checked scene PUT and lobby notification. A fresh loaded scene is not written again. Edits made while an automatic save is in flight remain editable and queue behind that save with its returned revision. A conflict pauses automatic publication and preserves the local draft. Pending timers are cancelled on unmount; server requests retain existing abort handling. This code is prepared for the ordinary app; the private static preview remains a separate browser copy without multiplayer networking.

## Validation and limits

`npm run test:tabletop` checks model dimensions at four rotations and two scales, finite geometry/normals, batching, real window and door ray intersections, brush interpolation and atomicity, support rotation, component round trips, remembered-state privacy, preview persistence, input gestures, undo/redo and automatic-publication conflicts. Its HTTP cases run against isolated SQLite and PostgreSQL-compatible test databases and verify persistence after restart, permissions and disclosure.

The existing scene/access/perception/world-coordinator and entity-adapter suites passed 85 checks. The tabletop command passed 32 checks; an additional delayed-network queue case and the three other publication cases passed after the queue refinement, existing detailed-model/asset suites passed 14, and five focused scene-draft UI cases passed. Changed-file lint passed. The exact Site source is type-checked and built by the production packager before publication.

The supported browser has WebGL disabled. A CPU triangle view was used only to inspect arrangement and geometry; it does not validate PBR shaders, shadow appearance or frame rate. No GPU performance claim is made. Pit and spike assets are presentation modules, not an automatic trap-damage or physics subsystem. Player object manipulation, lock rules and animated fire simulation are not introduced by this slice. No production database migration, main-branch merge or Render deployment is part of this change.
