# A12-G Globe Cloud Noise Source Discovery

## Status

- State: `resolved for bounded variance-clipping implementation`
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
