# P2 review: Aerial rain and snow

## Metadata

- Status: approved; created/updated: 2026-09-29
- Reviewer: current task, architecture/code self-review; no independent reviewer
- Target: codex/gpu-particles changes after 1a2de73dc3
- Parent: [P2](../plans/2026-09-29-p2-aerial-weather.md); [ADR-0103](../../../Documentation/SceneGIS/Decisions/ADR-0103-aerial-weather.md)
- Upstream-owned files: none; SGP: none

## Scope and conclusion

Two camera-local generic GPU pools provide aerial rain/snow in Globe and Planar. Weather shaders own wind, fall speed, drift, wrapping and view-dependent styling. The foundation gains initial fill and render-only styling with unchanged defaults. Example environment composition uses existing atmosphere, height fog and optional clouds. No additional fullscreen pass, geometry replay, readback or upstream hook is introduced. Architecture gate approves the P2 local checkpoint; project-owner visual acceptance remains pending.

## Findings

| ID    | Severity | Status   | Owner        | Finding and disposition                                                                                                                                                                                                                                                                                                                                                     |
| ----- | -------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-01 | medium   | fixed    | execution    | Camera-local simulation must preserve the previous simulation frame when time is frozen. Separate update/render transforms and saved state matrix now preserve overlapping world positions. Both-world GPU coordinate Specs compare camera displacement and wind integration with independent CPU calculations. Frozen-time browser view changes preserve weather coverage. |
| P2-02 | low      | fixed    | execution    | Initially narrow rain/small snow were difficult to read from aerial views. Increase bounded near/far pixel footprints; browser rain/snow inspection confirms visible depth layers at district/city views, and release shader Specs pass. This is artistic presentation, not droplet sizing.                                                                                 |
| P2-03 | note     | accepted | architecture | Fixed capacity, unlit sprites and periodic local volumes are appropriate to the authorized aerial scope. Document no roof shelter/collisions/surface state or particle motion vectors; optional cloud cost belongs to existing environment effects. No follow-up phase is activated.                                                                                        |

## Validation reviewed

- Eight weather Specs pass in development and release with WebGL validation on Chrome Headless 154 / Windows. They cover public contracts, lazy allocation, transitions, pick exclusion, paused/hidden time, pool replacement/destruction, both-world GPU wind/rebasing, rewind, rain/snow rendering and ceiling suppression.
- Eleven particle foundation Specs pass in development and release. New initial-fill scheduling/reset/seed continuation and render-only custom uniforms under frozen time are verified alongside prior integration, occlusion/picking, lifecycle and failure cleanup coverage.
- Browser Globe/Planar examples show precipitation without console errors. Planar rain/snow, district/city views, time freeze followed by view change, and optional overcast clouds are visually inspected. Benchmark mutations are removed by reload; final user example retains ordinary controls.
- Full buildRelease, buildTs and tsc pass. Existing buildTs documentation warnings do not name the new APIs. Focused ESLint/Prettier, changed Markdown checks and diff whitespace check pass. Generated barrels/types include SceneGISWeather and the new generic options.
- Baseline ownership audit against official 1.144 finds no changed upstream-owned files. Shader sources use the existing ADR-0030 owned GLSL region; no generated outputs are tracked.

## Bounded performance evidence

Local Windows / Codex Chromium / ANGLE D3D11 / RTX 3060 Ti, 1001×826, MSAA 1, FXAA and native OIT. Deterministic city boxes, fixed city aerial view, medium 32K total slots, full intensity, two active pools. Disable atmosphere/cloud processing for this incremental measurement; it is not a complete weather-environment frame budget. CPU frame scope surrounds Scene.initializeFrame/render; EXT_disjoint_timer_query_webgl2 surrounds frame submission. Advance scene time by 1/60 second, use 15 warmup and 40 sampled frames per case, task yields and asynchronous query readback; all reported rows have 40 valid samples. Queries include possible submission idle time and are not isolated shader execution times.

The first combined-atmosphere run had a shifting timing baseline and is not used for incremental claims. The isolated sequence also changed absolute baseline between the rain and snow groups, so use adjacent comparisons, not cross-group speed claims:

| Case, in measurement order | CPU median (ms) | GPU median / p95 (ms) |
| -------------------------- | --------------- | --------------------- |
| Rain, initial reference    | 0.2             | 0.819 / 0.836         |
| Hidden precipitation       | 0.2             | 0.727 / 0.733         |
| Rain                       | 0.3             | 0.817 / 0.825         |
| Snow                       | 0.2             | 0.288 / 0.292         |
| Hidden precipitation       | 0.2             | 0.240 / 0.241         |

Adjacent GPU median differences are approximately 0.09 ms for rain and 0.05 ms for snow in this bounded setup; they are indicative rather than a portable performance promise. CPU medians are near timer granularity, so no precise CPU speedup is claimed. Medium simulation textures occupy exactly 4,194,304 bytes; hidden weather retains those allocations. Active work is two MRT update draws plus two transparent commands before native derived OIT passes. Intensity zero after fading skips those commands. Quality/radius changes release and recreate pools; normal type/intensity/wind changes do not allocate.

## Remaining limits

Regional tangent approximation in Globe, artistic density/sizes, camera-local periodic coverage, native transparency limits and no particle motion vectors. Large sprite footprints can increase transparent fill cost; integrated scene/cloud cost must be measured by applications. Street-level roof shelter, wetness and snow accumulation are outside the authorized phase. Owner should judge the final visible rain/snow atmosphere in the independent example; this gate does not replace visual acceptance.

## Post-checkpoint example review

After c9fb09b5b0, owner feedback removes example clouds and replaces Globe's schematic blocks with public white-building data. Current-task architecture/code self-review approves the example-only change: native PolygonGeometry workers batch the local OSM snapshot, including holes; PrimitiveCollection owns release. Planar remains schematic. The phase-plan follow-ups record the changes and two passing example E2E tests. No engine, shader, public API or upstream file changes occur.

Height completeness is an accepted limitation, owned by the example: 501 source heights, 315 level-derived heights and 4,791 12-meter estimates. The source record with building=no is excluded. Original geographic footprints, license, snapshot and derivation are preserved/documented. Flat ellipsoid ground and estimated heights are explicitly disclosed, so this is a visual weather reference, not a surveyed city model. No unresolved code finding or further phase is opened.

## Follow-up review: Cesium ion scene

Target: example changes after 2a9f4d9fd6. The owner supersedes the preceding local-snapshot approach with direct ion streaming. Current-task architecture/code self-review approves native OSM Buildings, World Terrain and world imagery composition, removal of the snapshot/converter, and retention of the Planar schematic district. Native collections own scene resources; error listeners are removed on teardown, and late tileset completion destroys the unowned result when Viewer has already been destroyed. No engine, shader, public API or upstream file changes; SGP: none.

Three E2E cases pass (47 seconds): online Globe building/imagery readiness plus controls and destruction, Planar regression, and mocked ion 401 reporting with no local building substitute. The in-app browser visibly renders Nanjing buildings, imagery, terrain and rain/fog with completed loading status and no page error. Scoped lint/format/Markdown and whitespace checks pass. No new code finding remains. Accepted example dependency: network availability and valid ion authorization, explicitly requested by the owner; the SDK demonstration token is not a deployment credential. Original OSM height completeness is now a property of the streamed source, not this example's conversion policy. Owner visual acceptance remains the final weather-quality gate.

## Follow-up review: Rain intensity readability

Target: weather implementation after 8901942ea3; current-task architecture/code self-review. The reported weak intensity contrast reproduces at the owner's low district view even after disabling weather fog. Intensity uniforms/rank filtering work, but a 180-meter near radius leaves few visible particles before opaque buildings. Narrow soft rain streaks further reduce contrast. Reduce the near radius cap to 60 meters and interpolate rain footprints with intensity; preserve stable rank selection, weather physics, snow sprite dimensions, fixed capacities and generic renderer ownership.

Self-review approves this bounded presentation correction. Ten weather Specs pass in development and release with WebGL validation, including new both-world close-range image coverage, frozen-state/allocation invariance and existing transition, rebasing, snow, ceiling and destruction tests. buildRelease passes. Same-view Globe images at fixed Scene time, fog disabled, show visibly increasing light/medium/heavy rain; the user's environment settings are restored afterward. No public API change, new resource, per-particle CPU work, engine integration seam or upstream-owned file is introduced; SGP: none.

Bounded live check: Windows / Codex Chromium / ANGLE, 1219x826, streamed Nanjing scene, medium 32K slots, native OIT/FXAA, fog disabled and fixed Scene time. Interleave clear/light/heavy across 48 frames, 16 valid non-disjoint GPU queries per case, covering preUpdate through postRender. Whole-scene GPU median/p95 milliseconds are clear 8.693/11.278, light 8.730/11.153, heavy 8.362/11.853. These noise-level differences do not establish a speedup or a precise incremental cost. Frozen time isolates drawing, so this excludes continuing particle simulation. Active weather submits two particle commands versus zero at clear, and all cases retain exactly 4,194,304 bytes of particle state. Larger streaks increase potential fragment work; fixed memory does not promise zero fill-rate cost on other devices/views.

No unresolved code finding remains. Weather remains a visual density rather than millimeters per hour, and opaque depth testing still does not simulate roof shelter. Owner visual judgment is the final acceptance gate.
