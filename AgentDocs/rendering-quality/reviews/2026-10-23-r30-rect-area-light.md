# R30 review: Rectangular area lights

## Metadata and scope

- Type: review; status: completed; date: 2026-10-23.
- Architecture / execution / reviewer: current task, source-based self-review.
- Parent: [R30](../plans/2026-10-23-r30-rect-area-light.md); baseline `71b47223a4`.
- Decision: ADR-0186; changed upstream-owned files: **none**; SGP: **none**.

`SceneGISRectAreaLight` adds a cloned, mutable CPU descriptor with center,
direction/up, width/height, emitted radiance, color, finite center range, show
and two-sided emission. The existing collection borrows it with point/spot lights
under the same 256-entry capacity. A double-precision orthogonal basis is packed
in eye space. No visible geometry or local-shadow API is implied.

Diffuse uses horizon-clipped polygon integration. Specular/clearcoat use the
published isotropic GGX LTC fit, pinned to the source and license in ADR-0186.
Phong shininess maps to GGX roughness. Native unlit, emission, directional shadows,
pick and light lifetime stay on existing integration paths. Forward/deferred,
lit terrain, OIT and SSR/SSIL share the light table; no upstream seam is added.

## Findings and disposition

| Finding                                                              | Severity / owner  | Disposition and evidence                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal-incidence LTC tangent is undefined                            | P1 / execution    | Fixed with an explicitly orthogonal azimuth at that singularity; normal-incidence GPU quadrature/specular comparison passes.                                                                                                                                                                                                |
| Point-only tile headers can overwrite cached LUT rows                | P1 / execution    | Fixed by invalidating the upload identity on that layout transition. The 1024-square GPU case places headers in LUT rows, reactivates a rectangle and checks restored diffuse/specular against the original.                                                                                                                |
| Rectangle integration must retain finite extent and horizon clipping | P1 / execution    | Fixed by integrating the actual four corners and clipped polygon, rather than center light sampling. Diffuse matches independent 100x100 area quadrature within 0.00002, including the receiver horizon; the GGX specular reference agrees within 6%.                                                                       |
| Existing bloom LDR datatype expectation fails                        | P2 / architecture | Pre-existing: temporarily restoring all modified existing lighting runtime/shaders and the original collection Spec from `71b47223a4` reproduces `Expected 36193 to be 5121`. Current and baseline both retain HALF_FLOAT rather than the stale UNSIGNED_BYTE expectation. No bloom runtime or expectation is changed here. |
| Phong / anisotropic area-light BRDF is approximate                   | P2 / architecture | Accepted explicit scope: Phong converts exponent to isotropic GGX roughness; anisotropic materials use the isotropic LTC fit. Documented in public JSDoc, guide and ADR.                                                                                                                                                    |
| Local occlusion and textured emitters                                | P2 / architecture | Accepted existing local-light boundary: no local shadows, participating media or textured source. No speculative fallback or light dropping.                                                                                                                                                                                |

## Verification

- Development and release: rectangle API/math/storage **4/4**, tiled equivalence
  **5/5**, collection/receiver **22/23**. The only failed assertion is the same
  independently reproduced baseline bloom expectation above. Added receiver cases
  cover both Worlds, opaque deferred and transparent forward PBR/clearcoat, native
  Phong/OIT, lit terrain, unlit exclusion, pick/shadow separation and SSR/SSIL.
- The dedicated SSR/SSIL case also passes after enabling the indirect source
  branch. Mutation, finite range, both faces, normal incidence, roughness/size,
  mixed ordered tile candidates, LUT upload reuse, resize/layout transitions and
  collection/Scene destruction are covered by real WebGL validation.
- Browser: **4/4**, both Worlds in dev/release. The independent Chinese-control
  example uses only local Box models. Width, back-face/double-sided/off restoration,
  pixel output, stable MRT/table/program identities and release/recreate/destroy
  pass without page/render errors. Representative wide/small pictures were inspected;
  owner visual acceptance remains pending.
- Complete development/release builds, type generation and TypeScript checks pass.
  Generated types expose the new class and all fields, and collection signatures
  include it. Private fit data stays private. The copied license is present in the
  release Assets tree. Generated indices, shaders and Build outputs stay untracked.
- Scoped ESLint/Prettier, full AgentDocs Markdown lint, diff check and upstream
  patch audit pass (zero changed upstream-owned entries; generated status zero).
  Full AgentDocs Prettier still reports 563 existing out-of-scope issues; no bulk
  formatting cleanup is included.

The baseline experiment restores working source bytes in a finally block. Its
rapid edits overlapped the existing development server's index generator, causing
one malformed generated barrel. A normal complete build regenerated it; the
subsequent dev/release checks above pass. No generated source was hand-edited.

## Bounded cost and resources

RTX 3060 Ti, ANGLE D3D11, Chrome Headless 155, 1280x800, one rectangular light,
four visible material draws, three metallic roughness plates and diffuse floor.
FXAA and HDR enabled; atmosphere, IBL, SSR/SSIL and marker disabled for timing.
Warm both light variants, then collect eight alternating on/off pairs; query
whole-frame GPU intervals. No concurrent builds/tests/audits run during measurement.
Existing user processes remain open; these are desktop-session observations,
not a pure shader benchmark or a general frame-rate guarantee.

| Product / World  | CPU off/on median (ms) | GPU off/on median (ms) | GPU increment (ms) |
| ---------------- | ---------------------: | ---------------------: | -----------------: |
| Dev / Planar     |            0.50 / 0.65 |          1.780 / 2.360 |              0.580 |
| Dev / Globe      |            0.90 / 1.05 |          2.375 / 5.208 |              2.833 |
| Release / Planar |            0.50 / 0.60 |          1.448 / 2.824 |              1.376 |
| Release / Globe  |            0.50 / 0.60 |          1.399 / 2.508 |              1.109 |

The single table is 176128 bytes (172 KiB) in this fixture. Rectangle axes add
8 KiB and published fit data 128 KiB over the same point-only layout. Its existing
tile header/index padding remains; no additional sampler, render target or pass.
The CPU fit buffer is created lazily and owned by the table. Ordinary property
edits upload parameters and indices, with no repeated LUT upload, GPU allocation
or shader compilation. Inactive collections release the table; regrowth restores it.
Many overlapping rectangles remain more expensive than point lights; candidate
lists preserve all sources rather than silently reducing quality.

Artifacts remain ignored under `Build/Specs/e2e/rect-area-light/` (four product/World
folders with PNGs and timing JSON). Focused command output and baseline evidence are
under `Build/Specs/rect-light-research/`; no logs or generated binaries are committed.

## Gate

Technical architecture/code review is complete with no unresolved blocking finding.
Create the independent local R30 checkpoint on `feature/rect-area-light`. Owner
visual acceptance and any merge remain pending; older rendering visual gates and
the independent WebGPU branch remain unchanged. No next phase is activated.
