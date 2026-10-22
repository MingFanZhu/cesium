# Review: Globe / Planar material and lighting audit

## Metadata

- Type: technical self-review; status: inspection completed, F1/F2 resolved by follow-up.
- Created/updated: 2026-10-22; author/reviewer: current architecture/execution task.
- Target: `scenegis/develop` at `acd9cddbb0`, with audit-only additions.
- Plan: [bounded audit](../plans/2026-10-22-material-lighting-audit.md).
- Follow-up: [filter-domain discussion](../discussions/2026-10-22-imagery-filter-color-domain.md).
- Related: ADR-0031, ADR-0044, ADR-0054, ADR-0154, ADR-0169.
- Modified upstream-owned files / SGP: none. Engine code and defaults unchanged by the original inspection.

## Follow-up disposition

The owner subsequently selects Globe as the compatibility reference. The
[Planar fix](../../planar-surface-styling/reviews/2026-10-22-globe-filter-compatibility.md)
preserves Globe and aligns Planar, accepting the gamma branch discontinuity.
F1's mismatch and F2's three obsolete assertions are resolved there. The tables
and audit-only validation below retain their original pre-fix observations.

## Reproduction and observations

Use `npx playwright test -c Test/playwright.material-lighting-audit.config.mjs`
against the existing root server. Bistro requires the local assets described in
`Test/Rendering/pbr-data/Bistro.md`. Outputs are ignored under
`Build/Specs/e2e/material-lighting-audit`; the test saves images and measurements.

Both worlds use equivalent local cameras and geometry. The imagery fixture uses
local solid textures, no atmosphere/lighting, LDR output and gamma 2.2. The PBR
fixture uses native Model, identical linear material values and a fixed local
directional light, with environment contribution disabled. Bistro uses Greenwich,
2026-03-20 12:00 UTC, exposure 1, physical radiance scales 1.2/2.5, and identical
IBL weights. Fog, aerial perspective, grading, automatic exposure, AO, SSR, SSIL
and AA are disabled for isolation; geometric shadows remain enabled.

RGB byte measurements, alpha 255 throughout:

| Control                                  | Globe       | Planar      |
| ---------------------------------------- | ----------- | ----------- |
| Original imagery                         | 64,128,192  | 64,128,192  |
| Red under blue, upper alpha 0.5          | 186,0,186   | 186,0,186   |
| Imagery brightness 0.5                   | 47,93,140   | 32,64,96    |
| Imagery contrast 0.5                     | 141,160,189 | 96,128,160  |
| Imagery gamma 2                          | 186,218,239 | 128,181,221 |
| Imagery gamma 1.001                      | 136,186,224 | 64,128,192  |
| Linear gray 0.18, roughness 1, F0 0.04   | 69,69,69    | 69,69,69    |
| Linear white 1, roughness 1, F0 0.04     | 147,147,147 | 147,147,147 |
| Linear gray 0.18, roughness 0.2, F0 0.04 | 77,77,77    | 77,77,77    |
| Zero diffuse, roughness 0.2, F0 0.8      | 162,162,162 | 162,162,162 |
| Bistro facade roughness visualization    | 222,222,222 | 222,222,222 |
| Bistro facade metalness visualization    | 0,0,0       | 0,0,0       |

PBR fixture values measure response to light, not the display encoding of an
unlit gray card. The roughness visualization is gamma-encoded 189/255, not a
roughness value of 222/255. Filter values are diagnostic observations, not
assertions accepting the mismatch as a contract.

Physical/fixed IBL screenshots and material diagnostics were inspected. The two
worlds show closely matching local material appearance; there are small shadow
edge differences. Physical and fixed IBL are different illuminants and must not
be expected to have equal brightness. No exposure matching or color compensation
was applied to hide differences. This is not a horizon/high-altitude atmosphere
qualification or exhaustive coverage of every Fabric/S3M/custom material.

## Findings and disposition

### F1 — P1: Globe imagery gamma changes the decoding domain

- Status: resolved; Globe behavior accepted by owner, Planar mismatch fixed in the linked follow-up.
- Evidence: gamma 1 to 1.001 produces the large discontinuity above. Brightness
  and contrast also differ between worlds with otherwise identical inputs.
- Source: `GlobeFS.glsl` / `sampleAndBlend` uses `czm_gammaCorrect` when
  `APPLY_GAMMA` is absent; when present it substitutes only the artistic power
  curve. Brightness/contrast then operate on the resulting value. The deferred
  Scene keeps linear HDR storage even when display HDR is off, so the missing
  decode is observable in normal LDR use too.
- Planar `_SceneGISPlanarSurfaceShader.createFragmentShader` applies artistic
  filters to display RGB, then decodes every layer before linear blending, as
  documented by ADR-0031 and DevelopmentGuide. Default inputs agree; custom
  filters do not. This is independent of lighting, exposure, fog or white balance.
- Historical proposal, now superseded: the linked discussion recommended a consistent display-RGB filter
  contract followed by exactly one decode. Confirm compatibility boundaries,
  update ADR/SGP, and add a regression that fails on the current Globe branch
  before changing source. No shader fix is included in this inspection.

### F2 — P2: Existing planar imagery tests are not aligned with current output

- Status: fixed in the linked follow-up; all 12 imagery Widget Specs pass.
- Two `SceneGISPlanarImageryCesiumWidgetSpec` cases expect encoded-space mixtures
  such as 128 for half red/blue. Actual output 186 matches independent linear
  composition and both-world browser results. Their color-to-alpha expectations
  need to retain the strict raw comparison while updating the subsequent blend.
- A third case expects `world.tilesLoaded === true` before its first frame,
  whereas current initialization reports false. Source review confirms that adding
  a shown layer invalidates readiness immediately; the follow-up retains the
  assertion with the correct initial false value, then verifies true after loading.
- Follow-up: resolve alongside F1 using the linked discussion's acceptance list.
  The audit leaves the original tests unchanged and reports all three failures.

### F3 — Informational: Asset and illumination limits remain

- Status: accepted as audit boundaries; owner: architecture/product owner.
- Native MaterialStage decodes base/emissive color, reads roughness G and metalness
  B without color conversion, and reconstructs normal data without gamma. The
  shared pipeline and GPU tests show no general duplicate output conversion.
- The existing Bistro calibration records mostly constant roughness near 0.741,
  authored alpha without physical glass transmission and a 1K texture limit.
  Current channel images agree. This limits visual richness even with correct
  lighting; preserve authored values rather than globally increasing contrast.
- Photographic imagery/photogrammetry contains lighting baked into the image.
  Using it as reflectance under a new Sun is an approximation. Fixed solar white
  balance is a global display transform and cannot remove baked shadows.
- Existing strict Planar and Globe atmospheric transport has different geometry;
  this audit does not require their distant skies to be pixel-identical.

## Verification

| Suite                             | Result                                     |
| --------------------------------- | ------------------------------------------ |
| SceneGISModelEnvironmentLighting  | 4 passed                                   |
| SceneGISSkyReflections            | 6 passed                                   |
| SceneGISDeferredLighting          | 21 passed                                  |
| SceneGISColorGrading              | 13 passed                                  |
| SceneGISPlanarImageryCesiumWidget | 9 passed, 3 failed (F2)                    |
| New browser audit                 | 4 passed; both worlds, controls and Bistro |

GPU suites used ChromeHeadless, WebGL validation and failTaskOnError, one suite
at a time. Output conversion, solar white balance, explicit IBL precedence and
resource reuse/lifetime have focused GPU coverage. Browser shaders, supplied IBL
and Viewers are explicitly released. No runtime performance claim is needed:
this audit modifies no rendering hot path and adds no render pass.

Scoped ESLint/Prettier/Markdown lint and `git diff --check` pass. Required full
AgentDocs Markdown lint passes; full Prettier reports 568 other unmodified files.
Unrelated formatting issues are not mass-formatted. No release/type rebuild is
required for audit-only files.

## Review conclusion

The bounded inspection is complete, not a clean bill for every rendering path.
Prioritize F1 and the related test repair before adding another lighting effect.
No new GI, volumetric lighting or default strength change is implied. Screenshot
evidence supports technical review; the owner's visual judgment remains separate.
