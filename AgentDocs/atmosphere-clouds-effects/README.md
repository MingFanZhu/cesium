# atmosphere-clouds-effects

## Status

- Extension: `active`
- Current phase: `A1 render foundation and dual-world frame contract`
- Current phase plan:
  [2026-08-14-phase-a1-render-foundation.md](plans/2026-08-14-phase-a1-render-foundation.md)
- Extension plan:
  [2026-08-14-atmosphere-clouds-effects-extension.md](plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Architecture decision:
  [ADR-0040](../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md)
- Upstream patch: proposed `SGP-0008`
- Branch: `feature/atmosphere-clouds-effects`

## Objective

为 Cesium Globe 与 `SceneGISPlanarWorld` 建立同等级的现代环境渲染能力：physically based atmosphere、aerial
perspective、exponential height fog、volumetric clouds、cloud shadows、crepuscular rays（god rays）以及
HDR bloom/lens flare。两种世界共享光学参数、质量档、资源与合成框架，但分别使用 ellipsoid-radial 与 fixed-axis planar
reference frame，不互相伪造坐标语义。

## Active work

- A1 只实现双阶段 render integration、private pipeline lifecycle 与 globe/planar reference-frame contract。
- A1 不增加可见效果、public API、LUT/noise asset 或 temporal accumulation。
- Execution Agent 必须从 Architecture assignment 指定的 exact base 开始；未通过 review 前不得 commit、push 或进入 A2。

## Discussions

- [双世界环境渲染架构与参考项目取舍](discussions/2026-08-14-dual-world-render-architecture.md) — `resolved`

## Reviews

- 当前无 implementation review；A1 实现完成后新建
  `reviews/2026-08-14-a1-render-foundation.md`。

## External references

- [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere) — 效果清单与原型参考，
  不作为可直接复制的实现或资产源。
- [Eric Bruneton: Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [three-geospatial](https://github.com/takram-design-engineering/three-geospatial)

## Handoff rule

本索引只保存当前稳定状态。Phase 结果、偏差、验证、upstream-owned files、SGP 与未解决风险必须回写当前 phase plan 和
review；原始聊天、绝对路径、临时 clone 与大型日志不得写入 AgentDocs。
