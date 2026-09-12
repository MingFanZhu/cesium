# A6-G Temporal and Performance Source Discovery

## Status

- Date: `2026-08-28`
- State: `resolved by Architecture; implementation assigned`
- Scope: Globe A6-G only; Planar deferred
- Decision:
  [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)
- Phase plan:
  [A6-G phase plan](../plans/2026-08-28-phase-a6g-globe-temporal-stabilization-performance.md)

## Question

How should SceneGIS stabilize the completed Globe cloud/shadow-length stack
during camera and cloud motion without copying the reference project's third
MRT, separate Beer-shadow history, multi-frame convergence or raw WebGL TAA?

## Current source facts

The accepted A4R renderer already owns the only cloud history authority: two
full-resolution ping-pong framebuffer managers, each with color/transmittance
and distance/front/validity attachments. A5 packs shadow length into the same
distance alpha and every atmosphere/fog/haze consumer reads the resolved value.

The current resolve is screen-locked. It samples history at the current UV and
includes camera position/basis, surface ENU and frustum in a per-frame joined
string key. Camera motion therefore invalidates history rather than
reprojecting it. Stationary frames intentionally publish current spatial output
without accumulation; this request-render-safe behavior is retained.

Current `cloudQuality` already controls the complete Globe budget: cloud buffer
scale, primary/fine/Sun steps, detail use, Beer cascade count, tile resolution
and Beer steps. It is warm and caller-writable. No FPS monitor or autonomous
quality controller exists.

## Fixed reference facts

The audited `three-geospatial` cloud resolve stores depth/velocity, projects a
cloud hit with previous view/projection matrices, variance-clips history and can
use a 16-phase sparse temporal upscale. Its shadow pass owns another temporal
resolve/history set. The audited Cesium fork also contains raw `_gl`, PBO and
RGBA8 final-frame TAA machinery.

Useful algorithmic authority is limited to previous-frame reprojection and
current-neighborhood clipping. The reference containers are not copied:

- the SceneGIS distance attachment already carries reconstructable mean/front
  and scene distances, so a velocity attachment is unnecessary;
- A5 shadow length already shares the Cloud history channel, so another shadow
  history is incompatible;
- 16-frame sparse convergence is incompatible with a complete single
  request-render frame;
- reference quality presets are caller-selected profiles, not FPS feedback.

## Resolution

- Evolve the existing A4R history in place for Globe world-position
  reprojection, including caller-owned cloud advection.
- Keep invalid and stationary frames spatial-only; distinguish bounded smooth
  motion from camera cuts before sampling history.
- Decode and reproject cloud validity and A5 shadow length semantically, then
  repack the existing alpha.
- Replace the allocation-heavy string key with one reusable structured
  compatibility snapshot.
- Keep `cloudQuality` as the sole caller-owned runtime performance tier. Do not
  add automatic FPS, timer, motion downgrade or a public mode.
- Keep the current Beer surface atlas spatially stabilized and history-free.
- Add no texture, FBO, attachment, pass, command, program category, upstream
  seam, asset or Planar behavior.

## Reference authority

- `three-geospatial` commit
  `b012ad06d858fc035d88aacfd73f092f93c994e4`, especially
  `packages/clouds/src/CloudsPass.ts`, `CloudsResolveMaterial.ts`,
  `shaders/clouds.frag`, `shaders/cloudsResolve.frag`, `ShadowPass.ts` and
  `shaders/shadowResolve.frag`
- `cesium-clouds-atmosphere` commit
  `1f38602b84ab5c3f2bc289f9e4464df3db917155`

No reference source, binary or runtime dependency enters the repository in
A6-G.
