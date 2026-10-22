# Geometry and lighting — preview v0.7

The detail workshop is a separate optional nine-object scene (14 × 12 m). The “Детальная сцена” button adds it to an existing browser copy once and opens it; subsequent visits reuse the edited scene. Existing three-area copies are retained. It can be edited through the normal scene editor.

## Constructed geometry

The high-detail wall, arched door, crate, platform and lantern now use repository-native constructed geometry rather than primitive fallback forms or the previous crate/lantern GLBs. Masonry has staggered joints, shaped bevels, vertex-level small chips and coping. The portal has separate jamb stones, bevelled voussoirs and oak planks following the arch. Hardware includes hinge barrels, straps, hexagonal fasteners, plates and ring handles. Crates have boards on six faces, raised braces, corner brackets and three-strand rope handles. Platforms have column shafts and capitals. Lanterns have a profiled foot/post, separate panes, lattice, roof, hanging ring and emitter.

Static parts are baked and batched per material, retaining the original parent/pivot for picking and dragging. A bounded stone palette prevents a unique material/draw call per stone. Tests verify that batching retains vertex bounds, releases original geometries and stays within 16 meshes per crafted object. Glass and the flame do not cast opaque self-shadows that would black out the internal light.

Pine and scanned mossy rock continue using the bundled Poly Haven geometry. Natural models now use uniform fitting within saved maximum bounds instead of independent XYZ stretching. Pine gains tapered geometry roots using the instance's bark/clay material. Collision/support data are unchanged; saved bounds remain the reserved volume. Low quality keeps the lightweight fallback path. Previous crate/lantern GLBs remain as attributed reference resources but are no longer requested by this renderer.

## Lighting

The renderer offers Working, Day and Night presets, a live exposure slider, and a clay (“Без текстур”) view. Exposure updates the existing renderer without reallocating the canvas or geometry. The working setup uses neutral key/fill/rim lights and the Three.js room environment. Outdoor modes use authored sky/ground radiance with a sun/moon highlight aligned to the directional key, prefiltered through PMREM. Day has warm sun and cool fill; night has moon fill and warm lantern point lights.

Directional shadow coverage follows the camera target and tightens when focusing on an object. Lantern lights follow the dragged parent. Point-light count is capped at eight, with one shadowed lamp in balanced quality and two in high quality. High quality adds half-resolution GTAO contact shading with denoise and a final colour-output pass. Resources and render targets are disposed on renderer teardown. Rendering remains event-driven, without advancing world time.

Restricted player views have no local point lights, no shadow casting and no screen-space contact shading. Every crafted material and cloned natural material retains disclosed-area clipping; remembered materials retain reduced opacity. The environment contains no world entities and therefore cannot reflect hidden scene content.

## Verification

Production TypeScript/Vite build passed. Twenty-two affected tests passed: real GLTF geometry/material checks, natural-model bounds/proportions, constructed geometry across aspect ratios, opened-door raycasting, batching silhouette/material/disposal, light/shadow budgets and privacy, lamp following, live exposure without renderer recreation, clay/night/working UI modes, workshop persistence and editor drag/undo regressions.

The supported cloud browser was launched through Sites preview. It reports GL_VENDOR/GL_RENDERER = Disabled and cannot create a WebGL context, so the app correctly falls back to the schematic. Shader output, artistic lighting quality and FPS on the user's RTX 2060 at 2560 × 1440 remain unverified. The tests use a stub renderer and stub ImageBitmap decoding; they do not substitute for GPU visual inspection. The explicit terminal.local Vite development host allowlist enables the supported preview without changing production hosting.
