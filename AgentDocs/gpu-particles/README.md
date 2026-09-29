# GPU Particles

- Updated: 2026-09-29; status: implemented, owner visual acceptance pending; planning model: extension
- Architecture/execution/reviewer: current task, self-review
- Active extension: [roadmap](plans/2026-09-29-gpu-particles.md)
- Current phase: P2 completed; [plan](plans/2026-09-29-p2-aerial-weather.md); no active implementation phase
- Open discussions / unresolved reviews: none; [approved P2 review](reviews/2026-09-29-p2-aerial-weather.md)
- ADR: [0102](../../Documentation/SceneGIS/Decisions/ADR-0102-gpu-particle-foundation.md), [0103](../../Documentation/SceneGIS/Decisions/ADR-0103-aerial-weather.md); SGP: none
- Source: packages/engine/Source/SceneGIS/Scene/SceneGISGpuParticleSystem.js, SceneGISWeather.js
- Shaders: packages/engine/Source/Shaders/SceneGIS/Particles/
- Specs: packages/engine/Specs/SceneGIS/Scene/SceneGISGpuParticleSystemSpec.js, SceneGISWeatherSpec.js
- Examples: Test/Rendering/GPU粒子.html, Test/Rendering/鸟瞰天气.html; no new Sandcastle
- Branch: codex/gpu-particles; P1 checkpoint: 1a2de73dc3

## Handoff

P1 checkpoint is complete. P2 implements aerial rain/snow using the generic foundation, preserving shader-owned physics and adding reusable initial fill and render-only styling. Automated and browser validation and architecture self-review are complete; P2 is included in its own local checkpoint after P1. Owner visual acceptance of the weather example is pending. Roof shelter and surface state remain outside this delivery, with no further phase activated. See the P2 plan, review and resolved scope discussion.
