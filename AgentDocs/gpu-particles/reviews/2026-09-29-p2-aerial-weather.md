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
