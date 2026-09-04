# Phase Plan: A12-G Globe Cloud Noise Reduction

## Metadata

- Plan type: `phase`
- Status: `active; execution assignment ready`
- Created / updated: `2026-09-04`
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Branch: `feature/atmosphere-clouds-effects`
- Frozen product predecessor: A11-G `53465cf9bc8f3af1e935b3225c81364e380ea528`
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Source discovery:
  [cloud noise analysis](../discussions/2026-09-04-a12g-globe-cloud-noise-source-discovery.md)
- Review: [A12-G review](../reviews/2026-09-04-a12g-globe-cloud-noise-reduction.md)
- Governing decision: [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)
- Upstream / new SGP: `none; SGP-0008/0009 consume only`
- Owner visual gate: `required after Architecture approval`

## Goal

Reduce fine stochastic grain on the owner's accepted Globe cloud shapes while
preserving cloud thickness/lighting, silhouettes, terrain visibility, fixed
world shadows and camera-motion stability. Start with one bounded
reference-derived variance-clipping correction rather than another global
quality or cloud-parameter recalibration.

## Confirmed implementation surface

`executeCloud` runs the current full-resolution Globe cloud MRT, then
`executeCloudResolve` publishes the existing two-target history. Both linear
and log-depth resolve programs assemble
`SceneGISEnvironmentEffectsCloudResolveFS.glsl` through the existing GLSL build
chain. The current resolve already reads a 3x3 raw neighborhood and one color /
distance history sample; it clips history only to the local finite extrema.
Globe stationary/moving history weights are `0.9 / 0.82`. Source facts and the
bounded current-page inspection are recorded in the linked discussion.

## Bounded first implementation

1. In the existing `SCENEGIS_GLOBE` resolve branch, accumulate first and second
   moments from the same finite 3x3 premultiplied radiance/transmittance samples.
   Retain sample count explicitly; do not add texture reads or use non-finite
   neighbors as moment authority.
2. Adapt the pinned reference's mean / standard-deviation AABB history clipping
   with fixed gamma `1.0`. Preserve coherent color clipping rather than
   independent per-channel hue-changing clamps. Keep transmittance in `[0,1]`,
   color finite and RGBA16F-safe, and retain the current-neighborhood range as
   the outer bound. A uniform neighborhood must preserve its exact source.
3. Feed the bounded history into the existing compatibility and blend path.
   Do not change current-frame distance publication, geometry/clear-depth
   rejection, cloud validity, shadow-length decoding/filtering/repacking,
   temporal weights, continuity thresholds or invalid/cut first-frame output.
4. Planar must retain its previous executable formula and behavior. Preserve
   current spatial reconstruction, raymarch/light budgets, reference material
   and all owner parameters. No global/final-scene blur.
5. If this bounded change does not demonstrably reduce the reported grain, or
   it softens silhouettes or causes motion trails, stop and report evidence.
   Do not expand the algorithm, tune coefficients repeatedly or label a merely
   different image as accepted.

## Authorized paths

- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- This plan, A12 discussion/review, extension README/roadmap and ADR-0048
  writeback only.

Renderer/controller, other product GLSL, Test executable/UI, assets/importers,
upstream files, SGP manifests, generated modules, package/build scripts and
Planar product paths are frozen. Any required expansion returns to Architecture.

## Minimum sufficient validation

- Amend the existing actual-GPU history fixture
  `isolates cloud radiance scale transitions from temporal history`. Use one
  controlled nonuniform cloud neighborhood with a known clean color and a
  bounded noisy sample/history outlier. The real product must clip to the
  computed variance bounds and reduce error relative to the exact pre-A12
  extrema-only mutation, not merely produce a different color.
- Within the same fixture, retain all current moved-history, cloud/scene edge,
  packed shadow, current-domain distance, stationary and camera-cut assertions.
  Include a uniform-color identity and a contrasting finite/clear or
  cloud/no-cloud edge so denoising cannot gain its result by crossing a real
  silhouette. Do not add a matrix or standalone replay framework.
- Run that exact GPU filter, then the focused controller include once on final
  source. Run changed-scope ESLint, explicit Prettier and Markdownlint plus
  `git diff --check`. No package, full build, type, upstream or A1 pipeline
  rerun is required because their source/contracts do not change.
- Report unchanged command/program/texture/FBO/attachment/history counts and
  byte budget, unchanged shader lookup count and primary/secondary sample
  budgets. The only intended hot-path delta is fixed moment/AABB arithmetic
  in the existing resolve; do not introduce runtime profiling/readbacks.
- Preserve the owner's current page and camera/parameters before any necessary
  reload. Compare the same fixed view before/after once; include one ordinary
  motion/stop observation. Grain reduction, retained small cloud shapes and no
  new ghost trail are project-owner judgments, not screenshot/hash/FPS gates.

## Resource and semantic boundary

New public API/default/range, GPU resources/bytes, commands/passes/program
categories, persistent state, LUT/noise assets, dependencies and network cost:
all `0`. Request-render behavior is unchanged: first invalid/cut frame remains
complete; no timer, forced frame or settling requirement is added. A11 Sun/Moon
lighting, native geometry shadows and A5/A8 fixed-ECEF Beer projection remain
exactly as accepted in the predecessor checkpoint.

## Exit and handoff

Execution returns `review_ready` with source diff, exact executed test counts,
reference adaptation details, fixed-view observation and unresolved visual
risks. It updates the linked records and stops uncommitted/unpushed. Architecture
reviews before requesting the owner's new noise-quality gate. No subsequent
phase or Planar work is authorized.
