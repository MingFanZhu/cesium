# GPU Particles

- Updated: 2026-09-29; status: implemented, owner visual acceptance pending; planning model: extension
- Architecture/execution/reviewer: current task, self-review
- Active extension: [roadmap](plans/2026-09-29-gpu-particles.md)
- Current phase: P3 implementation completed; [surface weather plan](plans/2026-09-29-p3-surface-weather.md); owner visual acceptance pending
- Open discussions / unresolved code reviews: none; [approved P3 review](reviews/2026-09-29-p3-surface-weather.md)
- ADR: [0102](../../Documentation/SceneGIS/Decisions/ADR-0102-gpu-particle-foundation.md), [0103](../../Documentation/SceneGIS/Decisions/ADR-0103-aerial-weather.md), [0104](../../Documentation/SceneGIS/Decisions/ADR-0104-approximate-surface-weather.md); SGP: SGP-0028
- Source: packages/engine/Source/SceneGIS/Scene/SceneGISGpuParticleSystem.js, SceneGISWeather.js, SceneGISSurfaceWeather.js
- Shaders: packages/engine/Source/Shaders/SceneGIS/Particles/, Weather/
- Specs: packages/engine/Specs/SceneGIS/Scene/SceneGISGpuParticleSystemSpec.js, SceneGISWeatherSpec.js, SceneGISSurfaceWeatherSpec.js
- Examples: Test/Rendering/GPU粒子.html, Test/Rendering/鸟瞰天气.html, Test/Rendering/地表雨雪.html; no new Sandcastle
- Branch: codex/gpu-particles; P1 checkpoint: 1a2de73dc3

## Handoff

P1 checkpoint is complete. P2 implements aerial rain/snow using the generic foundation, preserving shader-owned physics and adding reusable initial fill and render-only styling. Automated and browser validation and architecture self-review are complete; P2 is included in its own local checkpoint after P1. Roof shelter and surface state were outside P2. See the P2 plan, review and resolved scope discussion; P3 separately adds the authorized approximate surface state.

Post-checkpoint owner feedback removes cloud composition from the weather example. Rain/snow, atmosphere and height fog remain; the standalone environment subsystem is unaffected. See the P2 plan follow-up.

The owner superseded the local snapshot with native Cesium ion OSM Buildings, World Terrain and default world imagery streaming. Globe uses existing SDK authorization and the Nanjing camera; Planar retains its schematic district. The local city fixture and converter are removed. Example validation is Specs/e2e/scenegis-weather.spec.js with Test/Rendering/playwright.weather.config.mjs; Globe requires network/ion access. Checkpoint: 781e2a9d90.

P3 implements approximate wetness/thin snow from existing data, without authored GIS material attributes. ADR-0104/SGP-0028 define a separate SceneGISSurfaceWeather setting and material-local evaluation, independent of particle simulation. Development/release GPU Specs, five example E2E cases, full release/types and patch audit pass. Self-review approves the P3 checkpoint; owner should inspect the local material fixture and aerial example. The latter requires ion/network access; world imagery failed during the final desktop check although online E2E passed. No subsequent phase is active.

Post-P3 local authorization uses the current tab's optional sessionStorage entry sceneGIS.ionAccessToken; credentials never enter repository files. The targeted authorization E2E passes. Imagery had an intermittent desktop network failure; the latest SSR-toggle inspection loads imagery successfully. The aerial example now exposes an initially disabled model SSR switch using the existing Scene-owned effect. Terrain remains excluded, as explicitly requested by the owner. Planar toggle/ready/destruction E2E and live Globe readiness checks pass. See the P3 follow-up plan/review.

Clear-weather follow-up corrects the example's dark base lighting and residual fog: use fixed surfaceRadianceScale 3 independently of presets, and remove/disable weather fog at zero intensity. Switching clear preserves independent wetness/snow and SSR. Focused E2E verifies the separation; same-view Globe inspection qualifies brightness. Online ion access remains intermittent. No engine or upstream changes.

Horizon-view feedback additionally removes the example's dark background override: sky brightness now inherits Globe 4 / Planar 10. Reloaded Globe horizon inspection and the existing focused E2E pass.

The latest owner direction supersedes independent surface visibility in the aerial example: precipitation presets enable coverage (initially wet), while clear disables it. Wetness/snow values are preserved, and manual surface overrides remain available. Core APIs remain independent. The focused E2E passes for custom-value retention, clear/off, manual override, precipitation/on and disposal. The Globe page is left clear with coverage off, retained wetness 0.65 and the owner's camera restored. No engine/upstream/SGP changes.

Rain-readability follow-up tightens the near particle volume to a 60-meter cap and gives stronger rain wider/longer streaks. Intensity already controlled the visible random subset; buildings and thin sprites made its differences hard to see. Same-view light/medium/heavy comparisons without fog now separate clearly. Ten weather Specs pass in development/release, buildRelease passes, and fixed medium memory/submissions are retained. See the [P2 follow-up plan](plans/2026-09-29-p2-aerial-weather.md) and [review](reviews/2026-09-29-p2-aerial-weather.md). No API/upstream/SGP change or later phase; owner visual acceptance remains pending.
