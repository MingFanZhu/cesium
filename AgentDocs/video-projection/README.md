# Video Projection

## Metadata

- Extension slug: video-projection
- Status: active; Gaussian receiver extension in progress
- Planning model: extension
- Active extension plan: [Gaussian receivers](plans/2026-11-02-gaussian-extension.md)
- Current phase: G1 shared multi-view selection
- Active phase plan: [G1](plans/2026-11-02-g1-gaussian-views.md)
- Architecture / execution: current task; no independent agent
- Updated: 2026-11-02
- Integrated branch: scenegis/develop; source branch: feature/video-projection

## Engineering links

- API: [VideoProjection](../../Documentation/SceneGIS/VideoProjection.md)
- Source: packages/engine/Source/SceneGIS/Scene/SceneGISVideoProjection.js
- Shared runtime: _private/_SceneGISObserverState.js, _SceneGISObserverPasses.js
- Shader: packages/engine/Source/Shaders/SceneGIS/Viewshed/SceneGISVideoProjection.glsl
- Specs: packages/engine/Specs/SceneGIS/Scene/SceneGISVideoProjectionSpec.js
- E2E: Specs/e2e/scenegis-video-projection.spec.js
- Example: Test/视频投射.html; Test/VideoProjection/
- ADR: [0177](../../Documentation/SceneGIS/Decisions/ADR-0177-video-projection.md), ADR-0176
- Upstream seam: SGP-0065; this extension changed only Scene.js dispatch names

## Handoff

P1 e24e1d8f09, P2 b2471eef12 and P3 81e3609272 are separate checkpoints.
P3 includes example, integration Specs and source-reset fix. The owner confirmed
visual acceptance on 2026-10-21.
[Latest review](reviews/2026-10-21-p3.md) contains bounded performance evidence.
[P1 review](reviews/2026-10-21-p1.md), [P2 review](reviews/2026-10-21-p2.md) and
[preparation](reviews/2026-10-21-preparation.md) retain phase history.
[Reuse discussion](discussions/2026-10-21-observer-reuse.md) is resolved by ADR-0177.

No open blocking review or remaining phase gate. On 2026-10-21 the owner requested
merging Viewshed and VideoProjection into scenegis/develop. Both branches were
fast-forwarded into develop through 613f45c782, with no conflicts or runtime changes.
SDK integration remains separate work; feature branches are retained.
Known limits: finite depth / LOD precision, SDR display overlay including possible
transparent foreground coverage, browser CORS / decoding, per-instance depth and
texture costs. Full AgentDocs formatting has unrelated historical warnings.
