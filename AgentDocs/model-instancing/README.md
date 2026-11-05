# 模型实例化

## Metadata

- Extension slug: `model-instancing`
- Status: active
- Planning model: standalone
- Active extension / phase plan: none
- Active standalone plan: none
- Latest completed plan: [i3dm bounds](plans/2026-11-05-i3dm-bounds.md)
- Architecture / execution / review: 本任务，未启用独立 Agent
- Last updated: 2026-11-05

## Scope and engineering links

维护原生实例化模型的 CPU / GPU 变换与包围体一致性；本次只修复 i3dm 绘制范围。
不修改 GPU 几何、内容协议、View 剔除策略或 SDK。

- Source: `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISLegacyInstanceBounds.js`
- Integration: native `I3dmLoader`, `ModelSceneGraph`, `ModelDrawCommands`, `ModelDrawCommand`
- Specs: `packages/engine/Specs/SceneGIS/Scene/SceneGISLegacyInstanceBoundsSpec.js`
- ADR: [0210](../../Documentation/SceneGIS/Decisions/ADR-0210-i3dm-instance-bounds.md)
- SGP: SGP-0075
- Branch: `scenegis/develop`
- Open discussions: none
- Latest review: [i3dm bounds](reviews/2026-11-05-i3dm-bounds.md)

## Current handoff

SGP-0075 已修复 legacy i3dm 初始化、模型/节点变换更新和模型总范围的矩阵顺序。
192-byte 实例摘要由 mesh nodes 共享；不改变 GPU 几何或普通 glTF 实例化。
4 个专用回归、85 个受影响原生测试、类型检查及补丁审计通过。
Fog 断言与 instancing 的 2D 初始化失败已在修改前源码复现，详见 review。
区间摘要允许保守扩大包围体；没有未解决的本次修复 finding。
