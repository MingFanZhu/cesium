# GPU Particles

2026-10-28 wind follow-up adds the narrow optional `timeSource` clock callback; default Scene-time
behavior is preserved. This work is tracked in the existing [urban-wind W5 plan](../urban-wind/plans/2026-10-28-w5-particles.md),
not a new weather phase. See ADR-0102 amendment and the generic clock regression Spec.

P5 completed: [unified weather composition](plans/2026-09-30-p5-weather-composition.md),
following checkpoint 51be32aa8d. Existing fog/surface/lens effects are integrated into
SceneGISWeather with explicit manual control. ADR-0106; no upstream changes.

- Updated: 2026-09-30; status: unified weather implemented, owner Viewer acceptance pending; planning model: extension
- Architecture/execution/reviewer: current task, self-review
- Active extension: [roadmap](plans/2026-09-29-gpu-particles.md)
- Current phase: P5 completed implementation after static frost checkpoint 51be32aa8d; [review](reviews/2026-09-30-p5-weather-composition.md)
- Open discussions / unresolved code reviews: none; [snow lens review](reviews/2026-09-29-snow-lens.md), [rain lens review](reviews/2026-09-29-lens-texture.md), [approved P4 review](reviews/2026-09-29-p4-rain-details.md)
- ADR: [0102](../../Documentation/SceneGIS/Decisions/ADR-0102-gpu-particle-foundation.md), [0103](../../Documentation/SceneGIS/Decisions/ADR-0103-aerial-weather.md), [0104](../../Documentation/SceneGIS/Decisions/ADR-0104-approximate-surface-weather.md); SGP: SGP-0028
- Source: packages/engine/Source/SceneGIS/Scene/SceneGISGpuParticleSystem.js, SceneGISWeather.js, SceneGISSurfaceWeather.js, SceneGISRainLensStage.js, SceneGISSnowLensStage.js
- Shaders: packages/engine/Source/Shaders/SceneGIS/Particles/, Weather/
- Specs: packages/engine/Specs/SceneGIS/Scene/SceneGISGpuParticleSystemSpec.js, SceneGISWeatherSpec.js, SceneGISSurfaceWeatherSpec.js, SceneGISRainLensStageSpec.js, SceneGISSnowLensStageSpec.js
- Examples: Test/Rendering/GPU粒子.html, Test/Rendering/鸟瞰天气.html, Test/Rendering/地表雨雪.html, Test/Rendering/降雨细节.html, Test/Rendering/降雪细节.html; no new Sandcastle
- Branch: codex/gpu-particles; P1 checkpoint: 1a2de73dc3
- P4 decision: [ADR-0105](../../Documentation/SceneGIS/Decisions/ADR-0105-rain-surface-and-lens-details.md); no new upstream patch

## Handoff

Use SceneGISWeather with scene and the existing environmentEffects to obtain complete
weather orchestration; pass existing surface/lens instances if Viewer already owns
them. Read-only component references expose the same objects, not duplicate effects.
fog/surface/lens groups support automatic/manual authority and retained strengths.
The aerial example no longer supplies a weather-update loop. Source, ownership and
same-frame/request-render timing contracts are in ADR-0106 and the updated guide.
Eighteen development/release weather Specs and the local aerial interaction test pass;
release/type checks and desktop snow/fog/surface/frost inspection pass. P5 review
records limits and the pending Viewer integration/owner visual acceptance. No other
checkout or chat was modified; the owner can use the guide in the ongoing Viewer task.

The owner clarified that snow lens should be static frost on glass, not attached flakes. The completed correction replaces the flake/melt controls and shader with intensity/coverage and a packaged static crystal texture, retaining the stage name and weather selection. Three GPU Specs pass in development/release, five scoped E2E cases pass, and full release/types plus engine asset delivery are verified. Both-world desktop visuals show edge frost with a clear center. A bounded batch timing at 1001×826 measures about 0.342 ms incremental median, with a 6 MiB sampled texture and one native output target. No upstream/SGP change or later phase; owner visual acceptance is pending. See the current plan/review and ADR-0105 amendment. The following initial snow checkpoint is superseded visually/API-wise by this correction.

Snow follow-up adds a separate, disabled-by-default SceneGISSnowLensStage with intensity, flakeSize and meltDuration. Sparse matte flecks soften into wet traces in one native color pass, without fixed glints or external assets. The aerial example selects the rain/snow stage by precipitation type; clear and hidden precipitation disable both, with independent manual toggles. Both-world local pages and six scoped E2E cases pass; three GPU Specs pass in development/release. Fixed-camera RTX 3060 Ti timing at 1185×667 measures approximately 0.515 ms incremental median. See the plan/review for build, lifecycle and approximation limits. Owner visual acceptance is pending; no later phase is active.

Lens follow-up packages an MIT refraction/height sprite and adds static/rolling beads with visible-color reflection and a subtle lower edge. The owner selected the RaindropsOnGlass appearance but rejected the fixed bright glint; that lobe is removed from the final shader. Keep one post-process pass and no simulation/capture. Three GPU Specs pass in development/release and both-world E2E passes. Final RTX 3060 Ti fixture cost is approximately 0.301 ms at 1001×826. Code self-review approves a follow-up checkpoint; visual acceptance remains pending. See the follow-up plan/review for lifecycle, packaging and approximation limits. No subsequent phase is active.

P4 adds opt-in wet-ground ripple normals and independent lens beads/trails, without water-surface work. Default public behavior remains unchanged. Fourteen GPU Specs pass in development/release, four scoped E2E cases pass, full release/types and self-review pass. See the P4 plan/review for resource/timing evidence and limitations. Independent local Globe/Planar examples are visually qualified; the online aerial page retains the owner's camera/weather with new controls, but reports a world-terrain network/ion error. P4 is ready for its own local checkpoint; no subsequent phase is active. Owner visual acceptance is the remaining gate.

P1 checkpoint is complete. P2 implements aerial rain/snow using the generic foundation, preserving shader-owned physics and adding reusable initial fill and render-only styling. Automated and browser validation and architecture self-review are complete; P2 is included in its own local checkpoint after P1. Roof shelter and surface state were outside P2. See the P2 plan, review and resolved scope discussion; P3 separately adds the authorized approximate surface state.

Post-checkpoint owner feedback removes cloud composition from the weather example. Rain/snow, atmosphere and height fog remain; the standalone environment subsystem is unaffected. See the P2 plan follow-up.

The owner superseded the local snapshot with native Cesium ion OSM Buildings, World Terrain and default world imagery streaming. Globe uses existing SDK authorization and the Nanjing camera; Planar retains its schematic district. The local city fixture and converter are removed. Example validation is Specs/e2e/scenegis-weather.spec.js with Test/Rendering/playwright.weather.config.mjs; Globe requires network/ion access. Checkpoint: 781e2a9d90.

P3 implements approximate wetness/thin snow from existing data, without authored GIS material attributes. ADR-0104/SGP-0028 define a separate SceneGISSurfaceWeather setting and material-local evaluation, independent of particle simulation. Development/release GPU Specs, five example E2E cases, full release/types and patch audit pass. Self-review approves the P3 checkpoint; owner should inspect the local material fixture and aerial example. The latter requires ion/network access; world imagery failed during the final desktop check although online E2E passed. No subsequent phase is active.

Post-P3 local authorization uses the current tab's optional sessionStorage entry sceneGIS.ionAccessToken; credentials never enter repository files. The targeted authorization E2E passes. Imagery had an intermittent desktop network failure; the latest SSR-toggle inspection loads imagery successfully. The aerial example now exposes an initially disabled model SSR switch using the existing Scene-owned effect. Terrain remains excluded, as explicitly requested by the owner. Planar toggle/ready/destruction E2E and live Globe readiness checks pass. See the P3 follow-up plan/review.

Clear-weather follow-up corrects the example's dark base lighting and residual fog: use fixed surfaceRadianceScale 3 independently of presets, and remove/disable weather fog at zero intensity. Switching clear preserves independent wetness/snow and SSR. Focused E2E verifies the separation; same-view Globe inspection qualifies brightness. Online ion access remains intermittent. No engine or upstream changes.

Horizon-view feedback additionally removes the example's dark background override: sky brightness now inherits Globe 4 / Planar 10. Reloaded Globe horizon inspection and the existing focused E2E pass.

The latest owner direction supersedes independent surface visibility in the aerial example: precipitation presets enable coverage (initially wet), while clear disables it. Wetness/snow values are preserved, and manual surface overrides remain available. Core APIs remain independent. The focused E2E passes for custom-value retention, clear/off, manual override, precipitation/on and disposal. The Globe page is left clear with coverage off, retained wetness 0.65 and the owner's camera restored. No engine/upstream/SGP changes.

Rain-readability follow-up tightens the near particle volume to a 60-meter cap and gives stronger rain wider/longer streaks. Intensity already controlled the visible random subset; buildings and thin sprites made its differences hard to see. Same-view light/medium/heavy comparisons without fog now separate clearly. Ten weather Specs pass in development/release, buildRelease passes, and fixed medium memory/submissions are retained. See the [P2 follow-up plan](plans/2026-09-29-p2-aerial-weather.md) and [review](reviews/2026-09-29-p2-aerial-weather.md). No API/upstream/SGP change or later phase; owner visual acceptance remains pending.
