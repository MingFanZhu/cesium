# Planar Materials

- Extension slug: `planar-materials`
- Status: `active`
- Planning model: `extension`
- Active extension plan: [总体计划](plans/2026-10-21-planar-materials.md)
- Current phase / active plan: [M4 平面折线材质](plans/2026-10-21-m4-polyline-materials.md)
- Architecture / execution contact: 当前任务
- Last updated: `2026-10-22`

## Scope and engineering links

普通面、贴地面和折线接入 Cesium Material / Fabric，并由平面 Entity adapter 复用。
保留颜色路径、静态合批、动态属性、独立拾取和资源所有权。

- Source: `packages/engine/Source/SceneGIS/{Core,Scene,DataSources}` 与 owned GLSL。
- Specs: `packages/engine/Specs/SceneGIS`。
- Examples: `Test/平面材质.html`、`Test/平面折线材质.html`。
- M1–M3 integration: `scenegis/develop`; M4 branch: `feature/planar-polyline-materials`。
- ADR: [ADR-0178](../../Documentation/SceneGIS/Decisions/ADR-0178-planar-materials.md)、[ADR-0182](../../Documentation/SceneGIS/Decisions/ADR-0182-planar-polyline-materials.md)
- SGP: None。

## Current handoff

- 2026-10-21: activate M4 / ADR-0182 on `feature/planar-polyline-materials` after
  owner authorization. Reuse native Material and existing pixel-width line paths;
  qualify continuous UV, alpha, frozen-clock updates and resource ownership.

- M1 `4264d02bd0`、M2 `b875cb79a9`、M3 `2663f9bd37` 已按项目负责人要求快进合入 `scenegis/develop`，无冲突。
- Open discussions: None。
- Latest review: [M4](reviews/2026-10-22-m4-polyline-materials.md) technical passed；无未解决实现 finding。
- Known risks: 纹理接缝、透明语义、stencil/discard、动态纹理所有权。
- Next action: M4 技术完成，本轮作为独立本地阶段检查点；项目负责人验收 `Test/平面折线材质.html`，视觉结论尚未记录。
