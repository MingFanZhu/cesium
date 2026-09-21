# R15 follow-up: Bistro street fixture

- Type: `phase`; status: `completed`; updated: `2026-09-21`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: `f31fec25f6`
- Owner / reviewer: current task, architecture and execution self-review
- Architecture review: confirmed; example/data preparation only; no ADR or SGP

## Source facts and scope

The owner supplies `Test/Data/Models/Bistro.glb` and the original ORCA Bistro v5.2
FBX/texture archive. The GLB has 2,829,226 triangles, normals/UVs, 1,591 primitives
and 132 materials. All materials incorrectly use BLEND and metallic=1, with one
constant roughness and no metallic-roughness textures. Original README defines
Specular DDS channels as occlusion/roughness/metalness and normals as DirectX.

Replace the composite page's default architecture with the supplied street geometry.
Preserve source GLB/FBX and original geometry/transforms; prepare a separate local
glTF with material textures restored from the original documented channels. Record
source identity, explicit texture delivery resolution and any unresolved material
limits. Do not infer metalness from material names or claim correct glass transmission.
Keep Sponza and its material composite accessible as an explicit fixture selection.
Retain accepted atmosphere controls, A/B effects and native GIS camera interaction.

## Implementation and verification

1. Inspect source texture mapping, alpha and geometry bounds. Fail preparation on
   unexplained missing source maps; document any source-defined constants.
2. Add reproducible local preparation in `scripts/scenegis/`, ignored large outputs
   and tracked provenance under `Test/Rendering/pbr-data/`. No engine integration.
3. Assemble Bistro in the existing page with scale-appropriate cameras and clipping,
   independent of Sponza data. Preserve readiness/error and asynchronous destruction.
4. Verify geometry/material channel contracts and both-world load/camera/effect/export/
   lifecycle behavior. Inspect the actual street view. Avoid concurrent heavy fixtures.
5. Update scoped documentation/review and create a separate local checkpoint.

## Risks and exit

The supplied GLB alone has approximately 4.67 GiB RGBA8 texture storage with mipmaps;
restored ORM adds storage. Use an explicitly labeled browser delivery resolution,
retain original resources, and never disguise a texture derivative as unchanged source.
Correct transmission/GI and original authored lights are outside this phase. Exit when
the street loads in both Worlds, its preparation is reproducible and limitations visible.

## Delivery and evidence

- Added source-preserving Blender DDS preparation, versioned provenance and ignored local
  data. Geometry buffer views, accessors, meshes, nodes and transforms match the supplied GLB.
- Restored source ORM, DirectX normal green inversion and emission; 120 OPAQUE / 7 MASK /
  5 BLEND materials. The one missing paper-label ORM uses an explicit documented assumption.
  The source's fully transparent label and masked glass remain transparent.
- 405 delivery textures, maximum 1024, approximately 1.17 GiB RGBA8 including mipmaps.
  Original source files are retained. Current composite URL defaults to Bistro; Sponza uses
  explicit `asset=sponza`, and its main-only baseline remains unchanged.
- Both-world Bistro E2E and source contracts pass: 3 tests, 72 seconds. Coverage includes
  geometry bytes, numeric texture channels, source identity, startup, atmosphere, A/B camera
  invariance, presets, wheel, config export and destruction. Existing Planar Sponza composite
  regression passes in 60 seconds. No renderer or generated file changes.
- IAB inspection confirms street geometry, restored materials and a near-street camera
  outside buildings. Keep the owner's selected atmosphere time during the final reload.
- Technical review: [Bistro review](../reviews/2026-09-21-r15-bistro-scene.md).
  Owner visual acceptance is pending; no subsequent renderer phase is activated.
