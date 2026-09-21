# Review: TAA zoom and mature reference adaptation

- Type: `review`; status: `completed`; date: `2026-09-21`
- Reviewer / owner: current task, architecture and execution self-review
- Target: [R4](../plans/2026-09-20-r4-temporal-antialiasing.md), checkpoint `9255216681`
- Predecessor: [initial R4 review](2026-09-20-r4-temporal-antialiasing.md)
- Decision / existing seam: ADR-0094 / SGP-0022

## Findings and disposition

- P1, fixed: The previous resolve reprojects every covered pixel using the minimum depth of
  its 3x3 neighborhood. On a slope this describes another point; at occlusion boundaries it
  can describe another surface. Covered samples now retain their actual depth. Only uncovered
  silhouette support borrows a neighbor's motion, evaluated at that neighbor's jitter-corrected
  sample position. A GPU regression compares all eight history depths against the actual
  picked surface in eye coordinates (0.005 tolerance); the previous release fails all eight.
- P1, fixed: The initial resolve simplified input reconstruction, repeated history resampling
  and color clipping independently. At the owner's request, use a coherent mature reference:
  Google Filament `taa.mat`, pinned in ADR-0094. Adapt Lanczos-2 linear-radiance reconstruction,
  five-tap Catmull-Rom history with deringing, cross/full min/max bounds intersected with
  five-sample variance, history-to-current segment clipping and compression only for HDR
  blending. No motion-length weight heuristic remains. Playdead's published INSIDE reference
  also distinguishes nearest-depth velocity selection from replacing current surface depth;
  none of its Unity implementation is copied.
- P2, fixed: Reprojection must preserve Cesium's linear merged depth and ECEF precision.
  Retain the CPU double-precision eye transform and per-frustum depth pass. Transfer the
  unjittered sample displacement to the output pixel. Keep existing alpha, reset, resource,
  picking and camera contracts. No additional pass, attachment or geometry draw is introduced.
- P2, fixed: Reference-derived code needs durable provenance. The source header names the
  pinned implementation and modifications. Apache-2.0 license, attribution/algorithm credits
  and machine-readable manifest ship under the existing SceneGIS asset-copy root; all three
  text assets total 12,839 bytes, below the declared 16 KiB budget, with no runtime fetch.
- P2, accepted scope: Camera-only reprojection still cannot correctly track independently
  animated geometry or every translucent/shading change. This fix does not add object motion
  vectors, temporal upscaling, sharpening or a new public option. Owner visual review remains
  the final quality gate, particularly for wheel motion and fine photogrammetry textures.

## Verification

- All 12 strict WebGL TAA Specs pass in development and release. Existing static-detail,
  Globe/Planar coverage, picking, orthographic motion, disocclusion/reset, multi-frustum depth,
  shared AO with zero geometry prepass, resize/destruction and exception cleanup remain covered.
- New camera-dolly regression uses a world-fixed textured slope, twelve camera positions,
  and an independent 384x384 spatial reference reduced to 96x96 with 4x4 samples per pixel.
  In the 48x32 interior ROI, average displayed-luminance error falls from 11.499 to 8.943
  byte levels (22.2%). A four-percent display-range budget is 10.2 levels: old release fails,
  final resolve passes. This bounds a specific reprojection regression, not universal image quality.
  The earlier diagnostic comparison against zero history was discarded as a test oracle because
  legitimate antialiasing itself differs from an unaccumulated image.
- Full release build passes. No public API/type changes. License/notice/manifest are present
  in dev/release assets and both root/engine npm pack dry-run manifests. Scoped ESLint,
  changed-file formatting, diff checks and upstream patch audit pass (zero delivery upstream
  files and zero generated changes). AgentDocs-wide markdownlint passes; wide Prettier still
  reports the same 316 pre-existing formatting issues recorded at the previous checkpoint.
- The owner's real reference view uses the fixed AGI HQ mesh (no child LODs), 1198x852,
  TAA, AO and shadows, nine scene commands. Actual wheel zoom renders without a product error;
  captured original camera and settings are restored. A temporary diagnostic incorrectly enabled
  native planar inputs, triggering the existing navigation guard; it was removed by reloading
  and restoring the proper disabled native controller. No navigation code changed.

## Performance and boundaries

RTX 3060 Ti / ANGLE D3D11. An isolated resolve measurement uses
`EXT_disjoint_timer_query_webgl2`, the same input/history/view, sixteen submissions per query,
and old/new/new/old order after shader compilation. The disjoint flag is false. Mean GPU times
are old 0.08595/0.08544 ms, new 0.09606/0.09338 ms at 1198x852. The extra four history fetches
cost about 0.01 ms in this batched pass measurement. This is not whole-frame timing or a claim
about other devices; history targets and 28 bytes/pixel owned storage are unchanged. Temporary
commands/queries are destroyed and the normal render loop resumes.

## Upstream and handoff

No upstream-owned file changes in this correction. The existing Scene, UniformState and Picking
SGP-0022 seams are unchanged. Changes are owned shader, Specs, license assets, ADR and handoff
documents. Keep this correction in its own local checkpoint; no new phase is active. Owner
visual re-acceptance remains pending, with the same moving-content limitation as the initial R4.
