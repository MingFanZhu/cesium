# Discussion: A13-G Globe Performance Source Discovery

## Metadata

- Type: `discussion`
- Status: `open; initial evidence, source diagnosis assigned`
- Author role: Architecture Agent
- Created / updated: `2026-09-04`
- Product baseline: `fd868387d4c38d6faf67a9395434cc9fccc6384c`
- Plan: [A13-G](../plans/2026-09-04-phase-a13g-globe-performance.md)
- Review: [A13-G](../reviews/2026-09-04-a13g-globe-performance.md)

## Current-source facts, not a measured cost ranking

Paths below are relative to `packages/engine/Source/`.

| Work            | Confirmed current behavior                                                                                                                                                  | Source anchor                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud body      | Globe medium/high scale 1.0; progressive cap 500, 50 m minimum, growth 1.01; early exit at segment end or transmittance 0.01                                                | `SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`: `cloudQualityProfiles`, `executeCloudPass`; `Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.glsl`: progressive march |
| Cloud lighting  | Retained density samples evaluate local Sun optical depth, optional Beer body queries and ground optical depth; high ground ray count differs from medium                   | `SceneGISVolumetricClouds.glsl`: `sunOpticalDepth`, `groundOpticalDepth` branches                                                                                                                    |
| Cloud resolve   | Existing 3x3 current reads, full-resolution output, A12 variance bound and established temporal/semantic rejection                                                          | `executeCloudResolve`; `SceneGISEnvironmentEffectsCloudResolveFS.glsl`                                                                                                                               |
| Beer shadows    | On active cloud-shadow/ray frames: clear, one producer execution per active cascade, then one atlas resolve; high is three 768-square cascades with 50-step producer budget | Renderer: `prepareGlobeLighting`, `renderBackground`, `cloudQualityProfiles`                                                                                                                         |
| HDR optics      | One aerial/fog/cloud composition target, then Bloom threshold + three horizontal/vertical pairs + composite when active                                                     | Renderer: `executeHdr`, `executeBloom`                                                                                                                                                               |
| CPU publication | `updateFrame` is reached from preparation/background/HDR; celestial work already guards same frame number and JulianDate                                                    | Renderer: `updateFrame`, `updateGlobeCelestialAuthority`                                                                                                                                             |

Graph lookup located renderer symbols but returned obsolete source offsets
and incomplete GLSL coverage. The anchors above were checked directly against
the current files; historical A6 profile/resource prose is not current cost
authority. In particular, BSM now has its accepted temporal resources and
Globe medium/high no longer use the original half-resolution profile.

No matching timer-query abstraction was found in the inspected Cesium
`Renderer` source. Native `PerformanceDisplay.update` measures elapsed frame
cadence, not GPU command duration. A new raw-GL timer path is not authorized.

## Bounded live baseline — 2026-09-04

The original accessible page remains at `Test/高级环境.html?a11-owner-gate=1`.
It has changed since A12 visual observation through owner interaction; the
performance sample uses its present state, not a restored historical camera.

- Ready/HDR, high/mixed, coverage `0.35`, density `0.5`, cloudTime `0`.
- OSM Buildings loaded, native Moon visible; effect controls including cloud
  shadows, rays, Bloom and Moon lighting/shadows enabled.
- Drawing buffer `1433 x 1150`; default loop active, requestRenderMode false,
  simulation animation paused; document visible, browser/render errors `0`.
- One `1501 ms` public postRender window observed `31` renders: `20.6529`
  frames/s, median interval `49.1 ms`, P95 interval `63.2 ms`. Camera remained
  unchanged during this window. This short sample is a diagnostic starting
  point, not a benchmark distribution or acceptance threshold.
- A separate Chrome CPU sampling window lasted `1748.497 ms` with `840`
  samples. Performance metrics over `1.790339 s` reported main-thread task
  duration `0.575489 s`, script duration `0.307883 s`, layout `0.005528 s` and
  style recalculation `0.000717 s`. Sampled idle time was `1187.285 ms`;
  unclassified program time was `261.264 ms`. Named self samples included
  `continueDraw`, terrain command assembly, credits, uniforms and tile SSE.

The original longer collection hit the browser tool's command timeout and
produced no usable timing record. Both profilers were disabled; the later
short bounded samples above completed. No scene reload, camera/tier/parameter
change, screenshot readback, software instrumentation patch or test run was
performed. Temporary observation listeners and profilers were removed, and
the default loop and saved time/parameters remained unchanged.

Main-thread saturation is not established by these samples. GPU or presentation
work is a plausible next focus, not proven attribution: idle time is not GPU
duration, and neither the frame interval nor a maximum shader loop count
identifies the responsible pass. Device load, native geometry, streaming and
the observer itself can affect such short windows.

## Decision and open questions

Preserve accepted image quality and investigate before changing code. The
execution report must identify which current work can be eliminated or shared
without altering results, rather than beginning with lower resolution, fewer
samples or weaker lighting. Resolve these questions first:

1. Which of body traversal/light sampling, Beer production/resolve and
   full-screen composition offers the best evidence-backed first target?
2. Which inputs make that work necessary, and which existing caches/early-outs
   already address it? Noise/history evolution must not be frozen accidentally.
3. What smallest supported measurement would separate the leading candidates
   while retaining the user's scene and avoiding a new profiler framework?

Return at most three ranked proposals, with benefits labeled measured or
inferred. Architecture will then choose a bounded implementation or further
measurement; no speedup or product change has yet been approved.
