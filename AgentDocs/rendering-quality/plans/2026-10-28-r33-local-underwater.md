# R33: Local underwater medium and bottom caustics

- Type: phase plan; status: technically complete, owner visual gate pending; 2026-10-28.
- Owner/roles: current architecture and implementation task.
- Baseline: R32 checkpoint `8a5600d08a`; owner requests continued water improvements.
- Parent: [roadmap](2026-09-18-rendering-quality-extension.md).
- ADR: [ADR-0196](../../../Documentation/SceneGIS/Decisions/ADR-0196-local-underwater.md).
- SGP: reuse unchanged SGP-0017; implementation stays SceneGIS-owned.

## Source facts and design

WaterFrame already composes water after captured opaque lighting and before
translucency, once per native frustum. Captures currently require a visible surface
command, which fails when an underwater camera looks down and the surface is behind
it. Surface shaders explicitly discard the underside.

Add opt-in local water volumes through `underwaterDepth` (zero disables). Reuse
the authored polygon including holes, rigid placement and a finite bottom cap.
CPU tests only camera membership; GPU clips each eye ray to the nearest polygon
edge/top/bottom and opaque depth. No per-frame GPU readback. Activate opaque inputs
also when the camera is in a volume; resolve medium once at the nearest frustum.
Reuse coefficient optics with analytic incident/view attenuation, and render the
underside with water-to-air Fresnel/TIR and existing screen reflection/sky inputs.

The first volume contract is local XY, including Globe ENU, not regional curved
or river water. The boundary is the mean plane; wave-exact camera immersion and a
near-plane meniscus are explicitly deferred. Overlapping water volumes and
translucent submerged objects remain unsupported. Do not present a whole-screen
tint as finite-volume rendering.

Owner correction during implementation: do not use an unrelated procedural slope
field as a substitute for actual wave refraction. Replace that unaccepted draft
with a GPU refracted mesh/area-ratio caustic map, following the algorithm explained
and demonstrated by [Evan Wallace](https://madebyevan.com/webgl-water/). Sample the
existing FFT normal/displacement fields; analytic mode uses its existing wave
slopes. Accumulate overlaps, filter the world-anchored map and modulate captured
bottom radiance. This remains single-interface, finite-resolution focusing.

Add copied immutable `bathymetry` input in local meters (rectangle, dimensions,
row-major signed depths). It is authoritative authored bathymetry, not a hidden
camera-dependent terrain query. It drives shallow-foam generation/transport/decay
in a fixed GPU field, and caustic projection onto the receiver height field.
No bathymetry retains legacy contact foam; caustics require the explicit field.
The fixture samples its own bank geometry once. Depth capture from arbitrary
terrain/models and dynamic bathymetry are separate future integrations.

## Steps and validation

1. Owned volume helper/shader, shared optical helpers and documented public limits.
2. Narrow owned WaterFrame visibility/draw integration; no Scene.js changes.
3. Underside and caustics plus example entry/exit/underwater controls.
4. GPU regressions for finite bounds/holes, looking down, optical distance, disable,
   both coordinate systems, frozen animation, resource cleanup and runtime changes.
5. Both-world browser captures and bounded GPU/resource evidence; builds/types,
   related water regressions and source review, then independent checkpoint.

References: [Crest underwater](https://docs.crest.waveharmonic.com/Manual/Basics/Underwater.html),
[GPU Gems caustics](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics).

## Handoff

[Technical review](../reviews/2026-10-28-r33-local-underwater.md) records source
review, 68 release GPU cases, both-world browser runs, resource cost and open limits.
This phase commit is the independent local checkpoint; no next phase is activated.
