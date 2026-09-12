# P10 Planar Crepuscular Rays Review

## Metadata

- Type: `review`; status: `approved`; created: `2026-09-12`
- Reviewer/implementer: current Architecture / Execution role
- Target: [P10 plan](../plans/2026-09-12-phase-p10-planar-crepuscular-rays.md)
- Predecessor: P9 `efb478b971`; upstream-owned files: none; SGP delta: none

## Findings and disposition

- Fixed: Planar view-length production now intersects absolute Z = 0 and the
  low-layer caster top, clips to geometry/200 km, and uses the existing raw
  progressive Beer march. XY uses the CPU-selected relative atlas origin.
  Cloud-body misses retain length independently of cloud validity.
- Fixed: all tiers decode/filter/repack length; its temporal qualification is
  independent of cloud color. Empty low/high producer pixels now also retain
  the finite scene endpoint, so receiver qualification cannot erase their rays.
- Fixed: Planar atmosphere removes the attenuated equivalent prefix while
  retaining total extinction and ground radiance. Fog removes directional
  scattering only over its overlap. Clear-depth composition adds the correction
  through the existing fog instead of applying a second full fog medium.
- Fixed: reference cloud haze uses exact fixed-Z exponential transport,
  existing physical Sun/diffuse sky and dual HG, with near/ground/caster-top,
  scene and cloud-front bounds. Its lit baseline remains with rays disabled.
- The existing renderer imports a dedicated Planar cloud-transport shader after
  its atmosphere/shadow/fog/material libraries. No new pass/program category,
  texture, framebuffer, history target, asset, public API or native shadow switch.
  The Test page exposes the existing `showCrepuscularRays` control.

## Automated evidence

Twelve distinct relevant cases pass across bounded runs:

- P10 actual GPU fixed-Z interval, above-cloud entry, finite clip, out-of-atlas
  origin, rays off and invalid-cloud MRT publication.
- P10 actual GPU analytic atmosphere prefix, unchanged transmittance, fog and
  haze ambient/directional separation, haze opacity and real clear Aerial delta.
- Packed-length round trip and the unchanged Globe raw/progressive producer.
- Globe full clear-depth atmosphere/fog/haze composition.
- P9 Planar phased reconstruction, positive invalid-cloud length, independent
  shadow history, nonphased filtering and foreground/motion qualification.
- Warm-discontinuity history invalidation.
- P2 real surface Beer shadows, large XY and exact atlas lifetime.
- Lazy cloud resources, quality resize, physical day/night and destruction.
- Nonphased off-center raw/log depth in both frusta.
- P4 fixed-Z night and P5 complete far atmosphere/cloud transport.

The first direct cloud-library probe exposed a missing fog dependency; moving
participating-medium consumers into their explicit assembly module resolves
that dependency without adding a fallback. Existing validity-only assertions
now use the packed upper half, and empty-cloud distance assertions preserve the
new receiver endpoint. P5's direct shader fixture includes the new transport
library. No product tolerance or source brightness was weakened for tests.
Build, generated types, type checking, scoped ESLint and ownership audit pass.
Generated files remain uncommitted. Changed-document formatting/lint passes.

## Visual and bounded GPU evidence

Original low-Sun owner camera, medium/cumulus, coverage 0.28, density/radiance 1,
Z about 808 m: direct off/on comparison shows broad directional cloud-shadow
shafts through the medium. Rays off retains evenly lit haze; cloud morphology
and P9 reconstruction remain intact. Page/WebGL errors remain empty.

RTX 3060 Ti / ANGLE D3D11, 862 by 575 cloud target: six alternating blocks,
18 measured frames per state, measure cloud + resolve + Aerial commands.
No concurrent test render loop; timer disjoint is false. Median command sum:

- Rays off: 6.755 ms (cloud 4.509, resolve 1.789, Aerial 0.427 ms medians).
- Rays on: 8.753 ms (cloud 6.373, resolve 1.836, Aerial 0.422 ms medians).
- Increase: 1.998 ms for these commands; this is not a frame-rate claim.

Existing framebuffer identities and dimensions remain unchanged. All timer
queries are deleted and temporary command bindings restored after measurement.

## Remaining limits and handoff

Equivalent length approximates spatially separated shadow intervals as a
prefix; it does not reconstruct every individual lit/shadowed interval. The
200 km march and existing Beer cascade coverage bound the effect. Shaft
visibility depends on cloud coverage, view/Sun alignment and medium density.
Finite cloud grain and first-frame spatial reconstruction retain P9 limits.
Ground bounce and directional Moon remain separate successors.

Above-cloud daytime inspection preserves cloud structure and bounded ground
shadows without a horizon seam. Night inspection shows no directional Sun
residual; the runtime rays uniform is false and readable ambient remains.
Architecture approves the source, GPU, visual and bounded-cost evidence.
Restore all owner settings and camera, remove diagnostics and leave the sample
render loop active. This phase's containing commit is its independent local
checkpoint. No owner approval or unresolved review finding is pending.
