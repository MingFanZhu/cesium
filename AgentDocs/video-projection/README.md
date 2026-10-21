# Video Projection

## Metadata

- Extension slug: `video-projection`
- Status: `active`
- Planning model: `extension`
- Active extension plan: [视频投射计划](plans/2026-10-21-extension.md)（active）
- Current phase: P2 completed; P1 checkpoint e24e1d8f09
- Active phase plan: [P2](plans/2026-10-21-p2-media.md)
- Architecture / execution contact: current task；未启用独立 Agent
- Last updated: 2026-10-21

## Scope and engineering links

复用可视域的独立观察点深度，为 Globe / Planar 的不透明表面投射视频，
保持主相机独立、加载状态诚实、太阳阴影和多实例资源隔离。

- Existing source: `packages/engine/Source/SceneGIS/Scene/SceneGISViewshed.js`、`_private/_SceneGISViewsheds.js`、`_private/_SceneGISViewshedDepth.js`
- Existing shader: `packages/engine/Source/Shaders/SceneGIS/Viewshed/SceneGISViewshed.glsl`
- Proposed API: `SceneGISVideoProjection`（实验 API，P2 已实现）
- Planned Specs: `packages/engine/Specs/SceneGIS/Scene/`；复用 Viewshed 测试数据
- Planned example: `Test/视频投射.html`；双 World、本地可复现媒体
- Preparation branch: `feature/video-projection`
- Existing ADR / seam: [ADR-0176](../../Documentation/SceneGIS/Decisions/ADR-0176-observer-viewshed.md)、SGP-0065
- New ADR: [ADR-0177](../../Documentation/SceneGIS/Decisions/ADR-0177-video-projection.md)

## Current handoff

- 现有工作已提交：`1c40926421` 同源影像示例、`faff52a0e8` 平面影像解码。
- [复用讨论](discussions/2026-10-21-observer-reuse.md)：resolved as proposal。
- [准备评审](reviews/2026-10-21-preparation.md)：仅批准计划，尚未实施或运行新功能测试。
- Open discussions / blocking reviews: None；首版建议与限制见计划。
- Next action: 提交 P2 检查点后进入双世界示例与性能验收。
- Known risks: 有限深度分辨率、覆盖不齐、媒体变更、颜色空间和多实例绘制开销。

- Latest review: [P1](reviews/2026-10-21-p1.md).

- P2 review: [media / projection](reviews/2026-10-21-p2.md).
- API guide: [VideoProjection](../../Documentation/SceneGIS/VideoProjection.md).
