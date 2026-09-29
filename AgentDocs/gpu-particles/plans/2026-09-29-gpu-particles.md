# Extension: GPU particles

- Type: extension; status: active; created/updated: 2026-09-29
- Owner/reviewer: current architecture/execution task; architecture review confirmed
- ADR-0102; SGP none; discussions none

## Objective and boundaries

Provide a reusable GPU simulation/render primitive on the existing WebGL2 renderer, followed by weather wrappers. Retain native ParticleSystem and both-world placement. Generic user shader functions control particle attributes; no built-in force or weather behavior. No CPU particle arrays/readback, renderer replacement, custom shader interpreter or upstream changes planned.

## Roadmap

| Phase | Scope                                                                    | Entry                                    | Exit                                                                                                          | Status                                                                          |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| P1    | GPU state/lifecycle, custom GLSL, instanced sprites, independent example | Native renderer and build facts verified | Numeric/render/lifecycle tests, both worlds, performance evidence, release/types, review and local checkpoint | completed; [plan](2026-09-29-p1-foundation.md), owner visual acceptance pending |
| P2    | Rain/snow wrappers and weather presentation                              | P1 checkpoint and owner direction        | Separate weather example and quality/performance acceptance                                                   | candidate; no detailed design yet                                               |

## Risks and overall acceptance

GPU simulation does not remove transparent overdraw. User shaders own finite values, motion and conservative bounds; no arbitrary JS updateCallback compatibility. WebGL2 floating MRT and native transparency are required/qualified explicitly. Weather shelter, collisions and surface wetness/snow accumulation are not P1 guarantees. Public API, generated exports, both worlds and deterministic resource destruction must be demonstrated per phase.
