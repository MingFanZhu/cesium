# Planar Materials

- Extension slug: `planar-materials`
- Status: `active`
- Planning model: `extension`
- Active extension plan: [总体计划](plans/2026-10-21-planar-materials.md)
- Current phase / active plan: [M2 贴地面材质](plans/2026-10-21-m2-ground-materials.md)
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

- M1 已提交 4264d02bd0；M2 technical passed，待检查点；M3 尚未进入。
- Open discussions: None。
- Latest review: [M2](reviews/2026-10-21-m2-ground-materials.md) technical passed；无未解决 finding。
- Known risks: 纹理接缝、透明语义、stencil/discard、动态纹理所有权。
- Next action: 完成 M2 贴地材质、GPU/生命周期验证与独立本地检查点。
