# atmosphere-clouds-effects

## Status

- Extension: `active`
- Current phase: A4 — Volumetric cloud core（`active`）
- Active phase plan:
  [2026-08-15-phase-a4-volumetric-cloud-core.md](plans/2026-08-15-phase-a4-volumetric-cloud-core.md)
- Latest completed phase plan:
  [2026-08-15-phase-a3-exponential-height-fog.md](plans/2026-08-15-phase-a3-exponential-height-fog.md)
- Extension plan:
  [2026-08-14-atmosphere-clouds-effects-extension.md](plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Architecture decisions:
  [ADR-0040](../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0041](../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md),
  [ADR-0042](../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md),
  [ADR-0043](../../Documentation/SceneGIS/Decisions/ADR-0043-atmosphere-log-depth-and-radiance-mapping.md),
  [ADR-0044](../../Documentation/SceneGIS/Decisions/ADR-0044-separate-background-aerial-radiance-calibration.md),
  [ADR-0045](../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md),
  [ADR-0046](../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Upstream patch: active `SGP-0008`
- Branch: `feature/atmosphere-clouds-effects`
- A1 checkpoint: `a62aaf16ae3a22ae0a27d6bd21358d65b50b55e1`（未push）
- A2 checkpoint: `da2eb55743a46423e65b2047965907c05ea260b7`（未push）
- A3 checkpoint: `43ed40117104e0450bf23dc094b2ab2e602bbfa2`（未push）

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
- A3首轮Architecture review的两个blocker均已由Execution修复并通过Architecture独立复审：Planar近水平短segment使用float32稳定的指数积分比，
  direct Test对`Scene.renderError`、有限有序frustum、新成功帧与Cesium error panel执行严格门禁；A3已
  `approved`，项目负责人live visual gate已明确通过。
- A4已基于checkpointed A3 renderer、MRT capability、asset/package边界以及fixed reference commits完成source-based planning。Frozen scope是
  single-deck dual-world cloud core、deterministic local assets、bounded low-resolution raymarch、A2/A3-aware composition与caller-owned motion；
  cloud shadow/god rays、temporal history和bloom/lens flare保持在A5-A7。

## Discussions

- [双世界环境渲染架构与参考项目取舍](discussions/2026-08-14-dual-world-render-architecture.md) — `resolved`
- [A2 LUT 资产与 planar atmosphere 模型](discussions/2026-08-14-a2-lut-and-planar-model.md) — `resolved`
- [A3 default height-fog washout](discussions/2026-08-15-a3-default-fog-washout.md) — `resolved`

## Reviews

- [A1 render foundation implementation review](reviews/2026-08-14-a1-render-foundation.md) — `approved`
- [A2 Bruneton atmosphere and aerial perspective implementation review](reviews/2026-08-14-a2-bruneton-atmosphere-aerial-perspective.md) — `approved`
- [A3 exponential height fog implementation review](reviews/2026-08-15-a3-exponential-height-fog.md) — `approved`

## Engineering paths

- A1 integration/private frame：`packages/engine/Source/Scene/Scene.js`、
  `packages/engine/Source/SceneGIS/Scene/_private/`
- A2 public/private runtime：`packages/engine/Source/SceneGIS/Scene/`、
  `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/`
- A2 assets/importer/generator：`packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/`、
  `packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth/`、`scripts/scenegis/`
- A4 planned assets/generator：`packages/engine/Source/Assets/SceneGIS/Environment/CloudCore/`、`scripts/scenegis/`
- Specs/manual page：`packages/engine/Specs/SceneGIS/Scene/`、`Test/高级环境.html`

## Current handoff

A3已在`43ed40117104e0450bf23dc094b2ab2e602bbfa2`形成独立本地checkpoint并关闭，未push。A4 phase plan与ADR-0046已冻结十个public
cloud controls、Globe shell/Planar slab、四个deterministic package-local assets、three quality budgets、two-attachment RGBA16F cloud MRT、
A2/A3-to-mean composition、resource ceiling和manual stop conditions。A4只消费active `SGP-0008`；`Scene.js`与upstream manifest不得改变。
Execution从Architecture A4 planning checkpoint开始，保持实现tree未commit/未push，在review-ready或stop condition时通知Architecture。

## External references

- [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere) — 效果清单与原型参考，
  不作为可直接复制的实现或资产源。
- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [three-geospatial](https://github.com/takram-design-engineering/three-geospatial)

## Handoff rule

本索引只保存当前稳定状态。Phase 结果、偏差、验证、upstream-owned files、SGP 与未解决风险必须回写当前 phase plan 和
review；原始聊天、绝对路径、临时 clone 与大型日志不得写入 AgentDocs。
