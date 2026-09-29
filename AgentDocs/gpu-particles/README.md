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
