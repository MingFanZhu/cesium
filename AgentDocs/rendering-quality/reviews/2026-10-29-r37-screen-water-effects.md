# R37 implementation and technical review

- Type: review; 2026-10-29.
- Status: technical review approved; owner visual gate pending.
- Owner / reviewer: current architecture and implementation task, source-based self-review.
- Target: [R37](../plans/2026-10-29-r37-screen-water-effects.md), ADR-0202,
  WaterSurface/RiverSurface, shared wave/caustic shaders, original profile and examples.
- Upstream-owned files: none. SGP-0017 unchanged; SDK and distribution copies untouched.

## Findings and disposition

| Finding                                                                                 | Severity | Owner        | Disposition / evidence                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed bathymetry and persistent shore transport conflict with the revised product scope | P1       | execution    | Fixed. Remove both field implementations, their shaders, maps, mesh, uniforms and public descriptors. Contact coverage reads the existing opaque depth; FFT whitecap history remains unchanged.                                                                                         |
| River contact foam was gated by current-wave crests                                     | P1       | execution    | Fixed. River and lake use the same depth-based contact term. Both-world GPU tests create contact foam with current amplitude zero.                                                                                                                                                      |
| Direct screen differentiation of sampled FFT normals exposes source texel cells         | P2       | execution    | Fixed after reproducing the square artifacts in close views. Estimate local refracted footprint areas with metric central differences bounded by pixel and wave texel spacing; screen derivatives supply receiver normal/footprint only. The final above/below captures were inspected. |
| A uniform-only caustic toggle leaves unnecessary work in the underwater program         | P2       | execution    | Fixed. Cache two variants for the current lighting mode; the disabled variant excludes caustic evaluation. Lighting changes and destruction release both programs. Alternating GPU queries measure the selected variant through medium.draw.                                            |
| Two old river tests observed artistic white streaks under black illumination            | P2       | execution    | Fixed test fixture. Use a white directional light and roughness 0.6 to observe the retained wave normals with a broad highlight. Animation, exact pause, periodic wrap, pick and disposal assertions remain; 18 river/profile development cases and all 86 related release cases pass.  |
| Removed options had unnecessary migration exceptions                                    | P2       | execution    | Removed following owner clarification. Old options/types are simply absent; no compatibility or migration validation remains. Three directly affected configuration tests pass after this final edit.                                                                                   |
| Visible receiver and local focusing limits                                              | P2       | architecture | Accepted in ADR-0202 and DevelopmentGuide. No hidden/unloaded/transparent receiver reconstruction, off-screen photon transport, persistent shore advection or wave-exact immersion. Owner visual acceptance remains separate.                                                           |

No blocking technical findings remain. Depth is consumed from the existing opaque
capture; no new framebuffer, draw pass, readback or field history is introduced.
WaterFrame scheduling, reflection inputs and pick behavior are retained. The
finite original polygon/profile, holes and interpolated mean water levels still
determine underwater membership and ray clipping. River flow is interpolated from
the same original triangles in their retained BVH, independently of displayed LOD.
Surface owns this geometry texture; Underwater borrows it. Wind textures remain
caller-owned, and the licensed foam appearance remains Scene-owned.

## Verification

- Twelve screen-effect GPU cases cover normal-only and FFT local water in both
  Worlds, curved constant/sloping levels, directed variable-level rivers above and
  below water, calm unit response, missing receivers, sun/time/camera changes,
  contact foam independent of crests, pause and destruction.
- Twenty-four core development cases and 18 river/profile cases pass with WebGL
  validation. The final related release run passes all 86 cases, including existing
  FFT whitecap age/transport/rewind, shared foam material, optics, reflection,
  membership, pick and lifecycle regressions. After removing migration checks,
  the three affected configuration cases were rebuilt and pass separately.
- Fourteen browser cases pass: four screen-caustic comparisons, two local-water
  cases using the release bundle, four curved-water and four directed-river cases.
  Pause is pixel-stable at fixed view/time; moving views uses current receivers;
  destruction releases the retained domain/medium resources. Build-local captures
  cover Globe/Planar and the variable-level channel and river.
- Build, buildRelease, buildTs and tsc pass; the final constructor cleanup is also
  rebuilt in development and release. Changed JS/HTML/docs formatting, scoped
  ESLint and diff checks pass. Full AgentDocs markdownlint passes. Its full
  Prettier check still reports 611 pre-existing unrelated files; changed records
  pass the explicit scoped check without rewriting historical records.
- The local-water HTML moves its existing CESIUM_BASE_URL bootstrap into a small
  external script, retaining load order. This avoids the existing ESLint HTML /
  seatbelt processor-name failure without modifying shared lint configuration.

## Measured cost and remaining limits

Chrome 156 / RTX 3060 Ti, 1185 x 800, fixed underwater camera and simulation time.
Six alternating queries wrap the complete medium resolve draw, three per variant.
These include medium integration and geometry clipping, but exclude water surface,
FFT, opaque capture, other frame work and first-use shader compilation.

| Example                | Caustics off / on, median GPU ms | Retained medium/profile texture bytes | Primitive construction ms |
| ---------------------- | -------------------------------- | ------------------------------------- | ------------------------- |
| Curved lake            | 0.239 / 0.367                    | 176                                   | 1.4                       |
| Varying-height channel | 0.659 / 0.952                    | 832                                   | 1.3                       |
| Directed river Globe   | 1.459 / 2.494                    | 27888                                 | 3.2                       |
| Directed river Planar  | 1.094 / 2.512                    | 27888                                 | 2.6                       |

The removed R36 257-square example used 7023338 bytes lake / 8080122 bytes river
in field textures plus about 2 MiB of refracted mesh. These allocations are now
zero. River BVH nodes grow from four to seven RGBA32F texels, adding 11664 bytes
in this example. Shared foam appearance, existing FFT and scene captures remain.
Primitive construction no longer prepares the depth/flow grids; the measured
1-3 ms is not viewer startup or shader compilation time. Work shifts to visible
fragments, so these numbers do not establish a universal performance improvement.

Caustics remain soft, bounded local single-branch approximations. Screen visibility,
depth discontinuities, grazing angles and curved tangent projection limit quality;
camera changes can change the available receiver information. Underwater geometry
has the existing source-edge/triangle budgets and mean-surface limitations.
Earlier R33/R34/R35/R36 owner visual findings remain traceable; this scope revision
does not claim to close them. No next implementation phase is active.
