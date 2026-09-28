# ADR-0097: Hierarchical Screen-space Reflections

- Date: `2026-09-28`; status: `accepted; implemented and technically verified`
- Phase: [R18](../../../AgentDocs/rendering-quality/plans/2026-09-28-r18-screen-space-reflections.md)
- Amends ADR-0086 / ADR-0091; no new upstream modification or SGP

## Reference and platform boundary

Use AMD FidelityFX SDK v1.1.4, commit
`c6efa6bf7f2027b3ec94f28578bb5965eabb9e55`, specifically
`sdk/include/FidelityFX/gpu/sssr/ffx_sssr_intersect.h` and
`sdk/include/FidelityFX/gpu/denoiser/ffx_denoiser_reflections_reproject.h`.
The MIT license and revision manifest ship in `Assets/SceneGIS/Reflections`.
See [SSSR design](https://gpuopen.com/manuals/fidelityfx_sdk/techniques/stochastic-screen-space-reflections/)
and [reflection denoising](https://gpuopen.com/manuals/fidelityfx_sdk/techniques/denoiser/).

Adapt cell-boundary hierarchical traversal, virtual-image parallax reprojection,
receiver rejection and neighborhood clipping. WebGL2 fragment passes replace compute
dispatch; no wave operations, indirect dispatch, stochastic GGX ray sampling or object
motion vectors are introduced. This is a bounded adaptation, not FidelityFX integration.

## Decision

Reuse current main MRT and native compatibility capture. Generate six reduced min-depth
textures; independent targets avoid read/write texture feedback and reuse native renderer
facilities. Full-resolution linear depth remains authoritative for hit confirmation.
Keep water's separate ray path unchanged.

`SceneGISScreenSpaceReflections.resolutionScale` selects 0.5 (default) or 1.
`temporalFiltering` defaults to true; `reset()` invalidates history after caller-owned
content/light edits. Configuration, projection, resize, enable transitions and interrupted
render sequences invalidate automatically. No hidden extra render/settling frames.

Trace, hit metadata and reflection history use trace resolution. Full-resolution bilateral
reconstruction preserves receiver boundaries. History uses reflected virtual positions
for mirror parallax, camera-relative transforms computed in JS doubles, current/previous
jittered projections, normal/material/depth rejection and current-neighborhood clipping.
Misses immediately restore IBL; history cannot introduce offscreen reflected objects.
Moving objects have conservative rejection, not correct object-motion reprojection.

Native BRDF weighting, direct/emissive light, AO composition and clearcoat remain intact.
Disabled effects retain allocated resources by the existing contract; destroy releases all
owned targets and programs. Half resolution trades thin-reflector detail for cost; callers
can explicitly select full resolution. Do not replace native Scene AA or camera controls.

## Acceptance

GPU Specs cover hit/miss, receiver boundaries, history invalidation, camera reprojection,
clearcoat, Globe/Planar precision, orthographic/multiple-frustum compatibility and lifecycle.
Compare isolated GPU SSR cost and fixed Bistro frames. Keep a standalone example and
public controls. Full release/types and patch audit precede the phase checkpoint.

The [R18 review](../../../AgentDocs/rendering-quality/reviews/2026-09-28-r18-screen-space-reflections.md)
records the checks, isolated GPU improvements, added history storage and remaining visual limits.
