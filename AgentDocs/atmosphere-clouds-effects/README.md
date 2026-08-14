# atmosphere-clouds-effects

## Status

- Extension: `active`
- Current phase: A2 — Bruneton atmosphere and aerial perspective（`active`）
- Active phase plan:
  [2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md](plans/2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md)
- Latest completed phase plan:
  [2026-08-14-phase-a1-render-foundation.md](plans/2026-08-14-phase-a1-render-foundation.md)
- Extension plan:
  [2026-08-14-atmosphere-clouds-effects-extension.md](plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Architecture decisions:
  [ADR-0040](../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0041](../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md)
- Upstream patch: active `SGP-0008`
- Branch: `feature/atmosphere-clouds-effects`
- A1 checkpoint: `a62aaf16ae3a22ae0a27d6bd21358d65b50b55e1`（未push）

## Objective

为 Cesium Globe 与 `SceneGISPlanarWorld` 建立同等级的现代环境渲染能力：physically based atmosphere、aerial
perspective、exponential height fog、volumetric clouds、cloud shadows、crepuscular rays（god rays）以及
HDR bloom/lens flare。两种世界共享光学参数、质量档、资源与合成框架，但分别使用 ellipsoid-radial 与 fixed-axis planar
reference frame，不互相伪造坐标语义。

## Active work

- A1 已实现并通过 Architecture/code review：双阶段 render integration、private pipeline lifecycle 与 globe/planar
  reference-frame contract。
- A2 已由 Architecture 完成源码、capability、depth、asset/license与package delivery审计并正式激活；当前只允许实现
  `SceneGISEnvironmentEffects`、Globe Bruneton LUT atmosphere/aerial、planar flat-slab atmosphere/aerial及其交付验证。
- A2 manual visual gate由项目负责人验收；A2 review/checkpoint前不得进入A3。

## Discussions

- [双世界环境渲染架构与参考项目取舍](discussions/2026-08-14-dual-world-render-architecture.md) — `resolved`
- [A2 LUT 资产与 planar atmosphere 模型](discussions/2026-08-14-a2-lut-and-planar-model.md) — `resolved`

## Reviews

- [A1 render foundation implementation review](reviews/2026-08-14-a1-render-foundation.md) — `approved`

## Engineering paths

- A1 integration/private frame：`packages/engine/Source/Scene/Scene.js`、
  `packages/engine/Source/SceneGIS/Scene/_private/`
- A2 public/private runtime：`packages/engine/Source/SceneGIS/Scene/`、
  `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/`
- A2 assets/importer：`packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/`、`scripts/scenegis/`
- Specs/manual page：`packages/engine/Specs/SceneGIS/Scene/`、`Test/高级环境.html`

## Current handoff

Execution 从 A2 planning checkpoint 实现 active phase plan，完成实现与最小充分验证后保持未commit、未push，写入A2 open review并发送
`review_ready`；不得激活A3。Architecture review通过后仍需项目负责人实际完成manual visual gate。

## External references

- [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere) — 效果清单与原型参考，
  不作为可直接复制的实现或资产源。
- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [three-geospatial](https://github.com/takram-design-engineering/three-geospatial)

## Handoff rule

本索引只保存当前稳定状态。Phase 结果、偏差、验证、upstream-owned files、SGP 与未解决风险必须回写当前 phase plan 和
review；原始聊天、绝对路径、临时 clone 与大型日志不得写入 AgentDocs。
