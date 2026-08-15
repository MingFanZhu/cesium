# atmosphere-clouds-effects

## Status

- Extension: `active`
- Current phase: A3 — Exponential height fog（`active`）
- Active phase plan:
  [2026-08-15-phase-a3-exponential-height-fog.md](plans/2026-08-15-phase-a3-exponential-height-fog.md)
- Latest completed phase plan:
  [2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md](plans/2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md)
- Extension plan:
  [2026-08-14-atmosphere-clouds-effects-extension.md](plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Architecture decisions:
  [ADR-0040](../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0041](../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md),
  [ADR-0042](../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md),
  [ADR-0043](../../Documentation/SceneGIS/Decisions/ADR-0043-atmosphere-log-depth-and-radiance-mapping.md),
  [ADR-0044](../../Documentation/SceneGIS/Decisions/ADR-0044-separate-background-aerial-radiance-calibration.md),
  [ADR-0045](../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md)
- Upstream patch: active `SGP-0008`
- Branch: `feature/atmosphere-clouds-effects`
- A1 checkpoint: `a62aaf16ae3a22ae0a27d6bd21358d65b50b55e1`（未push）
- A2 checkpoint: `da2eb55743a46423e65b2047965907c05ea260b7`（未push）

## Objective

为 Cesium Globe 与 `SceneGISPlanarWorld` 建立同等级的现代环境渲染能力：physically based atmosphere、aerial
perspective、exponential height fog、volumetric clouds、cloud shadows、crepuscular rays（god rays）以及
HDR bloom/lens flare。两种世界共享光学参数、质量档、资源与合成框架，但分别使用 ellipsoid-radial 与 fixed-axis planar
reference frame，不互相伪造坐标语义。

## Active work

- A1 已实现并通过 Architecture/code review：双阶段 render integration、private pipeline lifecycle 与 globe/planar
  reference-frame contract。
- A2经过A2R、A2R2与A2R3修正后，implementation、Architecture review和第四次project-owner visual gate均已通过；本次A2
  独立本地checkpoint关闭该阶段。
- A3已依据A2 checkpoint后的源码事实建立phase plan与ADR-0045；implementation尚未开始。

## Discussions

- [双世界环境渲染架构与参考项目取舍](discussions/2026-08-14-dual-world-render-architecture.md) — `resolved`
- [A2 LUT 资产与 planar atmosphere 模型](discussions/2026-08-14-a2-lut-and-planar-model.md) — `resolved`

## Reviews

- [A1 render foundation implementation review](reviews/2026-08-14-a1-render-foundation.md) — `approved`
- [A2 Bruneton atmosphere and aerial perspective implementation review](reviews/2026-08-14-a2-bruneton-atmosphere-aerial-perspective.md) — `approved`

## Engineering paths

- A1 integration/private frame：`packages/engine/Source/Scene/Scene.js`、
  `packages/engine/Source/SceneGIS/Scene/_private/`
- A2 public/private runtime：`packages/engine/Source/SceneGIS/Scene/`、
  `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/`
- A2 assets/importer/generator：`packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/`、
  `packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/`、`scripts/scenegis/`
- Specs/manual page：`packages/engine/Specs/SceneGIS/Scene/`、`Test/高级环境.html`

## Current handoff

A2已在`da2eb55743a46423e65b2047965907c05ea260b7`形成独立本地checkpoint并关闭，未push。A3现已激活：ADR-0045冻结single-layer
dual-world exponential height fog、九个warm public controls、Globe radial/Planar fixed-Z积分、atmosphere-aware但独立calibrated fog source、
native `Fog`互斥，以及相对A2零新增program/FBO/texture/upstream seam的边界。Execution从A3 planning checkpoint开始实现，完成后必须以
uncommitted review target停下；Architecture review和project-owner visual gate之前不得checkpoint或进入A4。

## External references

- [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere) — 效果清单与原型参考，
  不作为可直接复制的实现或资产源。
- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [three-geospatial](https://github.com/takram-design-engineering/three-geospatial)

## Handoff rule

本索引只保存当前稳定状态。Phase 结果、偏差、验证、upstream-owned files、SGP 与未解决风险必须回写当前 phase plan 和
review；原始聊天、绝对路径、临时 clone 与大型日志不得写入 AgentDocs。
