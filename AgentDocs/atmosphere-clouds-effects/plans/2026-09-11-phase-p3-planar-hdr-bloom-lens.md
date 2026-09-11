# P3: Planar HDR Bloom and Lens Artifacts

## Metadata

- Type: `phase`; status: `completed`; created/updated: `2026-09-11`
- Owner/reviewer: current agent under implementation and visual delegation
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P2 `b09a3d5ce2`
- Decision: [ADR-0049 Planar amendment](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)
- Review: [P3](../reviews/2026-09-11-p3-planar-hdr-bloom-lens.md)
- Upstream: consume-only SGP-0008; zero new hunk

## Current source and implementation

Graph search has no indexed private HDR helpers. Exact renderer source confirms
the existing post-composition HDR hook, threshold/three-octave blur/composite
and lazy resize/release topology are world independent. Only executeHdr's
Globe gate prevents Planar execution. Sun projection already uses explicit
world direction and camera basis; the Planar final resolved depth is valid.

1. Enable the existing HDR chain for Planar. Preserve all shader equations,
   thresholds, additive scene-linear RGB and exact alpha, and existing resource
   budgets. Retain a zero-work bypass when both switches are off.
2. For Planar lens visibility, additionally require positive fixed-Z Sun
   elevation; preserve perspective, viewport, depth and final-brightness gates.
3. Add native-bloom conflict validation for the Planar controller without
   mutating caller settings. Reuse existing public controls in the direct page.
4. Reuse the actual HDR fixture for both worlds, plus focused Planar lifecycle,
   native-conflict, warm-history and negative-Sun gate checks. Existing isolated
   Planar medium fixtures explicitly disable HDR artifacts to retain their scope.
5. Visual qualification reproduced a rounded-square Planar Sun blur with the
   original axis schedule. Apply ADR-0049's six-direction equal-covariance
   Planar schedule using the same six passes, shader, source and resources.
   Recheck the actual Sun view and bounded HDR pixels; Globe remains unchanged.

## Exit and scope

Actual HDR pixels, alpha, finite-depth occlusion, dim-source suppression,
camera/Sun gating and resource lifecycle; relevant final-composition and Globe
regression; changed lint/format, full build/types and ownership audit. Inspect
the real Planar Sun/horizon and measure bounded GPU cost. Agent self-accepts and
creates a separate local checkpoint. No new API, asset, history, exposure,
native shadow behavior or cloud/ray/night material changes.

## Completion

All implementation and GPU/lifecycle/visual/performance/build/type review is
complete; the linked review records the reproduced Sun-footprint correction,
verification and remaining roadmap. The commit containing this closure is the
independent P3 local checkpoint, before any successor activation.
