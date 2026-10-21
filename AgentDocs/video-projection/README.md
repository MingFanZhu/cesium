# Video Projection

## Metadata

- Extension slug: video-projection
- Status: implemented; owner visual acceptance pending
- Planning model: extension
- Active extension plan: [video projection](plans/2026-10-21-extension.md)
- Current phase: P3 technically completed
- Active phase plan: none; latest [P3](plans/2026-10-21-p3-qualification.md)
- Architecture / execution: current task; no independent agent
- Updated: 2026-10-21
- Branch: feature/video-projection

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

P1 e24e1d8f09 and P2 b2471eef12 are separate checkpoints. P3 technical checks are
complete; its checkpoint includes example, integration Specs and source-reset fix.
[Latest review](reviews/2026-10-21-p3.md) contains bounded performance evidence.
[P1 review](reviews/2026-10-21-p1.md), [P2 review](reviews/2026-10-21-p2.md) and
[preparation](reviews/2026-10-21-preparation.md) retain phase history.
[Reuse discussion](discussions/2026-10-21-observer-reuse.md) is resolved by ADR-0177.

No open blocking review. Next: owner visual acceptance in Globe / Planar, then
separately authorize SDK integration or merge. No push or merge performed here.
Known limits: finite depth / LOD precision, SDR display overlay including possible
transparent foreground coverage, browser CORS / decoding, per-instance depth and
texture costs. Full AgentDocs formatting has unrelated historical warnings.
