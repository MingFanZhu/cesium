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
  [ADR-0041](../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md),
  [ADR-0042](../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md),
  [ADR-0043](../../Documentation/SceneGIS/Decisions/ADR-0043-atmosphere-log-depth-and-radiance-mapping.md),
  [ADR-0044](../../Documentation/SceneGIS/Decisions/ADR-0044-separate-background-aerial-radiance-calibration.md)
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
- A2经过A2R、A2R2与A2R3修正后，implementation、Architecture review和第四次project-owner visual gate均已通过；本次A2
  独立本地checkpoint关闭该阶段。
- A3尚未激活；必须在A2 checkpoint后依据当前源码建立独立phase plan与planning checkpoint。

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

A2R3已用default `10`的`backgroundRadianceScale`与default `1`的`aerialRadianceScale`完整替换未checkpoint的single public
scale，两个pass只消费各自warm calibration。默认ground/day aerial full-frame/ground ROI mean分别为Globe `17.03/8.51`与Planar
`21.53/5.39`，均满足`0 < mean <= 32`，同时`max=122/327`保持nonidentity。Architecture已接受代码、像素和截图证据；其独立
review发现的`Test/高级环境.html:628` `prefer-template`交付问题已由Execution机械改为单个template literal，并已用
`--ignore-path .gitignore`对该HTML完成最终Prettier修正。精确HTML Prettier check、changed-scope ESLint与
`git diff --check`均通过；Architecture独立复核后无剩余blocker，project owner已明确判定第四次visual gate“通过”。本change set形成
A2独立本地checkpoint并关闭A2。该checkpoint不推送；A3仍未激活，下一步必须先建立A3 phase plan与独立planning checkpoint。

## External references

- [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere) — 效果清单与原型参考，
  不作为可直接复制的实现或资产源。
- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [three-geospatial](https://github.com/takram-design-engineering/three-geospatial)

## Handoff rule

本索引只保存当前稳定状态。Phase 结果、偏差、验证、upstream-owned files、SGP 与未解决风险必须回写当前 phase plan 和
review；原始聊天、绝对路径、临时 clone 与大型日志不得写入 AgentDocs。
