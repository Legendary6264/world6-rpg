# Character presentation models and skeleton · v0.39

The scene renderer now uses four original detailed, stylized humanoid sculpts:
vanguard, ranger, arcanist and wayfarer. `src/scene3dCharacters.ts` authors their
tailored silhouettes, facial landmarks, separate fingers, shaped footwear,
layered cloth, costume-specific equipment and metal edging. Major surfaces use
interpolated cross sections or closed cloth patches; the economy renderer uses
the same authored forms at reduced tessellation rather than box bodies.

Choose a model and heading in the token inspector. These optional version-1
scene fields survive copying, export/import, undo and redo. Old saves choose a
stable default with no migration. Costumes have no effect on inventory, rules,
resources, race or abilities. Known-height identified contacts and the player's
own token receive the disclosed visual preset. Hidden actors, sound contacts
and unidentified silhouettes do not receive an actor's selected appearance.

`Project → Персонажи · новые модели` opens a separate inspection scene with all
four characters on support plinths. Select a token and press F for a close view.
An 18-bone shared skeleton now drives the scene figures and the humanoid body
viewer. Enable «Анимация персонажей» in the camera panel; choose breathing,
walking in place, or rest in the token inspector. The body viewer has a separate
«Дыхание» switch. Animation is presentation-only and has no root motion.

Materials use original, reproducible seamless 512px albedo, tangent normal and
packed AO/roughness maps. Regenerate the twelve JPEG maps with
`python3 scripts/build-character-materials.py` (NumPy and Pillow). Metal keeps
its authored metalness. Clothing uses metre-based UV projection at 18cm per
tile. Textures are served locally, with no third-party runtime requests.

Opaque compatible colors are batched into vertex palettes. The tests enforce
at most 180k triangles for a full character and 28k for economy mode, plus a
12-batch ceiling for the guard. Selection and collision still use the existing
token, support and footprint system. Mesh winding and closed primary surfaces
are checked independently of material double-sided rendering.

The v0.38 sculpt and textures were recovered from the existing private Sites
source at ed580e0f1b3745b74ba39f5bc70db15e0632164e and integrated selectively
into the GitHub source. Newer editor features from main were retained.
The current working copy has also been inspected in a local WebGL browser.
Regression coverage includes geometry, material batching, vertex deformation,
bind poses, movement/elevation, region picking, privacy, undo/redo and disposal.
See the technical audit for the final verification results.


## v0.38 sculpt pass

Faces now use a continuous nose/orbital surface in a denser closed head mesh.
Eyes, lids, eyebrows and age creases follow the cranial surface; all portrait
parts receive the same head pose. Jaw widths, cheeks, hairlines, beard outlines
and hair lengths differ across the four presets. Nonmetal materials explicitly
use zero metalness.

Costumes share an attachment-preserving static pose deformation: different
shoulder widths, fitted sleeves, relaxed body turns and a raised staff hand.
The staff is excluded from arm deformation so its shaft, ferrules, prongs and
crystal remain connected. Mantles and cape hems have asymmetric drape; the guard
has shaped, overlapping pauldrons. Robe, coat, belt and boot volumes enclose the
underlying clothing rather than allowing thighs or calves to pierce them.

A bounded LRU holds up to twelve immutable templates keyed by preset, footprint,
height, base tint and quality. Every scene instance owns independent cloned
geometry. Moving, batching or disposing one instance does not mutate a template
or another instance. Evicted templates release their geometries.

Additional regressions check open pupils after posing every preset, robe
occlusion of the thighs, staff continuity, and mutation/disposal independence
of cached templates. The sculpt is inspected from front, rear and three-quarter
angles using the exact generated meshes and an offscreen depth buffer.

## Skeletal runtime

`characterRig.ts` assigns normalized skin weights before palette batching, then
binds each token to its own skeleton and AnimationMixer. Clothes and costume
attachments share the pose; prop bases remain fixed. Batching retains skin
attributes. Bone envelopes update picking and culling bounds without rebuilding
geometry each frame. Local rest transforms avoid double translation when a
token is moved or placed on a raised support. Skeleton textures and mixer
bindings are released with the renderer.

Scene animation is opt-in, stops in hidden tabs and releases its timer on
unmount. Rest mode does not run a continuous character animation loop.

The anatomy viewer keeps its existing region identifiers and face-to-region
map. Fine fingers bypass the coarse SDF union; a closed interpolated head
replaces overlapping skull/nose ellipsoids. Equipped artifacts follow their
assigned hand or torso bone. Quadruped and avian forms retain their existing
renderer; they are not forced onto a human rig. Finger-joint animation, IK,
facial blend shapes, cloth physics and import/retargeting of external rigs are
not implemented by this change.

Long robes, coat skirts and low cape panels blend across both leg chains,
including the shin at the knee. This avoids knee penetration during the walk
preview without splitting the closed cloth surface at its centre. Regression
coverage raycasts through the robe in eight phases and both quality levels.
