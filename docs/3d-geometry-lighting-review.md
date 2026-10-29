# Geometry and lighting — previews v0.7–v0.9

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

## v0.8 — figures, water and live lighting

Generic presentation figures gain articulated limbs, curved clothing, bevelled chest pieces, boots, shoulder guards, belt hardware, facial shapes and a folded cape surface. They are miniature markers, not character-specific anatomy or equipment. Unknown height continues to render only a flat footprint. Figure parts are batched by material while preserving selection and drag pivots.

Water uses a tessellated, shallow wave surface with upward normals, an irregular shoreline and two flattened edge bands. The surface has a clearcoat material and does not write an opaque depth layer or cast an opaque shadow, including after batching. Waves are static vertex relief; rendering remains event-driven.

The expandable “Настройка света” panel controls key azimuth/elevation, key power, fill and lamp power, alongside exposure. Presets and sliders update the existing lights, renderer and emissive surfaces without replacing scene geometry, canvas, camera or selection. Outdoor environment highlights follow the same direction as the key; reflection-map regeneration is debounced while dragging direction controls. Lamp objects are reused across modes, detach in working mode or at zero power, and release their shadow maps. Settings are bounded, tolerate unavailable/corrupt browser storage, and restore after reopening; reset restores the current preset defaults.

“Вода и фигурки” opens a separate editable garden sample with two pools, two lamps, a rock and four generic figures. It reuses its existing saved scene on subsequent visits and preserves all other edited scenes. Its figure IDs are separate from the four settlement player markers.

Validation: TypeScript/Vite production build, lint of changed files and 27 affected tests passed. Added checks cover wave/cape relief and bounds, water normals and shadow flags, lighting source reuse, live slider/preset stability, settings recovery/reset and sample persistence. GPU appearance and FPS remain unverified because the supported browser has WebGL disabled.

## v0.9 — shaped geometry, studio fill and stable shadows

The figure chestplate is now a closed grid shell with curved front/back faces, thickness and a raised centre trim. Layered shoulder guards, fingers, ears, collar, bracer bands, belt studs, boot soles/lacing and cape edging/stitches add silhouette and construction detail. The hair cap has a higher frontal hairline and lower sides/nape. Geometric ray tests verify that the eyes remain visible and the tunic cannot protrude through the upper chestplate. Soles meet the miniature base. These remain generic presentation figures, not new character equipment or anatomy data.

Platform columns now have a full base/shaft/capital profile, entasis and twelve recessed flutes with a smoothed rotational seam. Lanterns gain curved support scrollwork. Water gains an opaque shallow bed and bounded, individually shaped shoreline pebbles instead of a continuous thick outer tube. Static details still batch within the existing per-object mesh budget. Closed constructed parts use front-face materials; the thin cape and water surface retain two-sided rendering.

The renderer uses the installed Three.js PCF filtering directly, replacing the removed PCFSoft mode. Directional coverage is quantized and its centre snaps to the light-space texel grid, retaining fine shadows during sub-texel camera pans. Shadow depth coverage and bias follow the scene scale and current view rather than a fixed large normal offset. Local-light shadow selection has hysteresis; inactive maps are released. Main and local shadow softness can be adjusted live and is included in existing browser preferences, with defaults supplied for older saved settings.

Working mode adds two wide area lights for broad material highlights, with shared LTC textures initialized once. They are absent from restricted/low-quality views and hidden outside working mode. Contact shading is now available in balanced quality at 35% render resolution (six samples), and high quality at 50% (twelve samples), with bounded world-space radius, denoise and a live strength/off slider. Glass, water, emitters, lines and cutout leaf cards are excluded from the replacement-normal pass, preventing their coarse geometry from acting as opaque AO blockers. Real directional/point shadows retain foliage alpha testing. Shadow-map updates are frozen during the contact pass, avoiding a second set of shadow renders against its temporary filtered scene. Visibility, the prior override material and shadow flags are restored afterward.

Offscreen composer targets preserve MSAA (up to two samples in balanced quality, four in high quality, limited by the renderer capability), since canvas antialiasing alone does not smooth an offscreen beauty pass.

Validation: 32 affected checks passed, including actual geometry ray tests, dimensions, batching, texel stability, bias, light reuse, inactive shadow-map disposal, preference compatibility, direct manipulation and persistence. A contact-pass execution test exercises the real GTAO pipeline with a stub GPU renderer and checks temporary visibility/shadow state and material disposal. A software triangle view was used to inspect geometry only. These checks do not verify WebGL shader output, artistic lighting quality or FPS; the supported browser's disabled WebGL remains a verification limit.
