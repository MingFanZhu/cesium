# A3 Default Height-fog Washout

## Metadata

- Type: `discussion`
- Status: `resolved`
- Owner roles: Architecture Agent, Execution Agent
- Created: `2026-08-15`
- Related phase:
  [A3 Exponential height fog](../plans/2026-08-15-phase-a3-exponential-height-fog.md)
- Governing decision:
  [ADR-0045](../../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md)
- Branch: `feature/atmosphere-clouds-effects`
- Exact base/HEAD: `7f041ccb041261f6eb4fc34211c7999dee89d8e6`

## Blocking observation

Execution implemented the frozen A3 public defaults and composition without an
extra calibration factor. Focused real-Context Specs compile and execute the
shared shader, but the first local Chromium ground/day diagnostic triggers the
ADR-0045 default-washout stop condition:

| World  | Fog-only L1 | Max | Changed pixels | Full-frame mean | Ground ROI mean |
| ------ | ----------: | --: | -------------: | --------------: | --------------: |
| Globe  |  33,609,099 | 260 |        649,073 |           51.78 |           31.22 |
| Planar |  54,907,985 | 364 |        699,213 |           78.53 |           45.93 |

Both required means must satisfy `0 < mean <= 24`. The fog-only screenshot also
shows both surfaces shifted toward a nearly uniform blue-grey; the Planar yellow
comparison box loses its accepted A2 color separation. Combined output retains
the atmosphere background but does not recover the original surface albedo.

The smoke used the product defaults exactly: density `0.00004`, falloff
`0.0002`, start distance `250`, maximum opacity `0.85`, ambient scale `0.35`,
directional scale `0.15`, and exponent `8`. Both controllers were ready, page
errors were zero, and public network attempts were zero. Chromium emitted only
the expected `readPixels` performance warnings from the diagnostic itself.

Untracked local review artifacts:

- `a3-ground-day-fog-only.png`
- `a3-ground-day-combined.png`

## Implemented facts before the stop

- A3 remains inside the existing one-background/two-aerial program set and lazy
  aerial FBO; no resource family, pass, asset, network path, upstream hunk, or
  generated tracked file was added.
- The shared shader uses an exact planar exponential integral and a fixed
  16-sample Globe Gauss-Legendre integral. CPU reference fixtures satisfy the
  frozen error gates for the representative non-saturated cases.
- Fog source uses world-specific Sun transmittance/ground occlusion and the
  shared scattering coefficients. It does not read either A2 radiance scale.
- Focused controller/renderer Specs pass `31/31`, including public ranges and
  defaults, warm setters, native `scene.fog` conflict, raw-half calibration
  isolation, high outside-layer rays, both projections, and integrated
  perspective log depth.
- The initial official `npm run build` passes. Exact `Scene.js` and upstream
  manifest diffs are empty; the official audit reports current-delivery
  upstream-owned `0` and generated `0`. Broader build/types/package regression
  was intentionally not run after the stop condition.
- Codebase-memory did not yet index the checkpointed A2 environment files;
  discovery therefore used exact file/string fallback for those paths. This is
  a tooling index gap, not a product dependency.

## Source-level interpretation

The accepted formula makes fog amount approach the frozen `0.85` maximum over
long ground rays. The ambient source is the luminance-normalized chromaticity of
Sun-transmitted Rayleigh/Mie coefficients multiplied by the frozen `0.35`
ambient scale. Because blue scattering is several times the normalized
luminance, this can produce a scene-linear blue component near or above one
before tone mapping while replacing up to 85% of the surface signal. The result
is consistent across both geometry adapters, so it is not evidence of a
Globe/planar clipping mismatch.

## Architecture decision required

Execution cannot choose among the following without changing ADR-0045's frozen
calibration contract:

1. revise one or more public defaults (`heightFogDensity`,
   `heightFogMaximumOpacity`, or the two inscattering scales);
2. revise the precise normalization/energy definition of the atmosphere-aware
   fog source while keeping the public defaults;
3. approve another source-backed calibration rule that remains shared across
   both worlds and introduces no hidden multiplier.

No Test-only multiplier, silent clamp, default change, or A4 work has been
applied. Implementation, broader validation, review creation, owner gate, and
checkpoint remain paused pending an Architecture correction.

## Architecture resolution — 2026-08-15

Architecture confirmed that the stop was a calibration-contract defect rather
than a Globe/Planar clipping defect. ADR-0045 now changes the exact defaults to
`heightFogDensity=0.000008` and `heightFogMaximumOpacity=0.70`, while retaining
all public ranges and the two inscattering scales. It also replaces per-pixel
luminance normalization with fixed top-of-atmosphere reference denominators.
This preserves world-specific Sun-transmittance magnitude and spectral shift
without adding a hidden multiplier or clamp. Execution resumed A3 only under
that bounded amendment; the corrected exact-default visual stopping gate must
pass before broader qualification.

## Corrected stopping-gate replay — 2026-08-15

Execution applied only the Architecture-approved `0.000008/0.70` defaults and
fixed top-of-atmosphere source normalization. Focused real-Context Specs pass
`40/40` (`33` controller plus `7` A1 pipeline), including deterministic source
bound/transmittance-magnitude and default near/far/cap fixtures. `npm run build`
also passes.

The exact-default local Chromium ground/day fog-only replay produced:

| World  | Full-frame mean | Ground ROI mean | Near mean | Far mean |
| ------ | --------------: | --------------: | --------: | -------: |
| Globe  |          5.1345 |          2.0054 |    2.6754 |   2.6738 |
| Planar |         15.3742 |          4.3729 |    5.4012 |  99.5919 |

Both worlds satisfy the required `(0, 24]` full-frame and ground ROI bounds.
The Planar near/far ordering passes, and the saved fog-only screenshot visibly
retains the yellow comparison box and its A2 color separation. Page errors and
external requests are both zero. Globe does not satisfy the strict `near < far`
condition: its current target projections are outside the rendered window, so
the diagnostic uses the documented fallback screen regions and reports a small
reverse ordering (`2.6754 > 2.6738`).

Per the amendment's stopping rule, Execution stopped before broader
qualification and did not tune product defaults/source, request an owner gate,
or enter A4. Corrected artifacts are:

- `a3-ground-day-fog-only-after.png`
- `a3-ground-day-combined-after.png`

Architecture direction is required on whether the Globe direct-page target
layout/measurement must be corrected within A3 or whether another contract
change is intended. No further calibration change is proposed.

## Final diagnostic resolution — 2026-08-15

Architecture authorized a Test-only Globe diagnostic correction and accepted
the corrected product calibration for continuation. The Globe ground preset now
frames two same-material opaque targets at explicit world positions. Before any
target pixels are compared, the page proves finite world-to-window projections,
full ROI containment, non-overlap, and ordered camera distances. There is no
generic screen-region fallback; an invalid proof reports diagnostic unavailable.

The final exact-default replay passes:

- Globe target distances: `11.50 < 39.40 km`;
- Globe fog-only ROI means: `12.17 < 49.51`, numerical margin `37.34`, both
  nonidentity;
- Globe fog-only full-frame/ground ROI means: `7.07/3.69`;
- Planar fog-only full-frame/ground ROI means: `15.37/4.37`;
- Planar accepted near/far evidence: `5.40 < 99.59`, margin `94.19`;
- Globe/Planar aerial surface-preservation means remain within their accepted
  `32` limits;
- the Planar yellow comparison box remains visibly distinct;
- page errors and external requests are both `0`.

The corrected screenshot is `a3-ground-day-fog-only-diagnostic-final.png`.
This resolves the stop without another calibration change, hidden multiplier,
or product/render-resource modification.
