# P8 Planar Cloud Material

## Metadata

- Type: `phase`; status: `completed`; created/updated: `2026-09-12`
- Owner: current Architecture / Execution role; design review: `confirmed`
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P7 `3a93585efd`
- Decision: [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Upstream/SGP delta budget: zero

## Source facts and design

The owner explicitly resumes material migration. P6/P7 corrected integration,
but Planar still loads generated RGBA noise and uses 10–30 km thresholded
morphology with a single 4.5 km cumulus layer. Globe already uses audited R8
shape/detail, channel weather, height-dependent erosion and two low layers.

Reuse the pinned reference assets and one authored density implementation in
the existing cloud material library. Guard Globe-only sphere, haze and raster
helpers; Planar supplies direct metric XY, absolute Z and horizontal wind
advection. No artificial radius, projection inference or base-height subtraction.
Primary and shadow passes share layer descriptors and density; CPU caster
support changes in the same phase. Preserve P6 contiguous integration and P7
local solar/Beer split, and native geometry-shadow ownership.

Unify the experimental cloudDensity contract as a dimensionless multiplier
(default 1, range 0–64) of authored per-metre density coefficients. This replaces
the old Planar per-metre value; migrate sample controls explicitly. Keep Planar
base height 1500 m and coverage 0.45. The initial radiometry deferral is
superseded by the explicit physical-unit amendment below.

Planar uses the same R8 128-cubed shape and 32-cubed detail with full mips,
RGBA8 512-square weather and 128-square turbulence with mips, and reference
STBN. Its explicit metric pixel footprint selects each texture's mip by texel
size; no implicit derivatives inside the march. Globe retains its accepted
base-level volume/raster-footprint policy and equations. Occupancy uses exact
zero support and the matching material coordinates, never the old threshold.

## Verification and exit

- Actual GPU density probes: authored layers/erosion, zero coverage, shadow
  exclusion, fixed Z, metric translation and pixel-footprint filtering.
- Real cloud MRT, P6 integration and P7 solar/Beer regressions adapted only
  where the material contract changes; Globe material regression stays intact.
- Resource formats, mip completeness, failed candidate cleanup and exact
  release; existing package provenance/delivery checks for reused assets.
- Same-view day/low-Sun/above-cloud observations, cloud-shadow consistency and
  bounded GPU timing; restore the owner's camera and compatible parameters.
- Full build/types, scoped lint, documentation and ownership checks. Record
  review and a separate local commit before activating any successor.

### P8 visual correction: physical cloud radiometry

Daylight above-cloud review of the material-only candidate exposes flattened
white tops under the legacy Planar gain 48. Supersede the initial radiometry
deferral: Planar cloud incident Sun and sky now use physical RGB irradiance,
then multiply intrinsic cloud radiance by backgroundRadianceScale and the
independent cloudRadianceScale (default 1 in both worlds), as Globe does.
This is an explicit unit conversion, not a hidden scalar tuned to a fixture.
The sample migrates its old cloudRadianceScale 48 to 1. Night ambient follows
the same physical units. Ground bounce and directional Moon remain successors.

## Completed handoff

Architecture accepts the material and physical-radiometry amendments after
17 relevant cases, delegated visual review, GPU cost measurement, full
build/types and ownership checks. See the [P8 review](../reviews/2026-09-12-p8-planar-cloud-material.md)
for evidence and intermediate fixture corrections. The containing commit is
the separate local checkpoint. Ground bounce, rays and directional Moon remain
successors; finite-resolution grain remains a quality limit. No owner gate.
