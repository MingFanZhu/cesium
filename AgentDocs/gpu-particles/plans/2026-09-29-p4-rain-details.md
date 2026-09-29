# P4: Surface ripples and lens rain

- Type: phase; status: completed implementation; owner visual acceptance pending; created/updated: 2026-09-29
- Parent: [extension](2026-09-29-gpu-particles.md); entry checkpoint: 87debf6371
- Architecture/execution/review: current task, self-review; architecture entry confirmed
- ADR-0105; upstream-owned files / SGP: none planned

## Owner scope and source facts

Owner requests rain ripples and lens effects, explicitly excluding water-surface ripples. SurfaceWeather already modifies opaque material normals before native PBR/Phong lighting and SSR capture; terrain has an owned wet-highlight helper. Its prepare hook supplies camera-reduced world coordinates. Native PostProcessStageCollection executes ordinary stages after tone mapping and before FXAA, owns their targets and destroys them on removal/Scene teardown.

## Implementation

1. Add default-zero rippleIntensity and positive meter rippleScale to SurfaceWeather. Evaluate expanding procedural rings only on wet, upward-facing, non-snow surfaces; filter subpixel patterns. Use world-fixed dominant-axis projection, tangent-plane distance correction, CPU-reduced origin and Scene-time periodic phase. Change normals only, retaining alpha, emission, base material, existing passes and resource ownership. Water remains excluded.
2. Add SceneGISRainLensStage as a native PostProcessStage subclass, explicitly added to scene.postProcessStages. Borrow Scene for its clock; inherit collection lifecycle. Default disabled, expose intensity, dropletSize and distortion. Single color-only pass creates stationary beads plus downward-moving drops/trails, refracts/softens only their footprints and preserves source alpha. No geometry/depth replay, history, external textures, forced frames or weather auto-registration.
3. Aerial example independently toggles ripples/lens and links their intensities to actual rain (not snow). A dedicated deterministic local example exposes both-world controls, close wet surfaces, camera/time controls and lifecycle cleanup. Explicit weather APIs remain independent.

## Validation and exit

GPU Specs verify zero/dry/snow/wall/far equivalence, time evolution/freeze, world anchoring, PBR/Phong/terrain and SSR response, plus lens identity, bounded color/alpha, parameter validation and removal/destruction. Existing surface/weather regressions remain relevant. E2E covers independent example loading and rain/snow/clear controls. Build release and public types, inspect both-world examples and bounded resource/timing evidence, then record review and an independent P4 checkpoint. Owner visual judgment is final.

## Limits

Material ripples have no displacement, collision/shelter map or real puddle mask; smooth world projection changes orientation at dominant-axis boundaries. Far patterns fade by pixel footprint. Lens rain is an artistic screen effect, not fluid simulation or actual camera exposure. Large foreground drops may obscure content, so the effect remains optional. No changes to lake/river water.

## Completion and handoff

Implemented both optional effects in SceneGIS-owned code only. SceneGISSurfaceWeather modifies base and clearcoat normals; SSR MRT stores the changed reflection ray with the same target and zero capture replay. Native lens stage preserves source alpha, uses one native target, and frees/recreates its program through ordinary enable/remove/Scene lifecycle. Aerial rain links both intensities independently; clear and snow disable them. The local rain-details entry supports both worlds without network data.

Development/release WebGL validation passes 12 surface and 2 lens Specs. Four scoped E2E cases pass (two rain-details worlds, local surface regression, Planar aerial clear/snow/controls/disposal). Full buildRelease/buildTs/tsc pass. Current-task architecture/code self-review is [approved](../reviews/2026-09-29-p4-rain-details.md), including resource/timing evidence. No implementation deviation or new upstream patch.

Desktop Globe/Planar visuals are qualified in the dedicated local scene. The existing Globe aerial page has new controls with the prior camera/weather restored; it reports a world-terrain network/ion failure while buildings are visible. Do not treat that online data failure as a shader fallback. Owner should judge appearance, especially optional lens strength. P4 is ready for its independent local checkpoint; no subsequent phase is active.
