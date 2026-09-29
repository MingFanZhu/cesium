# P3 review: Approximate surface weather

## Metadata

- Status: approved; created/updated: 2026-09-29
- Reviewer: current task, architecture/code self-review; no independent reviewer
- Target: codex/gpu-particles changes after 781e2a9d90
- Parent: [P3](../plans/2026-09-29-p3-surface-weather.md); [ADR-0104](../../../Documentation/SceneGIS/Decisions/ADR-0104-approximate-surface-weather.md)
- SGP-0028; four upstream-owned files listed below

## Scope and conclusion

SceneGISSurfaceWeather applies caller-controlled wetness and thin snow before forward lighting using existing normals, material values and world positions. One Scene owns one optional setting; default/disabled behavior is unchanged. Particle precipitation remains independent. PBR, Phong and Globe/Planar terrain are supported; SSR material capture and explicit probe capture share the evaluation. No texture, framebuffer, extra geometry pass, runtime readback or simulation is introduced. Architecture/code gate approves the separate P3 local checkpoint. This does not replace owner visual acceptance.

## Findings and disposition

| ID    | Severity | Status   | Owner        | Evidence and disposition                                                                                                                                                                                                                                                                                                    |
| ----- | -------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-01 | note     | accepted | architecture | Existing imagery/materials do not identify shelter, drainage or land cover. Slope and world-fixed coverage meet the owner's approximate GIS scope; document no puddle depth, thickness or semantic protection. No follow-up is required by this phase.                                                                      |
| P3-02 | note     | accepted | architecture | Terrain retains native diffuse lighting and gains only an approximate direct wet highlight. It is not a new PBR or SSR receiver. This preserves the bounded integration surface; model SSR roughness is tested separately.                                                                                                  |
| P3-03 | low      | accepted | example      | The final desktop ion scene reports a world-imagery network failure, while buildings/terrain load and the online E2E readiness test passes. Keep the explicit loading error and local independent fixture; do not introduce a silent substitute or retry policy. Online visual inspection depends on available ion imagery. |

No unresolved code finding remains. Unlit/no-normal models, translucent content, classification and explicit water are intentionally excluded; this is documented rather than silently claiming universal material support. Explicit reflection probes must be recaptured by callers after changing weather.

## Validation reviewed

- Ten SceneGISSurfaceWeather GPU Specs pass in development and release with WebGL validation, Chrome Headless 154 / Windows. Coverage includes public validation/default/lifecycle, both-world PBR and terrain, Phong, unlit exclusion, snow slope and coat replacement, emission/alpha retention, large-coordinate camera stability, disabled restoration and SSR MRT roughness with zero capture replay draws.
- Five weather E2E cases pass: local material fixture in both worlds, online Globe controls/readiness/destruction, Planar aerial regression and explicit mocked ion authorization failure. Independent browser inspection shows snowy upward surfaces while walls retain colors. The final desktop imagery failure is recorded above.
- Full buildRelease, buildTs and tsc pass. Existing unrelated native JSDoc warnings remain; none name the new public API. Generated barrel/type output exports SceneGISSurfaceWeather. Generated files are not committed.
- Focused ESLint, formatting, Markdown and whitespace checks pass. Upstream patch audit passes with exactly four upstream-owned files in this delivery and no generated-file status changes.
- The required repository-wide AgentDocs Prettier check reports 318 existing formatting failures outside this delivery. Changed files pass the explicit scoped check; unrelated documents are not reformatted.
- Source/lifecycle inspection confirms lazy CPU-only setting state, weak caches, ShaderCache-owned derived programs and Scene teardown before Context destruction. Disabling restores base command selection. Shadows/picking remain on their original paths.

## Bounded performance evidence

Local Windows / Codex Chromium / ANGLE D3D11 / RTX 3060 Ti, 1219×826, MSAA 1, HDR and FXAA. The local Planar fixture has six material boxes and ground, no precipitation. Scene time and camera are fixed. CPU scope surrounds Scene.initializeFrame/render; EXT_disjoint_timer_query_webgl2 surrounds frame submission. Fifteen warmup frames precede ninety interleaved off/wet/thin-snow frames, thirty valid non-disjoint samples per case. Other app tabs remain active, so timings include scheduling noise and are not isolated shader benchmarks.

| Case            | CPU median / p95 (ms) | GPU median / p95 (ms) | Frame command count |
| --------------- | --------------------- | --------------------- | ------------------- |
| Off             | 1.80 / 3.00           | 0.392 / 3.505         | 5                   |
| Wet             | 2.30 / 3.40           | 0.387 / 2.503         | 5                   |
| Thin snow, 0.65 | 1.80 / 3.30           | 0.457 / 2.377         | 5                   |

An initial sequential run had baseline drift and is excluded from incremental claims. Interleaved wetness is within timing noise; thin snow adds roughly 0.065 ms to the GPU median in this small fixture. CPU medians/tails are noisy, so no precise CPU cost or city-scale performance promise is claimed. Counts are frameState.commandList entries, not raw GL draw-call counts. Source inspection confirms no added render targets or geometry replay. Partial snow adds fragment noise evaluation; zero/full snow skips it and distant footprints filter the pattern.

## Upstream boundary

All four upstream-owned files use paired SGP-0028 markers:

- packages/engine/Source/Scene/Scene.js: prepare, command integration and Scene-owned lifecycle.
- packages/engine/Source/Shaders/Model/LightingStageFS.glsl: material evaluation before lighting/specular filtering.
- packages/engine/Source/Shaders/GlobeFS.glsl: surface qualification, albedo coverage and native direct highlight.
- packages/engine/Source/Shaders/Builtin/Functions/phong.glsl: material-input hook for opaque Phong receivers.

Owned implementations, examples, Specs, ADR and patch registration form one P3 checkpoint. No subsequent phase is activated. Owner should compare dry/wet/snow in the independent example and real GIS scene, subject to online data availability.

## Follow-up review: Session authorization

Target: example-only changes after b81e7b8b61. Current-task self-review approves reading the optional sceneGIS.ionAccessToken sessionStorage entry before all ion provider factories. A mocked E2E test passes for all three initial requests with a synthetic token; source contains no credential. Live owner authorization removes the default-token notice and loads terrain/buildings. The imagery endpoint accepts authentication in a direct HTTP check, while the desktop browser still reports a network failure for that request. Keep P3-03 accepted as an online-example limitation; do not attribute it to invalid credentials or introduce an unrequested provider substitute.

Reflection diagnosis confirms no SSR instance in the aerial example, and existing terrain lacks an SSR receiver regardless of the toggle. No SSR/terrain renderer changes are included in this follow-up. No new upstream-owned files, SGP or phase are introduced. Focused source/Markdown checks and the new E2E test pass; engine build/tests are unchanged and need no rerun.

## Follow-up review: Model SSR control

Target: example changes after c376be3ccf. Owner requests only a model SSR toggle, explicitly excluding terrain integration. The example attaches the existing effect after enabling HDR, initially disabled, with a Chinese checkbox in the surface folder. Scene ownership covers disposal; the page explains the model-only scope. No engine, shader, public API or upstream-owned file is changed; SGP is unchanged.

Self-review approves the change. Focused Planar aerial E2E passes for default/off, enable/ready, disable and Viewer-owned destruction. Live Globe inspection reaches enabled/ready without a render error, preserving camera and wetness; imagery loads successfully this time. Source lint, formatting and changed Markdown checks pass. SSR retains its existing view/material limitations; no stronger terrain or planar-Phong support is claimed.

## Follow-up review: Clear-weather darkness

Target: example changes after 44e4bed9eb. Owner observes darkness despite clear precipitation and disabled surface coverage. Source and live values confirm independent physical lighting is permanently calibrated at 1 and weather fog retains a nonzero floor. The particle primitive does not own scene lighting. Correct the example with a fixed daylight scale of 3, no weather-dependent sun/exposure edits, and zero/disabled weather fog once intensity is zero or fog is unchecked. Keep surface state independent as previously agreed.

Self-review approves the bounded example fix. Same-view Globe inspection distinguishes the base-lighting cause from residual fog and qualifies the daylight calibration. Focused Planar E2E passes for rain-to-clear, unchanged lighting/exposure/surface values, zero fog and explicit fog disable, alongside SSR and lifecycle checks. Scoped formatting/lint/Markdown checks pass. Online ion intermittency remains an example dependency; no fallback or retry policy is introduced. No engine, shader, public API, upstream-owned file or SGP change.

## Follow-up review: Horizon sky brightness

Target: example changes after ef2b4b405f. The prior ground-facing visual check missed a separate background scale override of 1. With clear weather, zero fog and unchanged surface scale, changing only that background value to the Globe default of 4 corrects the dark horizon sky. Remove the example override to inherit the existing mode defaults, rather than altering exposure or wetness.

Self-review approves the one-line source correction and acknowledges the earlier incomplete visual coverage. Existing focused Planar E2E passes, and a reloaded Globe horizon view confirms the default background value and preserved user state. The current scene still has independently enabled wetness 0.65; selecting clear weather intentionally does not make surfaces dry. Scoped checks pass. No engine/upstream/SGP change; owner visual acceptance remains final.

## Follow-up review: Preset-linked surface visibility

The latest owner direction supersedes the previous example-only visibility policy. Weather presets now disable surface coverage for clear and enable it for precipitation; wetness/snow values survive both changes. Initial precipitation is wet. Manual controls still override the setting, and core weather/surface APIs remain independent. No frame-loop coupling, lighting change or additional render work is introduced.

The initial focused E2E found stale checkbox display after rapid manual and preset changes: lil-gui listen caches the previous sampled value, so intermediate user changes can be missed. Preset changes now use the controller's setValue to update the public setting and UI together. The same E2E passes (21 seconds), including nondefault value retention, both visibility directions, manual override, fog removal, SSR and disposal. Live Globe inspection confirms the final clear/off state and retained wetness at the owner's restored camera. Self-review approves; no unresolved code finding, new upstream file or SGP change. Online data availability and final owner visual acceptance remain the existing limitations.
