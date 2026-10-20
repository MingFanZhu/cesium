# Viewshed

## Metadata

- Extension slug: `viewshed`
- Status: `active`
- Planning model: `extension`
- Active extension plan: [directed viewshed](plans/2026-10-21-extension.md)
- Current phase: V2 — completed, checkpoint pending
- Active phase plan: [V2](plans/2026-10-21-v2-integration.md)
- Active standalone plan: None
- Architecture / execution contact: current task, no independent agent
- Last updated: 2026-10-21

## Scope and engineering links

显式绑定 Scene / World 的定向可视域，覆盖 Globe ECEF 和 Planar 米制 XYZ。
独立观察点瓦片选取，复用内容与原生深度派生，不依赖主相机可见集合。
首轮不含全向分析、多观察点集合运算、结果导出和透明介质透射。

- Source: `packages/engine/Source/SceneGIS/Scene/`
- Specs: `packages/engine/Specs/SceneGIS/Scene/`
- Shader: `packages/engine/Source/Shaders/SceneGIS/Viewshed/`
- Test / Sandcastle: V3 创建验收示例；无新增 Sandcastle
- Branch: `feature/viewshed`
- ADR: [0176](../../Documentation/SceneGIS/Decisions/ADR-0176-observer-viewshed.md)
- SGP: SGP-0065（V1 无上游修改）

## Current handoff

用户已同意总体方案；V1 checkpoint 为 `04101ff1ea`。
V2 已接入独立数据选取与公开 API，通过集成验证和[自审](reviews/2026-10-21-v2.md)；V3 尚未进入。
暂无 open discussion 或阻塞 review；既有 Surface 透明像素失败仍按 V2 review 保留。
风险：Globe / Planar 的单视图选取状态、LOD 覆盖完整性、MASK / clipping、
多视锥主深度、模型动态变形与资源生命周期。按 phase plan 验证后独立提交。
