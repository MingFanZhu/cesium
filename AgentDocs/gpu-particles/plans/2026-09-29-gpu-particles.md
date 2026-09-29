# Extension: GPU particles

- Type: extension; status: active; created/updated: 2026-09-29
- Owner/reviewer: current architecture/execution task; architecture review confirmed
- ADR-0102/0103/0104; SGP-0028 (P3 only); [resolved weather scope](../discussions/2026-09-29-weather-scope.md)

## Objective and boundaries

Provide a reusable GPU simulation/render primitive on the existing WebGL2 renderer, followed by weather wrappers. Retain native ParticleSystem and both-world placement. Generic user shader functions control particle attributes; no built-in force or weather behavior. No CPU particle arrays/readback, renderer replacement or custom shader interpreter. P1/P2 require no upstream changes. Owner-authorized P3 separately adds narrow forward-material seams for approximate surface weather, without changing the generic particle contract.

## Roadmap

| Phase | Scope                                                                    | Entry                                        | Exit                                                                                                          | Status                                                                                              |
| ----- | ------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| P1    | GPU state/lifecycle, custom GLSL, instanced sprites, independent example | Native renderer and build facts verified     | Numeric/render/lifecycle tests, both worlds, performance evidence, release/types, review and local checkpoint | completed; [plan](2026-09-29-p1-foundation.md), checkpoint 1a2de73dc3                               |
| P2    | Rain/snow wrappers and weather presentation                              | P1 checkpoint and owner direction            | Separate weather example and quality/performance acceptance                                                   | implementation completed; [plan](2026-09-29-p2-aerial-weather.md), owner visual acceptance pending  |
| P3    | Approximate surface wetness/thin snow using existing GIS data            | P2 checkpoint 781e2a9d90 and owner direction | Both-world material/lifecycle tests, examples, bounded timings, release/types, review and local checkpoint    | implementation completed; [plan](2026-09-29-p3-surface-weather.md), owner visual acceptance pending |

## Risks and overall acceptance

P3 is authorized after checkpoint 781e2a9d90: [surface-weather plan](2026-09-29-p3-surface-weather.md), implementation completed. It extends weather composition with independent approximate wetness/thin snow using existing materials, no asset attributes or simulation. Explicit forward integration seams are tracked under ADR-0104/SGP-0028; the generic particle foundation and completed P1/P2 contracts remain unchanged. Material/coordinate/lifecycle GPU tests, visual and bounded performance evidence, release/types and self-review satisfy the implementation gate. Owner visual acceptance is pending; no next phase is activated.

GPU simulation does not remove transparent overdraw. User shaders own finite values, motion and conservative bounds; no arbitrary JS updateCallback compatibility. WebGL2 floating MRT and native transparency are required/qualified explicitly. Weather shelter, collisions and surface wetness/snow accumulation are not P1 guarantees. Public API, generated exports, both worlds and deterministic resource destruction must be demonstrated per phase.
