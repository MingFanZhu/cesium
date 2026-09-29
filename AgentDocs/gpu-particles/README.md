# GPU Particles

- Updated: 2026-09-29; status: active; planning model: extension
- Architecture/execution/reviewer: current task, self-review
- Active extension: [roadmap](plans/2026-09-29-gpu-particles.md)
- Current phase: P1 completed; [plan](plans/2026-09-29-p1-foundation.md); P2 remains candidate
- Open discussions / unresolved reviews: none; [approved P1 review](reviews/2026-09-29-p1-foundation.md)
- ADR: [0102](../../Documentation/SceneGIS/Decisions/ADR-0102-gpu-particle-foundation.md); SGP: none
- Source: packages/engine/Source/SceneGIS/Scene/SceneGISGpuParticleSystem.js
- Shaders: packages/engine/Source/Shaders/SceneGIS/Particles/
- Specs: packages/engine/Specs/SceneGIS/Scene/SceneGISGpuParticleSystemSpec.js
- Example: Test/Rendering/GPU粒子.html; no new Sandcastle
- Branch: codex/gpu-particles; preceding checkpoint: 8573092c89

## Handoff

Owner authorizes generic GPU particles first, weather later. Initialization and update are user GLSL functions; forces and emitters belong in supplied shaders, not engine-specific gravity/wind branches. P1 implementation, automated/browser validation and architecture self-review are complete; this phase and its review are included in the same local checkpoint. Owner visual acceptance is pending. P2 remains a candidate and needs a new phase plan based on current source before implementation.
