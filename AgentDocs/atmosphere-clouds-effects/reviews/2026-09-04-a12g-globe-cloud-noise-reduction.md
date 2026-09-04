# A12-G Globe Cloud Noise Reduction Review

## Status

- State: `implementation assigned; candidate not yet reviewed`
- Reviewer: Architecture Agent
- Date: `2026-09-04`
- Phase: `A12-G`
- Frozen product base: `53465cf9bc8f3af1e935b3225c81364e380ea528`
- Plan: [A12-G](../plans/2026-09-04-phase-a12g-globe-cloud-noise-reduction.md)
- Open findings: `none; no candidate received`
- Owner visual gate: `blocked until Architecture review`

## Required review

Review the adaptation of the pinned reference variance clipping, finite
premultiplied color/transmittance moments, uniform identity and silhouette
preservation; confirm that the old extrema-only mutation fails a known-error
criterion. Existing current-domain distances, reprojection, cloud/scene-edge
rejection, packed shadow semantics and Planar execution must remain intact.
Resource/lookup/sample budgets and all A11 accepted product behavior are frozen.

One representative live crop did not show broad distance-history rejection;
this is not authority to loosen the distance gate or to claim all image grain
is explained. Final cloud detail/noise quality and motion stability remain
explicit project-owner judgments.
