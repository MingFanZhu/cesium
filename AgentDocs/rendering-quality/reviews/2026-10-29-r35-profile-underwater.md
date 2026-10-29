# R35 implementation and technical review

- Type: review; 2026-10-29.
- Status: technical gate approved; owner visual gate pending.
- Owner / reviewer: current architecture and implementation task, source-based self-review.
- Target: [R35](../plans/2026-10-29-r35-profile-underwater.md), ADR-0200,
  WaterDomain, Underwater, profile/polynomial/volume shaders, RiverSurface and examples.
- Upstream-owned files: none; SGP-0017 unchanged. SDK untouched.

## Findings and disposition

| Finding                                                                                    | Severity | Owner        | Disposition / evidence                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constant sphere cannot represent source height changes or river corridor/mask intersection | P1       | execution    | Fixed with original prepared triangles and bounded BVH; independent planar and curved intersection references pass, including holes and LOD-independent queries.    |
| Global quartic epsilon can falsely select the ray origin for shallow paths                 | P2       | execution    | Fixed before delivery with Horner roundoff bounds; tangent, near-zero and degree-reduced GPU roots pass.                                                            |
| Example bed supplies both native height and perPositionHeight                              | P2       | execution    | Fixed after reproduced startup error by omitting height for authored vertex levels. Both curved-river browser cases then pass.                                      |
| Optical transport remains a local sphere approximation; finite static budgets              | P2       | architecture | Accepted/documented. No moving boundaries, overlapping media or exact global ellipsoid transport. R36 handles explicit regional bathymetry and caustics separately. |

No unresolved blocking findings. Surface owns the immutable source domain and
destroys it after its borrowers; borrowed wind survives. Domain/shore textures are
lazy. Pick/secondary frusta cannot advance or repeat the medium resolve. Fixed
clock pictures remain stable, runtime disabling and replacement release resources.

## Verification

- Six new GPU cases and 65 related development GPU cases pass with WebGL validation.
- Six new release GPU cases, build, buildRelease, buildTs and tsc pass.
- Six browser cases pass: curved lake/channel underwater and retained channel LOD;
  Globe/Planar directed-river underwater and existing current/LOD/lifecycle cases.
  The existing lake LOD case also passed during the initial run. No browser errors
  remain. Near/down and underside views inspected; visual owner gate remains open.
- Scoped JS lint, Prettier and diff checks pass. Full AgentDocs markdownlint passes;
  full Prettier retains the previously recorded unrelated formatting debt.

## Bounded cost

Chrome / RTX 3060 Ti, 1185 × 800, frozen clock. Curved channel 371 selected tiles:
six isolated medium draws take 0.657–0.663 ms, exactly one per frame, versus R34
constant lake about 0.242 ms. These are resolve GPU timings, not full-frame or
device guarantees. Original channel domain/edge tables: 832 bytes; directed river
122 source triangles: 16224 bytes in either World. No new full-screen target.
Build-local logs/screenshots remain untracked. R33/R34 owner findings stay open.
