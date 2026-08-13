# SceneGIS Planar Environment

## Metadata

| Field                  | Value                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| Extension slug         | `planar-environment`                                                          |
| Status                 | `active`                                                                      |
| Planning model         | `extension`                                                                   |
| Active extension plan  | [总体计划](plans/2026-08-13-planar-environment-extension.md)                  |
| Current phase          | E1 Manual Celestial Direction and Lighting Contract                           |
| Active phase plan      | [E1 phase plan](plans/2026-08-13-phase-e1-manual-celestial-light-contract.md) |
| Active standalone plan | None                                                                          |
| Architecture contact   | Architecture Agent                                                            |
| Execution contact      | Execution Agent                                                               |
| Last updated           | `2026-08-13`                                                                  |

## Scope

### In scope

- 为真正平面的 SceneGIS world 建立显式、固定轴、无隐式 CRS 推断的环境契约。
- 支持应用提供太阳/月亮局部方向，并以稳定 `DirectionalLight` 驱动现有 terrain lighting。
- 后续阶段在明确参考位置和时间时增加天文方向、可见日月、平面大气与 SkyBox/地下行为。
- 保持调用方对 Controller、SkyBox 和外部资源的显式所有权，并保留 Cesium 公共 scene/widget 生命周期。

### Out of scope

- 不从 opaque `crs` 字符串、planar extent 或 terrain provider 猜测经纬度和天文位置。
- 不把 planar world 伪装为 `Globe`，不复用 Earth-only `Sun`、`Moon`、`SkyAtmosphere` 位置或椭球语义。
- 不在 E1 实现天文历算、可见日月、大气、SkyBox 预设、阴影或 imagery `dayAlpha/nightAlpha`。
- 不隐式开启 `world.enableLighting`，不自动替换调用方未显式注册的 `scene.light`。

## Engineering links

- Source paths: `packages/engine/Source/SceneGIS/Scene/**`、后续按阶段决定的
  `packages/engine/Source/Shaders/SceneGIS/**`
- Test paths: `packages/engine/Specs/SceneGIS/Scene/**`、
  `packages/engine/Specs/SceneGIS/Widget/**`
- Sandcastle: E1 新增 `packages/sandcastle/gallery/scenegis-planar-environment/**`
- Branch: `feature/planar-environment`
- Predecessor checkpoint: `f4f4bd6e9f946fb6945bdce795183b14afdbd7cf`
- Parent extensions: completed `planar-world`、`planar-terrain-advanced`、
  `planar-surface-styling`
- ADR: E1 expected `ADR-0033`
- SGP: E1 expected None；任何 upstream-owned diff 必须先更新 phase plan 并登记合法 SGP

## Current handoff

- Current state: Architecture 已完成总体计划与 E1 源码事实研究；E1 contract 已 confirmed，等待正式
  Execution assignment 后实现。
- Next action: Execution 仅实现 E1 manual celestial direction/light contract，不进入天文、可见日月或大气。
- Current phase status: E1=`active`；E2-E5=`planned`，仅保留稳定目标，不提前冻结实现。
- Open discussions: None。
- Latest review: None；E1 implementation review 尚未建立。
- Unresolved reviews: None。
- Known risks: `scene.light` 是 scene-wide 可变状态；Controller 必须明确独占、恢复与外部覆盖语义；
  future atmosphere 不得误用 Earth ellipsoid automatic uniforms。
- Manual gate: Architecture 负责代码和证据 review；明显视觉表现由项目负责人把关。所有 Sandcastle tool panel
  用户可见说明使用中文。
