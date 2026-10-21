# Planar Materials

- Extension slug: `planar-materials`
- Status: `active`
- Planning model: `extension`
- Active extension plan: [总体计划](plans/2026-10-21-planar-materials.md)
- Current phase / active plan: [M3 Entity 与验收](plans/2026-10-21-m3-entity-qualification.md)
- Architecture / execution contact: 当前任务
- Last updated: `2026-10-21`

## Scope and engineering links

普通面与贴地面接入 Cesium Material / Fabric，并由平面 Entity adapter 复用。
保留颜色路径、静态合批、动态属性、独立拾取和资源所有权。

- Source: `packages/engine/Source/SceneGIS/{Core,Scene,DataSources}` 与 owned GLSL。
- Specs: `packages/engine/Specs/SceneGIS`。
- Example: 资格阶段建立 `Test/平面材质.html`。
- Branch: `feature/planar-materials`
- ADR: [ADR-0178](../../Documentation/SceneGIS/Decisions/ADR-0178-planar-materials.md)
- SGP: None。

## Current handoff

- M1 已提交 4264d02bd0；M2 已提交 b875cb79a9；M3 技术完成，本阶段提交作为独立检查点；待项目负责人视觉验收。
- Open discussions: None。
- Latest review: [M3](reviews/2026-10-21-m3-entity-qualification.md) technical passed；无未解决 finding。
- Known risks: 纹理接缝、透明语义、stencil/discard、动态纹理所有权。
- Next action: 项目负责人检查 Test/平面材质.html；技术代码准备完成，可在验收后合并。
