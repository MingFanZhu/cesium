# 分段 Gaussian 泼溅

## Metadata

- Extension slug: `gaussian-splats`
- Status: active
- Planning model: extension
- Active extension plan: [迁移](plans/2026-10-23-migration.md)
- Current phase: P1
- Active phase plan: [协议与 CPU 工具](plans/2026-10-23-p1-tool-and-protocol.md)
- Architecture / execution contact: 本任务
- Last updated: 2026-10-23

## Scope

迁移 segmented-active-cut-v3 渲染、分段 CPU 切片与 authored LOD 导入。
排除 fixed10 加载/切片、训练蒸馏、SDK。保留旧分段二进制数据兼容。

## Engineering links

- Source: `packages/engine/Source/SceneGIS/{Core,Renderer,Scene}`
- Tool: `Tools/GaussianSplatTiler`
- Specs: `packages/engine/Specs/SceneGIS` 与工具 Node tests
- Example: P2 建立 Test 入口
- Branch: `feature/gaussian-segmented`
- ADR: [ADR-0188](../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP: P1 无

## Current handoff

范围已按负责人最新指示缩减为分段路线。P1 正在提取共享依赖与工具。
无 open discussion；review 尚未建立。下一步完成 P1 验证、review 和本地提交，再进入 P2。
