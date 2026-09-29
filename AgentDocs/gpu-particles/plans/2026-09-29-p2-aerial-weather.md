# P2: Aerial rain and snow

- Type: phase; status: completed; date: 2026-09-29
- Parent: [extension](2026-09-29-gpu-particles.md)
- Architecture review: confirmed; current task architecture/execution/self-review
- Entry checkpoint: 1a2de73dc3; owner selected aerial weather
- Related: [scope](../discussions/2026-09-29-weather-scope.md), ADR-0103; upstream/SGP: none planned

## Source facts

P1 uses one MRT simulation and one instanced draw per pool, local state, normal-time updates and no pick simulation. Its source/exports/types are generated through the existing ADR-0030 build chain. Drawing currently has no custom styling hook and reset always clears the pool. Weather requires populated volumes and view-dependent streak alignment even while simulation time is frozen. Native czm_metersPerPixel is available in vertex shaders and takes eye position plus pixel ratio. SceneGISEnvironmentEffects already owns atmosphere/height fog/cloud controls; no additional fullscreen weather pass is necessary.

## Design and boundaries

- Add generic optional initialParticles and renderShader/styleParticle to SceneGISGpuParticleSystem. Defaults preserve P1. The style function modifies a draw-local copy; uniforms are available to both shaders, GPU state is unchanged by rendering/picking. Reset initializes requested slots at age zero and continues the seed/slot sequence.
- Add SceneGISWeather primitive, owned by scene.primitives, explicit immutable mode globe/planar. It owns two generic pools with low/medium/high total slot budgets 16K/32K/64K, both using weather-owned GLSL. Public show/paused, type rain/snow, intensity 0..1, windVelocity (local XY or ENU m/s), radius, ceilingHeight, particleSize, color and transitionDuration. Quality/radius changes recreate the bounded volume; type/intensity/wind changes reuse allocations.
- Current camera translation/ENU defines the draw frame; saved simulation frame is transformed on GPU into that frame before integration. Rendering rebases without simulation when time is frozen. Periodic wrapping refills the camera volume; overlap is world-stationary. Near/far distance fades conceal wrapping edges. Render-only styling handles projected velocity, pixel footprint and ceiling fade. Globe uses local tangent approximation over at most five kilometers.
- Scene time drives integration and transitions. No per-particle CPU loop/readback, no hidden time clamp or render requests. Hidden/paused frames observe time; clock rewind resets. Zero intensity skips GPU updates after the transition. Weather is excluded from picking.
- Independent deterministic district example, both worlds, aerial views at different heights, rain/snow/wind/quality controls and existing height-fog/overcast composition. No public scene data dependencies. Existing scene lighting remains caller-controlled.

## Steps and validation

1. Foundation options plus focused tests for initial fill/reset/seed continuation and render-only uniform styling with frozen simulation.
2. Weather implementation and shader tests for wind, coordinate rebasing, pause/pick, transition, ceiling, quality/radius replacement and resource lifecycle. Qualify both-world native rendering/depth behavior.
3. Independent example and browser visuals for rain/snow, moving/rotating/frozen cameras and aerial views; record bounded incremental CPU/GPU cost and allocated memory.
4. Relevant development/release Specs, full release/types, scoped lint/docs, self-review and separate P2 local checkpoint.

## Risks

Fixed-budget sprite rendering is visual precipitation, not rainfall measurement. Pixel-size floors improve distant visibility but are artistic. OIT is approximate, TAA has no particle motion vectors, no shelter/collision or surface state. Globe local tangent volumes approximate altitude/vertical. Wind and texture bandwidth still cost GPU time; large transparent footprints can dominate.

## Completion and handoff

Implementation follows the plan without new renderer hooks. Bird's-eye inspection required larger particle pixel footprints than the initial draft; near/far rain and snow remain bounded in world extent and retain distance fades. The example aligns precipitation ceiling with optional cloud base and exposes weather-linked height fog separately. No source data download is required.

Eight weather plus eleven foundation Specs pass in development/release with WebGL validation. Full release, generated types and tsc pass. Browser inspection covers both worlds, rain/snow, aerial heights, frozen-time view changes and cloud composition without errors. Lifecycle and world-space motion have direct GPU/CPU numerical tests. Scoped checks and upstream ownership audit pass. See [P2 review](../reviews/2026-09-29-p2-aerial-weather.md) for timing, evidence and accepted limits. Architecture gate approves the separate P2 checkpoint; owner visual acceptance remains pending, with no later phase activated.

## Follow-up: remove example cloud composition

Owner visual feedback requests removing cloud support from this weather example. Remove the cloud preset parameters, settings field, GUI callback and explanatory text; keep showClouds/showCloudShadows explicitly false. Rain/snow and existing atmosphere/height fog remain. This is a small example-only revision after c9fb09b5b0, with no engine, shader or public API change. Validate scoped lint/formatting and the Globe page's controls/render errors; no full build or repeated engine Specs are needed.

Completed: Globe browser renders rain and height fog without console errors; the cloud control is absent. Scoped ESLint/Prettier and Markdown validation pass. Architecture/code self-review confirms the removal is limited to example composition and current usage documentation; no upstream files, SGP or new unresolved risk.

## Follow-up: real city reference

Owner requests real data and explicitly accepts public white buildings; Planar may retain its schematic district. Replace Globe's boxes with a pinned local OpenStreetMap building-footprint extract for central Nanjing. Render original WGS84 polygon rings/holes as one native batched extruded PolygonGeometry primitive. Preserve height tags, derive missing heights from levels, otherwise use a disclosed 12-meter display estimate. Document ODbL attribution, snapshot/query and conversion. Runtime must not request a public API or ion token. Adjust Globe camera presets to the actual district; retain weather controls, fog and the removal of clouds. Validate source geometry/height metadata during preparation, browser data load/appearance and errors, scoped checks and an example-level load/lifecycle test. Engine API and shaders are unchanged; no upstream files/SGP planned.

Completed: the extract contains 5,607 polygon features and 37 inner rings. Height sources are 501 OSM heights, 315 estimates from levels and 4,791 explicit 12-meter display estimates. The offline preparation script validates rings, coordinates and heights; it excludes one building=no underground commercial-area record. Globe browser displays the real city footprint with rain/fog, without errors. Two example E2E cases pass for data loading, Globe/Planar views, snow controls, absence of cloud controls and deterministic resource release. Scoped lint/format/Markdown checks pass; no engine build or engine Spec rerun is required. Self-review accepts the disclosed height/flat-ground approximation for weather visualization. Both data and source attribution are local fixtures, no new public service dependency or upstream patch is introduced.
