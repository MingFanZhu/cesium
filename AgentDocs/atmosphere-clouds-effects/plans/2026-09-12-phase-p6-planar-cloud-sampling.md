# P6 Planar Cloud Sampling Quality

## Metadata

- Type: `phase`; status: `completed`; created/updated: `2026-09-12`
- Owner: current Architecture / Execution role; architecture review: `confirmed`
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P5 `b2c7655872`
- Decision: [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Upstream budget: zero; existing SGP-0008 consumed only
- Review: [accepted bounded repair](../reviews/2026-09-12-p6-planar-cloud-sampling.md)

## Source facts and scope

The owner prioritizes coarse clouds. The same fixed Planar view remains grainy
in high as well as medium. CloudFS calls the shared `sceneGISMarchClouds`, but
Planar still divides the complete slab into 64 coarse intervals with at most
four detailed samples each. A horizontal 300 km path therefore starts with
1171.875 m detailed intervals, despite the cumulus detail period being 450 m.
Globe already uses progressive 50 m near steps growing by 1.01 to 1000 m.
The problem is not resolved by changing MRT raster size alone.

This phase targets primary integration aliasing before replacing the retained
Planar material or radiometric calibration. Preserve fixed +Z, absolute metric
height, custom CRS, the 300 km cloud segment, public defaults, asset formats,
cloud-shadow material and native geometry-shadow controls. No spherical mapping
enters Planar. Globe output and low-tier policy stay unchanged.

## Implementation

For Planar medium/high, integrate consecutive intervals starting at cloud entry,
with a 50 m minimum, 1.01 growth and 1000 m maximum. Use one existing STBN sample
within each interval and its exact length for Beer integration. Clip the final
interval to the receiver/slab endpoint. A fixed 512-interval ceiling covers the
complete 300 km segment even from the minimum step; no terminal tail is lost.
Use the existing conservative occupancy for the complete actual interval.
Retain pixel-footprint material filtering and current reconstruction/history.
Planar low keeps its existing 32-sample coarse policy.

Source is the SceneGIS-owned volumetric GLSL. Existing GLSL-to-JS generation,
renderer shader assembly and engine Karma Specs remain the delivery path.
No hand-edited generated module, new resource, API, texture, program category,
pass or history state is required.

## Verification and gate

1. Actual GPU controlled near-density witness: integrate thin near support and
   reject the old uniform scheduler against independent analytic extinction.
   Check far endpoint coverage and clipping, low and Globe regressions.
2. Existing integrated density/occupancy and diagnostics fixtures, Planar cloud
   history/depth/composition and P2 cloud shadow regression as relevant.
3. Same-view medium/high, ground/above/high altitude, fixed time and bounded
   camera movement visual comparison. Preserve and restore owner state.
4. Bounded before/after GPU cloud-pass timing; report the real cost of the
   increased maximum sample budget. Resource allocation remains identical.
5. Scoped lint/format, build and ownership/generated audit. Record results and
   remaining material/radiometric limitations, then make a separate local
   checkpoint before activating successor work.

## Handoff

Seven focused GPU cases, build, scoped ESLint/Prettier, full AgentDocs
markdownlint and upstream audit pass. Full AgentDocs Prettier retains the same
16 unrelated historical failures. No API, generator, package or type contract
changed; full type generation and release packaging are not repeated.

Architecture accepts the primary sampling improvement at +0.880 ms median
cloud-pass cost in the saved medium view. Resources and GPU bytes are unchanged.
The independent local checkpoint follows P5. Cloud coarseness is **not closed**:
actual cloud-top images retain coarse/soft material and flat bright regions.
Continue material/detail and lighting adaptation before rays and Moon, using
the extension roadmap and the review's open finding. No owner approval is pending.
