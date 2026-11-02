# G1：共享高斯多视角选级

- Type: phase plan
- Status: completed
- Parent: [Gaussian extension](2026-11-02-gaussian-extension.md)
- Date: 2026-11-02
- Owner: current task
- Architecture review: confirmed
- ADR: ADR-0208; SGP: none in this phase

## Source facts and implementation

The owned controller currently freezes one main camera view for selection and sorting.
Active Cut validates a strict frozen-view shape and measures visibility/SSE and priority.
Add optional additionalViews to the private frozen selection record, with validated immutable
proofs. Visibility is the union; projected error is the maximum for visible cameras. Budget
and cut topology stay shared. Ranking uses conservative maximum footprint / minimum depth.
The main camera remains the sole radial ordering origin.

Observe active Gaussian target requests from the existing explicit FrameState observer list.
Projector resolution defines its pixel metric. Camera/target/transform changes invalidate
selection freshness, without creating another loader, atlas or sorter. Report private coverage
readiness only after a current-view converged cut has been published, never from ready alone.

## Verification and gate

Add union/frustum/projection/frozen-proof tests, run relevant existing Active Cut and
controller regressions. Verify the no-observer path and budgets remain unchanged. Lint,
record review and commit G1 before entering G2. No public API/runtime upstream seam yet.

## Outcome

32 Node selection tests and 48 strict-WebGL controller regressions pass. Shared views retain
the original main sorting origin; changed projector proofs reject stale commits. Review:
[G1](../reviews/2026-11-02-g1-gaussian-views.md). No upstream/SGP increment in G1.
