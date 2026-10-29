# R36: Regional bathymetry and actual-wave caustics

- Type: phase plan; status: completed technical gate; 2026-10-29.
- Owner / architecture reviewer: current task, source-based self-review.
- Parent: [roadmap](2026-09-18-rendering-quality-extension.md).
- Entry checkpoint: R35 `68d879be82`; ADR-0201; no upstream change / SGP-0017 unchanged.

## Source facts and implementation

WaterField owns camera-independent bathymetry, foam and refracted mesh area-ratio
caustics. It assumes a zero-height local plane; the surface rejects regional input
and skips curved caustics. Underwater samples end.xy in camera coordinates. R35
supplies immutable source triangles/profiles. RiverFlow exposes actual current waves.

Extend Bathymetry with a copied rigid upright modelMatrix for regional water.
XY is a finite metric patch; depths are offsets down its Z from the actual mean
surface. Restrict coordinates to +/-4096 meters and align Z with geodetic up
(Globe) or World Z (Planar). Existing local descriptors remain unchanged. No
inferred bed or arbitrary scene scan; outside the patch no field effect applies.

Project the grid onto the immutable source profile once. Keep chart coordinates,
mean height, geodetic up, shore fade and river flow in copied maps. Reuse source
FFT displacement/current transport and fixed metric filtering. Refract displaced
positions and finite-difference normals onto the explicit bed; compare areas with
the calm mean surface. Both above/underwater consumers transform opaque receivers
into that same field frame. Preserve camera-independent updates, pause, filtering,
captures and ownership.

## Validation / exit

- Frame/grid copies, original profile interpolation, holes/masks and flow/phase.
- Calm sloped/curved reference, actual FFT evolution, pause/camera invariance,
  sun changes, finite-patch gating and full resource release.
- New GPU Specs and related local/profile/river regressions, full build/types,
  both-world example views, bounded field GPU time/memory, review and checkpoint.
- Prior owner visual gates remain independently open.

## Limits

Finite static tangent patches and field sampling are local approximations.
Caustics modulate captured opaque receivers; no off-screen shadow transport or
multilayer medium. Coarse large patches cannot resolve small ripples; use a small
clear-water patch for close verification.

## Completion

Implemented the planned field frame and original-profile maps, using the shared
actual FFT waves and receiver transform. Four new dev cases / 69 related release
cases, 11 browser cases, build/release/types and scoped checks pass. The 48 m
example is refined to 257 samples to resolve small caustics; six isolated draws
cost about 0.35 ms lake / 0.50 ms river on the recorded GPU. See the
[review](../reviews/2026-10-29-r36-regional-caustics.md) for ownership, memory and
limits. Owner visual acceptance remains pending; no next phase is active.
