# P1: Programmable GPU particle foundation

- Type: phase; status: completed; date: 2026-09-29
- Parent: [extension](2026-09-29-gpu-particles.md)
- Owner/reviewer: current architecture/execution task, self-review; architecture review confirmed
- ADR-0102; no upstream-owned changes or SGP; [approved review](../reviews/2026-09-29-p1-foundation.md)

## Verified source facts

Native ParticleSystem.update loops over Particle.update and updates BillboardCollection on CPU. Renderer supports floating textures, multiple color attachments and instanced DrawCommand. ComputeEngine targets one texture and creates a framebuffer per execute; the new owned MRT simulation therefore uses persistent native Framebuffer/DrawCommand, as WindWaves already does. Normal Primitive.update precedes drawing; pick passes must replay state without advancing simulation. Existing ADR-0030 shader converter and buildEngine generate modules/barrels; no generator changes required.

## Design

- Primitive: SceneGISGpuParticleSystem, added to scene.primitives; Context-local, lazy allocation and collection-owned destruction.
- Required simulationShader defines initializeParticle(inout SceneGISParticle) and updateParticle(inout SceneGISParticle, float deltaTime). Optional uniformMap declares caller callbacks, evaluated per update draw, never per particle. Shader functions own all forces, motion, emitter shape, color, size, rotation and lifetime. Core owns age and deterministic seed.
- Four RGBA32F attachments store position/age, velocity/life, color, size/rotation/seed. Two persistent framebuffer sets, one simulation MRT pass per changed time/reset, one instanced quad command (native OIT may execute its normal derived passes).
- Fixed capacity; CPU schedules only a circular range of births with fractional emission carry. Saturation replaces oldest slots; excess births keep the newest capacity. Birth subframe age is simulated. No GPU-to-CPU synchronization or particle counting readback.
- Local meter state, rigid modelMatrix, caller-provided local boundingSphere including sprite extent. Globe ENU and Planar translation share the same shader contract. Changing modelMatrix moves existing particles with the system.
- show/paused stop simulation while observing current clock; emissionRate=0 drains live particles. reset restarts seed/schedule on next normal update; backward Scene time resets. Large forward steps are passed to caller shader without hidden clamping/substeps. Identical time reuses textures; pick never mutates.
- Soft disc default or caller-supplied decoded image; owned uploaded sprite texture. Straight alpha native translucent path, depth test/no depth writes, system-level picking. No per-particle sorting, collision, lighting, shadow, arbitrary render geometry or weather management.

## Implementation and validation

1. Implement class and common/update/vertex/fragment shaders under owned paths, full JSDoc and example-facing API.
2. GPU state tests against exact custom integration: emission timing, lifetime recycling, uniforms, pause/show/reset/rewind and full-capacity behavior. Verify stable resources and destroy, capability errors and invalid public input.
3. Both-world render/depth occlusion/picking and frozen simulation tests using native Scene; independent programmable examples (fountain/orbit/box with user shader forces), controls and clock pause.
4. Compare native CPU particles and GPU particles at a matched moderate count, measure representative GPU capacities, record CPU/GPU timing and memory without universal FPS claims. Full release/types plus focused tests/lint; code/architecture self-review and one local checkpoint.

## Risks

User shader compile failures must release candidate resources and surface a useful error. OIT provides approximate alpha ordering; without OIT individual instances remain unsorted. One extra simulation pass and 128 bytes per allocated slot; fill rate can dominate. No particle motion vectors for TAA. Caller shaders must keep finite attributes and positions inside supplied bounds.

## Completion and deviations

All four implementation/validation steps are complete; review records exact GPU tests, both-world visuals, release/types and comparative timing. The owner clarified that forces and emitter behavior must remain caller shaders; the implemented contract follows that boundary with no built-in gravity/wind properties. No renderer/upstream changes were needed. GPU timing reports elapsed submitted intervals and does not claim isolated shader cost. P1 is checkpointed independently; no P2 implementation is included. Owner visual acceptance remains pending.
