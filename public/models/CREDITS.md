# Environment assets

Models and textures are from [Poly Haven](https://polyhaven.com), distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). They are third-party assets, adapted and integrated for this editor.

| Asset | Authors | Source |
| --- | --- | --- |
| Wooden Crate 02 | James Ray Cock; Jurita Burger | https://polyhaven.com/a/wooden_crate_02 |
| Wooden Lantern 01 | James Ray Cock | https://polyhaven.com/a/wooden_lantern_01 |
| Pine Sapling Small (3 variants) | Rob Tuytel; Rico Cilliers | https://polyhaven.com/a/pine_sapling_small |
| Rock Moss Set 01 (6 variants) | Kless Gyzen | https://polyhaven.com/a/rock_moss_set_01 |
| Medieval Blocks 03 | Rob Tuytel | https://polyhaven.com/a/medieval_blocks_03 |
| Medieval Wood | Rob Tuytel | https://polyhaven.com/a/medieval_wood |
| Cobblestone Floor 03 | Rob Tuytel | https://polyhaven.com/a/cobblestone_floor_03 |
| Forest Ground 04 | Rob Tuytel; Rico Cilliers | https://polyhaven.com/a/forest_ground_04 |

Adaptations: self-contained GLB packing, compacted vertex/index buffers, silhouette-preserving pine simplification, JPEG recompression at original 1K resolution, saved-dimension fitting, deterministic variant selection and per-instance visibility materials. No runtime dependency on Poly Haven servers.

`models/sources.json` and `materials/sources.json` record exact source downloads, source MD5 values, output sizes and SHA-256 hashes. Rebuild from the repository root with `node scripts/import-scene-models.mjs /tmp/world6-assets` (curl, Python/Pillow, installed Three.js required). Run `npm run test:models` to validate.
