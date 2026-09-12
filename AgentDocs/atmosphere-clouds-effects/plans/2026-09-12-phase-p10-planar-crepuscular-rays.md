# P10 Planar Crepuscular Rays

## Metadata

- Type: `phase`; status: `completed`; created: `2026-09-12`
- Owner: current Architecture / Execution role; design review: `confirmed`
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P9 `efb478b971`; decisions: ADR-0047/0052/0055
- Upstream/SGP delta budget: zero

## Source facts and implementation contract

The owner requests volumetric light and delegates implementation and visual
acceptance. P2 already owns the Planar Beer atlas; P9 shares phased history.
The view-length producer, nonphased length filter, shadow history and atmospheric
consumers still exclude Planar. Activate these through the existing
`showCrepuscularRays` property, independently of the surface-shadow flag.

Intersect the metric view ray with Z = 0 and the low-layer caster top, clipped
to the scene and 200 km. Reuse the 384-interval raw/progressive Beer integration
and origin-relative receiver coordinates. A cloud-body miss must still carry
length. Decode/filter/repack the existing 10-bit distance alpha in all quality
tiers; history qualification remains independent of cloud presence.

Interpret equivalent length as a prefix of that fixed-Z shadow interval.
Subtract its attenuated Planar LUT scattering without changing whole-path
transmittance or ground radiance. Finite geometry and clouds use this correction;
clear depth adds only the correction to the existing background. Existing fog
removes only directional scattering over the overlapping prefix. Clear fog is
already present in Planar Background: apply a delta, including attenuation of
the atmospheric correction, never a second full fog pass.

Port the accepted coverage-coupled cloud haze with exact fixed-Z exponential
integration, physical Planar Sun/diffuse-sky irradiance and shared dual HG.
Clip at the near plane, scene, ground, caster top and opacity-weighted cloud
front. Rays off retains its lit baseline. Keep Globe equations unchanged.
No new API, resource, pass, asset, native shadow control or quality policy.

## Verification and exit

- Actual GPU: fixed-Z interval, origin-relative Beer integration, invalid cloud
  length, packed resolve/history, atmospheric transmittance and fog/haze source
  separation; existing Globe and lifetime regressions where affected.
- Direct off/on visual comparison, above-cloud/night checks and bounded GPU
  timing; preserve and restore owner camera and all public settings.
- Scoped lint, build/types, ownership audit and document checks; self-review
  and independent local commit before a successor phase.

## Completed handoff

Twelve distinct relevant cases, direct off/on and above-cloud/night review,
scoped checks and ownership audit pass. The [review](../reviews/2026-09-12-p10-planar-crepuscular-rays.md)
records unchanged GPU resources and the measured 1.998 ms command-sum increase.
Owner camera/settings are restored. This commit is the independent local
checkpoint. Ground bounce and directional Moon remain separate successors.
