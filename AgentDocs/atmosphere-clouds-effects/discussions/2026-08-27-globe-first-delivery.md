# Discussion: Globe-first Advanced Environment Delivery

## Metadata

- Status: `resolved; promoted to ADR-0040/0046 and A4-G phase plan`
- Date: `2026-08-27`
- Owner: Architecture Agent
- Related extension:
  [atmosphere-clouds-effects](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Successor phase:
  [A4-G Globe reference-first integrated cloud core](../plans/2026-08-27-phase-a4g-globe-integrated-cloud-core.md)
- Decisions:
  [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)

## Trigger

The project-owner visual gate rejected the retained A4 candidate after enabling
Planar exponential height fog and volumetric clouds together. The final-source
page showed a large white background region and incorrectly layered cloud/fog
output. The screenshot is sufficient to reject the visual gate, but not to claim
a root cause.

The project owner then changed delivery order explicitly: implement the complete
advanced-rendering capability family for Cesium Globe first, and only after that
return to Planar adaptation. The reference project is not merely a comparison
target; its fixed Cesium implementation is the preferred starting authority for
the Globe feature graph.

## Fixed reference facts

Architecture checked out
[`yuwoniu03/cesium-clouds-atmosphere@1f38602b`](https://github.com/yuwoniu03/cesium-clouds-atmosphere/tree/1f38602b84ab5c3f2bc289f9e4464df3db917155)
outside the repository and verified the exact commit and MIT repository license.

- `ThreeGeospatialPipeline.init()` builds a Globe-only chain containing Bruneton
  atmosphere, geometry aerial perspective, volumetric clouds, four-cascade Beer
  Shadow Map generation, shadow temporal resolve, and cloud history.
- The cloud shader consumes the same transmittance and irradiance LUTs as the
  atmosphere and uses `GetSunAndSkyScalarIrradiance` for solar and sky lighting.
- Resolved Beer shadow data is propagated to atmosphere and aerial composition;
  shadow length drives ground cloud shadow and crepuscular/Tyndall response.
- The reference has an optional exponential `haze` approximation in the cloud
  shader. It does not contain an independent general-purpose height-fog subsystem
  equivalent to SceneGIS A3.
- Lens flare/bloom exists as a separate optional stage.
- Its runtime container uses `PostProcessStage`, `scene.context._gl`, runtime
  shader/asset fetch, and raw-WebGL temporal buffers. The documented stage order
  also places cloud after an aerial stage that performs tone mapping. Those
  mechanics are not compatible with SceneGIS HDR, ownership, packaging, or
  failure-atomicity rules.

## Decision

1. Final product scope remains Globe plus Planar, but delivery is now strictly
   **Globe first**. Existing accepted A2/A3 Planar work remains checkpointed and
   untouched; it is not a gate or implementation target during the Globe track.
2. The current dual-world A4 owner gate is revoked. `A4-AR-028` records the Planar
   fog/cloud failure as a deferred known issue and opens A4-G.
3. The fixed Cesium reference is an implementation authority for the Globe
   feature topology and for legally traceable shader/algorithm adaptations, not
   only a visual comparator. Each adopted source or asset still needs file-level
   license, copyright, provenance, format, and package review.
4. SceneGIS retains its own integration container: `SGP-0008` background and
   pre-postprocess linear-HDR slots, Cesium Renderer abstractions, one owner per
   `Context`, offline packaged assets, and one display-transfer authority. Raw
   `_gl`, PBO, runtime public-network fetch, and duplicate tone mapping remain
   prohibited.
5. Globe stages remain serial and independently reviewable: A4-G integrated
   atmosphere/fog/cloud core; A5-G cloud shadow, shadow-length coupling,
   crepuscular rays, and atmosphere-derived skylight boundary; A6-G temporal and
   performance policy; A7-G bloom/lens flare; A8-G Globe qualification. Planar
   source discovery and adaptation begin only after A8-G approval.

## Consequences

- Current Planar product code is frozen, not declared correct and not silently
  patched. The reported composition failure must be reproduced and fixed in the
  later Planar phase against the accepted Globe optical contract.
- Globe acceptance does not require cross-world pixel or radiometric parity.
- A4-G may replace retained A4 cloud implementation with audited reference-derived
  algorithms or assets where provenance is complete. It must preserve SceneGIS
  lifecycle, HDR ordering, public API review, and resource budgets explicitly.
- Execution may not enter A5-G, commit, push, or create a checkpoint until A4-G
  passes Architecture review and the project-owner Globe visual gate.
