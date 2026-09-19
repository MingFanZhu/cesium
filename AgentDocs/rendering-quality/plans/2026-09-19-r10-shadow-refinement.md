# Phase Plan: R10 Shadow Refinement

- Type: `phase`; status: `completed`; created: `2026-09-19`
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture review: `confirmed`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: R9 `f6028f6606`, owner accepted
- ADR: `ADR-0088`; SGP: `SGP-0013`
- Open finding: [R9-F4](../reviews/2026-09-19-r9-reference-scene.md)

## Source facts and scope

The owner selected visual-priority item 4 (shadow refinement), not roadmap R4 temporal AA.
Native `ShadowMap` already owns four atlas passes, caster/receiver derivation and resources.
R1 adds light-fixed, texel-snapped cascades and overlap only for Planar; Globe still crops to
changing scene bounds. Native soft PCF averages nine nearest samples, giving quantized edges.
R1's slope-expanded receiver bias can move contacts, while Globe's constant bias leaves bands.

Reuse the existing resources and API: `Viewer.shadows`, `ShadowMode`, `shadowMap.size`,
`maximumDistance`, `softShadows`, `normalOffset` and debug cascade colors. No new public switch,
offscreen terrain loading, PCSS blocker search, temporal history or indirect-light integration.

## Implementation

1. Generalize the owned stable cascade fitter to directional four-cascade Globe and Planar.
   Keep each World's existing light/horizon semantics; calculate camera-relative corners in
   double precision and snap light-space translations. Preserve one-pass/point/spot behavior.
   Globe retains visible-range utilization with power-of-two far bands; fully fixed maximum
   distance regressed native cutout/small-model tests. Band crossings may rescale sampling.
2. Replace nearest 3x3 soft PCF with a continuous separable tent on a 4x4 texel footprint.
   Correct comparison depth for each sample using the geometric receiver plane, retaining
   a small precision bias, native darkness and normal-shading semantics. Clamp samples within
   the chosen atlas tile and preserve overlap blending. Avoid shading-normal slope inflation.
3. Add an independent Chinese shadow-detail example with local deterministic GLBs, thin
   occluders, inclined receivers, near/far views and native controls. Link the real scan.
4. Verify visible improvements on the R9 scan in both Worlds at unchanged map resolution.

## Verification and exit

- Focused GPU Specs: slope acne, contact preservation, continuous soft edges, cascade seam,
  stable Globe/Planar grids, warm resource reuse and destruction; run existing shadow regressions.
- Use reproducible screenshots plus bounded same-device GPU timing, with actual tap/resource cost.
- Validate development/release shader builds, relevant types/build checks, lint and patch audit.
- Update technical review and owner visual gate. Commit this phase separately after acceptance.

## Risks

Receiver-plane derivatives become ill-conditioned for edge-on surfaces and at silhouette quads;
bound their effect to the local footprint without hiding a missing receiver. Photogrammetry still
contains baked shadows. Filtering cannot restore detail below a shadow texel, and the native final
color shadow modulation remains a separately documented lighting limitation.

## Current handoff

Implementation and technical self-review are complete. After the zoom fix, the owner moved
on to direct-only shadow lighting; this progression closes R10 for an isolated checkpoint.
Native shadow 47, Planar GPU 9, new GPU 5 (dev/release) and example E2E 5 pass.
Development/release builds and type checks pass. GPU cost and limits are recorded in the
[review](../reviews/2026-09-19-r10-shadow-refinement.md). No following phase is activated.
The owner-reported example zoom crash is fixed by removing its incompatible 2000 m far-plane
override; both-world wheel E2E verifies movement and uninterrupted rendering.
