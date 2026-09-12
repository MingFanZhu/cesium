# Review: A16-G Model Environment Lighting

## Metadata

- Type: `review`; status: `approved; owner accepted`
- Author: Architecture Agent; created / updated: `2026-09-11`
- Target: working tree after A15 `4d1d122b1c`
- Phase: [A16 plan](../plans/2026-09-11-phase-a16g-model-environment-lighting.md)
- Parent: [extension plan](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Decision: [ADR-0054](../../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md)
- Upstream seam: active `SGP-0010`; independent local checkpoint, no push

## Findings and disposition

- A16-AR-001 / high / fixed / Execution, confirmed by Architecture: Model PBR
  now consumes physical direct irradiance, default diffuse sky and cloud Beer
  transmittance. The real native Box GPU fixture distinguishes direct source,
  cloud attenuation, diffuse sky and emissive; explicit lightColor/SH overrides
  retain precedence. Shader identity remains warm for uniform changes;
  disable/re-enable restores native lighting. The existing BRDF owns NdotL,
  Fresnel and material response. No final-color relight or duplicate model
  transform is used. The live OSM receiver diagnostic confirms real atlas use.
- A16-AR-002 / high / fixed / Execution, confirmed by Architecture: remove
  showMoonShadows and all automatic shadow enable/guard/capture/restore logic.
  The owner explicitly requires only native Cesium switches, so no showShadows
  or replacement alias exists. The constructor and day/night lifecycle tests
  pass, including caller mutations and release. The real native Moon-shadow
  fixture explicitly enables its own ShadowMap and continues to pass.
- A16-AR-003 / medium / accepted / Architecture with project owner: the owner
  confirms "效果符合预期" on the restored current model view. The measured
  isolated model draw cost increases by 0.281 ms median in this scene. Native
  specular IBL remains a declared fidelity boundary; no new physical reflection
  cube map or full reflection-parity claim belongs to this correction.

Architecture performed the source review in this task; no separate independent
review agent was used. All three acceptance items are closed with the bounded
evidence below. No successor phase is activated.

## Integration review

The SceneGIS-owned helper gates the variant on a ready current-frame Globe
record, SCENE3D and non-classification Model. Native LightingModel.PBR remains
required. Frame-local uniform callbacks borrow the existing atlas/LUTs; the
helper allocates no texture, framebuffer or render pass. Native Model command
reset handles variant transitions before native command construction. Source
hooks preserve ModelFS order, material processing and shadow derivation.

Only these four upstream-owned files change, all with paired SGP-0010 markers
against Cesium 1.144 baseline `6d5d8b1f0725b6f831b336463f4b11c98023427b`:

- `packages/engine/Source/Scene/Model/Model.js`
- `packages/engine/Source/Scene/Model/LightingPipelineStage.js`
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`
- `packages/engine/Source/Shaders/Model/ImageBasedLightingStageFS.glsl`

Existing SGP-0008/0009 are consumed unchanged. ModelFS.glsl and native shadow
implementation are unchanged. Generated shader JS, barrels, Build output and
declaration files are regenerated through normal tools and are not committed.

## Focused validation — 2026-09-11

Chrome 152 on Windows, actual GPU-backed Karma. Each includeName below uses
`npm run test -- --includeName "..." --failTaskOnError`; durations are fixture
durations, not performance measurements.

| includeName                                                                            | Result             | Risk covered                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| SceneGIS/Scene/SceneGISModelEnvironmentLighting                                        | 1/1 pass, 3.348 s  | Real model pixels, direct/cloud/sky/emissive separation, authored light/SH, variant restoration, borrowed resource lifetime |
| validates the frozen constructor contract                                              | 1/1 pass, 0.005 s  | Removed Moon-only API and absence of a new shadow switch                                                                    |
| uses one camera-independent Globe primary light and leaves native shadows caller-owned | 1/1 pass, 0.019 s  | Native off/on through day/night, caller changes and release                                                                 |
| Scene/Model/LightingPipelineStage                                                      | 3/3 pass, 0.002 s  | Unchanged native lighting-stage behavior                                                                                    |
| adds fixed Globe readable-night irradiance only to ambient domains on the actual GPU   | 1/1 pass, 30.829 s | Existing readable-night domains and caller-enabled native Model geometry shadows                                            |
| keeps Globe shadow toggles warm and releases the exact atlas lifecycle                 | 1/1 pass, 27.111 s | Warm controls and exact existing atlas lifecycle after removing the Moon-shadow property                                    |

- `npm run build`: pass, 7.35 s.
- `npm run build-ts`: pass, approximately 29 s; existing JSDoc conversion
  warnings remain in unrelated declarations.
- `npm run tsc`: pass, approximately 22 s.
- Scoped ESLint: all seven changed JavaScript paths pass, including final
  authored-light/SH assertions and sample labels.
- Scoped Prettier formatting: all changed supported paths pass. The repository
  has no GLSL Prettier parser; actual shader compilation covers those sources.
- Required `npx prettier --check --ignore-path .gitignore "AgentDocs/**/*.md"`:
  reports 16 existing unrelated files, none changed by A16. No unrelated format
  cleanup is included. `npx markdownlint "AgentDocs/**/*.md"` passes.
- Final upstream patch audit with active SGP-0010: pass; four current-delivery
  upstream paths, 240 marker tokens and zero generated-file changes.

The first real-model fixture compared against an asynchronously evolving native
environment map and failed native-pixel restoration. Disabling the fixture's
native environment-map generator fixes that reference; product behavior is
unchanged, with no settling-frame or fallback added. The final GPU fixture
passes including explicit authored light/SH coverage. One native-stage test
attempt overlapped full build, both rewriting generated shaders, and failed
module imports; serial rerun passed unchanged source. Build/test generation
must remain serial. The warm atlas lifecycle fixture first timed out at its
existing 5-second resource-readiness wait, before assertions; an isolated
rerun passes unchanged source. Its readiness timing remains a test limitation.
These orchestration failures are not hidden by product
branches or retries.

## Live visual and bounded cost

The current Globe sample uses medium/mixed clouds and 29 native OSM model draw
commands at 1900x1150. Camera, paused Cesium Clock, effects parameters, model
layer and native shadow settings were captured and restored when loading the
fix. Native shadowMap remains disabled, and the model result visibly responds
to SceneGIS daylight and clouds. The owner explicitly accepted that result.
The live page reported zero browser/render errors.

An isolated diagnostic replay draws those same native commands to a temporary
half-float framebuffer. Twelve old/current GPU query pairs alternate ordering,
sharing geometry, uniforms and frame inputs. Native draw median is 0.256512 ms;
current is 0.537600 ms, a 0.281088 ms increase. This measures only the model draw
group on ANGLE D3D11 / NVIDIA RTX 3060 Ti, not whole-page FPS, sustained cost or
an all-view guarantee. No disjoint query or render error occurred.

A separate temporary model receiver shader displays only Beer transmittance:
840,092 visible model pixels, of which 820,441 have byte transmittance below
250; minimum is zero. This establishes actual cloud-atlas influence on model
geometry, not a final-color quality metric. All temporary programs, queries,
framebuffers and listeners are released; no diagnostic enters product source.

## Remaining limits and checkpoint

Native/caller specular IBL is retained, so reflection environment fidelity is
not fully matched to the physical sky. The new light integration applies to
Globe PBR Models/3D Tiles; Planar, classification and unlit paths retain their
existing contracts. Removing showMoonShadows intentionally changes the prior
A11 API: callers now use existing Cesium shadow controls, as required by the
owner. No unrelated materials, cloud sampling or shadow-map implementation is
changed.

The commit containing this review and final checks is the isolated A16 local
checkpoint after A15 `4d1d122b1c`. No push or next-phase activation accompanies
the accepted correction.
