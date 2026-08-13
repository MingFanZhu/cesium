# SceneGIS Planar Environment

## Metadata

| Field                  | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| Extension slug         | `planar-environment`                                             |
| Status                 | `active`                                                         |
| Planning model         | `extension`                                                      |
| Active extension plan  | [总体计划](plans/2026-08-13-planar-environment-extension.md)     |
| Current phase          | E4 Planar Atmosphere and SkyBox                                  |
| Active phase plan      | [E4 plan](plans/2026-08-13-phase-e4-planar-atmosphere-skybox.md) |
| Active standalone plan | None                                                             |
| Architecture contact   | Architecture Agent                                               |
| Execution contact      | Execution Agent                                                  |
| Last updated           | `2026-08-13`                                                     |

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
- Checkpoints: E1=`b343b64bad`；direct Test migration=`a8c22d8c35`；E2=`fa40b49dbb4ba6f14db68c5fe94852b9f47367ff`；
  E3=`8ff8b48ebf`
- ADR: E1=`ADR-0033`；E2=`ADR-0034`；E3=`ADR-0035`；E4 expected `ADR-0036`
- SGP: E1/E2/E4=None；E3=`SGP-0003`（仅`Scene.js` optional world environment hook；E4只读依赖该hook）

## Current handoff

- Current state: E3 checkpoint=`8ff8b48ebf`。Architecture已重新审计native atmosphere/SkyBox/CubeMapPanorama、Scene
  environment order/destroy、four-frustum与resident terrain；E4 confirmed plan已冻结独立planar atmosphere、caller-owned
  fixed-axis SkyBox、native conflict、underground mask和one-pass budget。
- Next action: 创建E4 planning checkpoint后向Execution发送正式assignment；实现完成后由Architecture只review代码/契约，
  项目负责人把关视觉表现。
- Current phase status: E1-E3=`completed`；E4=`active`；E5=`planned`。
- Open discussions: None。
- Latest review: [E3 approved review](reviews/2026-08-13-e3-visible-celestial-bodies.md)；E4 review待implementation时新建。
- Unresolved reviews: None。
- Known risks: `scene.light` 是 scene-wide 可变状态；Controller 必须明确独占、恢复与外部覆盖语义；
  future atmosphere 不得误用 Earth ellipsoid automatic uniforms。
- Manual gate: 项目负责人已在`2026-08-13`验收E1中文Environment控制、真实公开terrain光照和平面相机交互，E2
  manual/天文模式、project-origin、UTC时间与有效Sun/Moon方向，以及E3 visible Sun/Moon、native Clock、horizon/
  underground与foreground表现，并明确允许进入E4。Architecture负责代码和契约质量；用户可见tool panel说明使用中文。
