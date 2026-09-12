# A12-G Globe Cloud Noise Source Discovery

## Status

- State: `resolved; Architecture reviewed; owner visual gate passed`
- Date: `2026-09-04`
- Author role: Architecture Agent
- Frozen predecessor: A11-G `53465cf9bc8f3af1e935b3225c81364e380ea528`
- Phase plan:
  [A12-G cloud noise reduction](../plans/2026-09-04-phase-a12g-globe-cloud-noise-reduction.md)
- Decision: [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)

## Owner scope

The project owner passed A11-G and then reported fine grain on the accepted
cloud shapes. This is a separate image-quality task. Moon/Sun coloring, cloud
morphology and terrain-registered cloud shadows are not rejected again.

## Current source and direct observation

- The current Globe medium/high path renders at full input-depth resolution
  and permits 500 progressive primary steps, with a 50 m minimum step and
  1.01 growth. It is not the historical half-resolution 64-step path.
- STBN advances through 64 slices by rendered frame number, independently of
  the owner's fixed `cloudTime`. Ray-start, detail selection and secondary
  light sampling consume this dither. Some sampling variance is expected.
- The current page is `high / mixed`, coverage `0.3`, density `1`, cloud time
  `0`, cloud radiance `1`, background radiance `4`, aerial radiance `1`,
  surface radiance `10`, at a `1433 x 1150` drawing buffer. The renderer reports
  `exact-stationary-temporal`, valid history and nominal weight `0.9`.
- One read-only `128 x 128` cloud-body crop at framebuffer `(600, 300)` compared
  the two existing successful history attachments. All 16,384 pixels were
  cloud-valid; only 15 failed either mean/front distance tolerance in that
  transition. Scene-distance rejects were zero. Front-distance delta median /
  p90 were `1.7166 / 4.7684 m`. This does not support broad history rejection as
  the dominant cause in this crop; it does not rule out edge-local rejection.
- A separate same-crop color read shows substantial stochastic raw variation
  and smaller but visible resolved variation. Estimated color/transmittance
  gates rejected no pixels in that sample. These are diagnostic observations,
  not a replacement for a controlled actual-GPU fixture or visual acceptance.
- No camera, time, parameter, render-loop or product change was made during
  inspection. Temporary readback framebuffer wrappers were destroyed.

## Reference comparison

The pinned local `three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`
full-resolution path is the relevant reference, not its separate sparse
16-phase upscaler:

- `packages/clouds/src/shaders/cloudsResolve.frag::temporalAntialiasing`
  reprojects history and calls `varianceClipping`, with current-frame weight
  `0.1` in `CloudsResolveMaterial.ts`.
- `packages/clouds/src/shaders/varianceClipping.glsl` derives first/second
  neighborhood moments, clips history against `mean +/- gamma * sigma`, and
  clips toward a common AABB center rather than independently clamping each
  channel. Its full-resolution default gamma is `1.0`.
- SceneGIS currently retains only neighborhood extrema. One noisy neighbor
  can widen those extrema, so they do not express the local sample variance.
  The existing 3x3 reads already provide the data needed for moments.

This is a confirmed algorithm difference and a bounded optimization candidate,
not proof that variance clipping alone will meet the owner's quality target.
The first implementation must demonstrate improvement without erasing cloud
structure. If it cannot, return the result for Architecture review instead of
claiming parity or escalating unrelated parameters.

## Decision and rejected shortcuts

Adapt reference variance clipping in the existing Globe cloud resolve first.
Retain the same sample budgets, STBN data/phase, spatial kernel, temporal
weights, reprojection, distance/scene rejection and packed shadow semantics.
Do not loosen the 16 m distance floor based on the disproven crop hypothesis.
Do not increase global raymarch work, freeze noise, lower density/detail, alter
cloud altitude, blur the final scene, or add sparse reconstruction/settling
renders. Any later sampling/filter/resource expansion requires new evidence
and an explicit amendment.

## Execution adaptation — 2026-09-04

The pinned varianceClipping source and its package MIT license were checked.
The GLSL retains the Shota Matsuda 2024 notice and exact commit/source path.
SceneGIS reuses its already fetched nine finite samples, intersects the
reference gamma-1 bounds with existing extrema, and extends the common AABB
fraction to transmittance as well as RGB. This prevents independent channel
clamps and preserves zero-width/uniform bounds without a variance floor.

For eight identical clean values C and one outlier N, the fixture's independent
upper ray endpoint is C + (N-C)*(1+sqrt(8))/9. It tests actual compiled clipping
and integration, not a CPU-only replacement. The exact old clamp is the
comparison authority; existing temporal rejection is not weakened.

After the owner made the original tab accessible, one saved-state reload and
same-view inspection retained cloud bodies/cavities but did not establish a
clear visible grain reduction. One ordinary drag/stop showed no obvious large
trail. The restored fixed state is high/mixed, coverage 0.3, density 1,
cloudTime 0, cloud/background/aerial/surface scales 1/4/1/10, Sun 67.484 degrees;
ready/HDR and zero errors. The first restore briefly interpreted the saved TAI
as UTC; it was corrected by exact JulianDate cloning before the comparison.
No time/camera/parameter search or additional product tuning was performed.

## Architecture review clarification — 2026-09-04

The pinned `clipAABB` derives its limiting fraction from RGB only. Extending
that fraction to transmittance was not an equivalent adaptation: a constant
current transmittance and a one-binary16-ULP history discrepancy force the
candidate's fraction to zero, even while every RGB history component remains
inside its variance bounds. This analytic counterexample is recorded as
A12-AR-001; it does not prove the dominant cause of all visible grain.

The bounded correction will retain coherent RGB clipping and independently
bound transmittance, with a same-fixture actual-GPU check. Visible benefit and
regression qualification remain unresolved (A12-AR-002/003). No extra samples,
threshold changes, wider filter or alternative denoiser is authorized.

## A12 correction execution — 2026-09-04

A12-AR-001 now uses RGB alone for the coherent clipping fraction and clamps
transmittance independently. The existing actual-GPU history fixture retains
the outlier/uniform/edge/motion checks and proves the recorded alpha-only ULP
case returns RGB `0.3125` and alpha `0.75`, not RGB `0.25`.

A12-AR-002 setup/oracle corrections stay in the existing Spec. The Beer
fixture now passes the same fixed time to controller update and Scene render.
The Moon oracle uses rotation-invariant inertial-frame phase instead of
ICRF-readiness-dependent epoch goldens, retaining the mixed-frame mutation
and existing tolerances. The readable-night probe now distinguishes local
`+Z` from its virtual Globe point's `+X` zenith; its controlled surface atlas
uses density `0.0001` so the 6 km zenith path has OD about `0.6`, rather than
OD `60` erasing both direction witnesses in half-float output. Product
lighting/shadow code is unchanged.

All four corrected isolated fixtures passed sequentially on Chrome 152.
A12-AR-003 remains unproven: this correction turn's browser discovery returns
no accessible tab. No replacement page was opened and no refresh, camera,
parameter or live-state mutation was performed. The earlier grain observation
is not superseded by a new visual claim. Resource, lookup, API, upstream,
generated and SGP deltas remain zero; the candidate stays uncommitted/unpushed.

Final controller qualification is `78 SUCCESS, 1 FAILED` (79 executed), not a
pass despite shell exit 0. The remaining unchanged
`loads exact Globe assets and publishes the height/time/projection render matrix`
fixture supplies its selected times only to Scene rendering, not to its
directly connected controller inside the loop; its Sun-direction-change
assertion fails. It is outside the three-fixture repair scope and is left
untouched for Architecture. No rerun or scope expansion. A12-AR-002/003 remain
open; exact commands and failure are appended to the A12 review.

## A12-AR-002 final Spec follow-up execution — 2026-09-04

Added only the two authorized `effects.update` calls before the existing
selected-time and final Orthographic renders. No assertion, parameter or
product change. Exact command
`npm run test -- --includeName "loads exact Globe assets and publishes the height/time/projection render matrix"`
passed `1/1 SUCCESS` on Chrome 152 (36.942 s Spec). The previous aggregate
remains `78 SUCCESS / 1 FAILED`; no new aggregate or other fixture was run.

A12-AR-003 remains open: original-tab discovery still returns zero accessible
tabs. No replacement page, reload or live-state mutation; no visual benefit
is claimed. New executable delta is only these two Spec lines.
Upstream/generated/new SGP/API/resource/Planar deltas are zero. Shared
candidate remains uncommitted/unpushed and returns for Architecture review.

## A12-AR-003 execution access limitation — 2026-09-04

After Architecture reported successful access to the original tab, Execution
performed the required single read-only inventory. Its own browser surface
still returned `tabs=[]`. Thus Architecture's successful access does not
currently extend to this execution context. No tab was selected, opened,
refreshed or polled again; no camera, time, parameter, loop or shader changed.
Current-state capture, loaded-shader verification and a valid same-state
comparison/drag observation could not be performed. A12-AR-003 remains open,
with no visual benefit or acceptance claimed. A12-AR-001/002 stay frozen.
This update changes records only; no tests, product edits, commit or push.

## Owner quality clarification — 2026-09-04

Matched viewpoints are no longer a mandatory visual gate, and close-range
fine grain is not itself a defect. World-space cloud-shape noise and frame
sampling dither remain distinct; no pixel-identical noise-phase replay is
required. The final bounded candidate was observed directly by Architecture
after confirming/reloading its actual shader version, with current parameters
and raw time preserved. Forms and internal shading remain readable, and fine
grain remains. No broad trail was apparent in the limited drag/stop captures;
subtle shimmer and subjective grain strength remain owner judgments. There
is no claim of quantified relative improvement or explicit owner acceptance.
