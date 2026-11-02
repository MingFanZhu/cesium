# Video Projection

## Metadata

- Extension slug: video-projection
- Status: completed; Gaussian receivers technically qualified, owner visual judgment retained
- Planning model: extension
- Active extension plan: none; latest [Gaussian receivers](plans/2026-11-02-gaussian-extension.md)
- Current phase: G3 completed
- Active phase plan: none; latest [G3](plans/2026-11-02-g3-gaussian-qualification.md)
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

2026-11-02：自有分段高斯投射完成，G1 `24137b6d05`、G2 `cb0cb10d53`；
G3 [技术评审](reviews/2026-11-02-g3-gaussian-qualification.md)记录画面、发布版验证与有界开销。
公开入口为 SceneGISVideoProjection.gaussianTargets / gaussianAlphaThreshold。
新增示例 Test/Rendering/高斯视频投射.html 支持球面 / 平面及本地视频；数据生成命令见 API 指南。
完整发行、类型、42 项 Node、双世界开发 / 发布版 4+4 项浏览器用例通过；
原有高斯 / 视频 / 可视域回归保留。仅 Scene.js 增加 SGP-0065 五行早期捕获接点，
不修改 SDK 或原生 Gaussian。分支 feature/gaussian-video-projection；未自动合并或推送。
单片元阈值、颜色域和既有排序 / 预算限制见 ADR-0208，真实资产画质由负责人判断。

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
