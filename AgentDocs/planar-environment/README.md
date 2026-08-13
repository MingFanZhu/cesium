# SceneGIS Planar Environment

## Metadata

| Field                  | Value                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| Extension slug         | `planar-environment`                                                |
| Status                 | `active`                                                            |
| Planning model         | `extension`                                                         |
| Active extension plan  | [总体计划](plans/2026-08-13-planar-environment-extension.md)        |
| Current phase          | E3 Visible Celestial Bodies planning                                |
| Active phase plan      | None; Architecture is refreshing source facts after E2              |
| Active standalone plan | None                                                                |
| Architecture contact   | Architecture Agent                                                  |
| Execution contact      | Execution Agent                                                     |
| Last updated           | `2026-08-13`                                                        |

## Scope

### In scope

- 为真正平面的 SceneGIS world 建立显式、固定轴、无隐式 CRS 推断的环境契约。
- 支持应用提供太阳/月亮局部方向，并以稳定 `DirectionalLight` 驱动现有 terrain lighting。
- 后续阶段在应用明确提供 planar project origin 对应的 WGS84 经纬度和时间时增加天文方向、可见日月、平面大气与 SkyBox/地下行为。
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
- Direct development example: `Test/平面环境.html`
- Legacy Sandcastle: E1 `packages/sandcastle/gallery/scenegis-planar-environment/**`，E2不再扩展
- Branch: `feature/planar-environment`
- Predecessor checkpoint: `f4f4bd6e9f946fb6945bdce795183b14afdbd7cf`
- Parent extensions: completed `planar-world`、`planar-terrain-advanced`、
  `planar-surface-styling`
- Checkpoints: E1=`b343b64bad`；direct Test migration=`a8c22d8c35`
- ADR: E1=`ADR-0033`；E2=`ADR-0034`
- SGP: E2=None；任何 upstream-owned diff 必须先停止并升级phase plan

## Current handoff

- Current state: E2 implementation、Architecture review与项目负责人manual gate均已通过；本次E2 checkpoint提交不push。
- Next action: Architecture以E2 checkpoint为新base重新审计visible-body render pass、depth/horizon、resource与Clock事实，
  建立并确认E3 phase plan后再向Execution发送正式assignment。
- Current phase status: E1-E2=`completed`；E3=`planning`；E4-E5=`planned`，不提前冻结易变实现。
- Open discussions: None。
- Latest review: [E2 approved review](reviews/2026-08-13-e2-astronomical-direction-mode.md)。
- Unresolved reviews: None。
- Known risks: `scene.light` 是 scene-wide 可变状态；Controller 必须明确独占、恢复与外部覆盖语义；
  future atmosphere 不得误用 Earth ellipsoid automatic uniforms。
- Manual gate: 项目负责人已在`2026-08-13`验收E1中文Environment控制、真实公开terrain光照和平面相机交互，以及E2
  manual/天文模式、project-origin、UTC时间与有效Sun/Moon方向表现，并明确允许进入E3。Architecture负责代码和契约质量；
  用户可见tool panel说明使用中文。
