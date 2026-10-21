# Viewshed

## Metadata

- Extension slug: `viewshed`
- Status: `active`
- Planning model: `extension`
- Active extension plan: [directed viewshed](plans/2026-10-21-extension.md)
- Current phase: V3 — technically completed, visual acceptance pending
- Active phase plan: [V3](plans/2026-10-21-v3-qualification.md)
- Active standalone plan: None; [Observer range guide](plans/2026-10-21-frustum-guide.md) technically completed
- Architecture / execution contact: current task, no independent agent
- Last updated: 2026-10-21

## Scope and engineering links

显式绑定 Scene / World 的定向可视域，覆盖 Globe ECEF 和 Planar 米制 XYZ。
独立观察点瓦片选取，复用内容与原生深度派生，不依赖主相机可见集合。
首轮不含全向分析、多观察点集合运算、结果导出和透明介质透射。

- Source: `packages/engine/Source/SceneGIS/Scene/`
- Specs: `packages/engine/Specs/SceneGIS/Scene/`
- Shader: `packages/engine/Source/Shaders/SceneGIS/Viewshed/`
- Test: `Test/可视域分析.html`、`Specs/e2e/scenegis-viewshed.spec.js`
- Public guide: [Viewshed](../../Documentation/SceneGIS/Viewshed.md)
- Branch: `feature/viewshed`
- ADR: [0176](../../Documentation/SceneGIS/Decisions/ADR-0176-observer-viewshed.md)
- SGP: SGP-0065（V1 无上游修改）

## Current handoff

用户已同意总体方案；V1 checkpoint 为 `04101ff1ea`。
V2 checkpoint `c2a91dceb7` 已接入独立数据选取与公开 API，并通过[自审](reviews/2026-10-21-v2.md)。
V3 技术 gate 已通过：[最新 review](reviews/2026-10-21-v3.md) 记录 10 项 dev E2E、
3 项 release smoke、暖态 CPU 和 4 MiB 深度资源。最终负责人视觉验收待确认。
暂无 open discussion 或阻塞 review；粗糙倾斜摄影采样噪点、有限精度和既有
Surface 透明像素失败明确保留。下一步由负责人检查页面，再决定 SDK 集成。

V3 checkpoint `62cc7be37e` 已完成。观察范围辅助线 standalone 已通过技术验收，
见[最新 review](reviews/2026-10-21-frustum-guide.md)：14 项 Specs、2 项双世界 E2E、
完整构建与类型检查通过，无上游接点改动。示例默认开启，API 默认关闭，
可独立切换。负责人已确认亮黄色辅助线并要求提交；SDK 集成待后续安排。
