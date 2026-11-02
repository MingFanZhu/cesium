# G2 review：接收、遮挡与所有权

- Type: review
- Status: approved for core checkpoint; G3 qualification remains required
- Date: 2026-11-02
- Owner: current task architecture self-review
- Target: [G2](../plans/2026-11-02-g2-gaussian-receivers.md)
- ADR: ADR-0208; upstream: Scene.js, SGP-0065 (five-line early dispatch)

## Findings and disposition

- Fixed: four projector uniform callbacks initially shared temporary vectors. Cesium evaluates
  map values before setting GL uniforms, so unused slots overwrote the first range. Each slot
  now owns stable vectors. Real pixels verify video application and differing multi-video colors.
- Fixed in fixture: Globe setup must use Scene.globe, not _initializeWorld(Globe), to preserve
  actual native Globe identity. The ENU test now uses the real public native assignment.
- Fixed: constructor registration order need not match postProcessStages order. Preparation
  uses actual collection order; reverse-constructed video instances verify color precedence.
- Fixed: paused media needs an explicit redraw on enabled changes and stage destruction.
  Owned enabled accessor retains the base stage's resource-transition field separately.
- Accepted approximation: per-fragment threshold and regularized maximum-density proxy do not
  solve cumulative optical transmittance or relight SH. Public docs identify the color and
  geometric contract. Front/rear surface visual qualification remains G3, not a claimed G2 pass.

## Verification

Three target GPU cases pass with strict WebGL validation and real Workers/media. They verify
nested membership, invalid source/threshold/capacity, shared atlas, no extra paused uploads,
opacity, collection order, native blockers, offscreen capture, view/model edits, stage removal,
borrowed stream ownership and auxiliary-program/depth release during active Scene teardown.
The existing 253 Gaussian cases plus the new three pass (256 total); original video 8 and
Viewshed/depth 14 pass. Focused target and video reruns cover the final cleanup/enabled edits.
Node G1 selection tests remain unchanged. Development build, type generation and tsc pass;
type generation retains existing upstream warnings. Source lint, changed-path formatting,
AgentDocs Markdown lint and upstream patch audit pass; whole AgentDocs format retains
inherited warnings outside this extension. No generated product or SDK file is committed.

Only Scene.js changes upstream under the existing SGP-0065. Normal Gaussian depth writes
stay off, capture never advances the controller and the video stage never owns its targets.
No unresolved core finding. Complete G3 images, costs and final distribution/type acceptance
before claiming the whole extension delivered.
