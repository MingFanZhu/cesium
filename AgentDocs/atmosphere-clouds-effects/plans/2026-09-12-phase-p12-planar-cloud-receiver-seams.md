# P12 Planar Cloud Receiver Seams

## Metadata

- Type: `phase`; status: `completed`; created: `2026-09-12`
- Owner: current Architecture / Execution role; design review: `confirmed`
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P11 `39c440237c`; decisions: ADR-0048/0052
- Upstream-owned files / SGP delta: none

## Diagnosis and contract

The owner reports a thin horizon line through clouds. Current Planar rendering
also shows dashed seams along an opaque box silhouette. Actual cloud-history
readback shows a transparent invalid pixel between opaque valid cloud pixels;
the receiver range there exceeds the 1,000 km packed-distance encoding.
Reconstructing current neighbors from the existing raw depth removes the horizon
hole. One-sided receiver derivatives remove the silhouette rejection: GPU quad
derivatives had mixed distinct surfaces. A final-composite footprint experiment
did not remove the seam and is discarded.

Use raw current depth for Planar spatial receiver positions, retaining existing
packed mean/front/history storage and precision tolerances. For each receiver
axis, reconstruct adjacent raw-depth eye positions, exclude clear/out-of-viewport
neighbors and choose the side with the smaller eye-depth change. Transform its
cross product into the existing camera basis. This adds four depth reads only
for finite Planar receivers; Globe remains unchanged. No receiver tolerance
widening, cloud fade, new pass/texture, public property or coordinate change.

## Verification and exit

- Focused actual GPU reconstruction across the packed-range limit and a depth
  discontinuity, all four medium phases, with old-source mutations discriminated.
- Preserve near foreground rejection, Planar phased motion/coverage and existing
  Globe reconstruction. Exercise the nonphased Planar path.
- Same-view live horizon/silhouette inspection, bounded resolve-command timing,
  unchanged resource identities and restored owner state.
- Scoped Specs/build/lint, ownership and document checks; record self-review,
  complete phase metadata and create an independent local checkpoint.

## Completion

Implementation follows the diagnosed boundary without a new renderer path.
Five relevant actual GPU cases pass, covering the new far/silhouette failure,
Planar phased reconstruction and motion, Globe reconstruction, and off-center
frusta/depth variants. The existing double-log-depth mutation now matches both
single-line and multiline raw-depth calls; the prior pattern only rewrote the
Globe branch and its indirect packed-distance effect disappeared with this fix.
The corrected mutation still demonstrates the original depth contract.

Same-view inspection removes the thin blue horizon line and dashed silhouette.
Bounded GPU resolve medians are 1.408 ms before and 1.323 ms after, with unchanged
resource identities; this does not establish a speedup. Build, scoped lint and
ownership checks pass. Full AgentDocs Markdown lint passes; its full Prettier
scan retains 16 unrelated baseline warnings, with changed documents clean.
See the [accepted review](../reviews/2026-09-12-p12-planar-cloud-receiver-seams.md)
for evidence and limits. Owner parameters/latest camera are restored, the live
page uses the fix, and the containing commit is the independent local checkpoint.
