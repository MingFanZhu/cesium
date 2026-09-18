# SceneGIS Planar API Integration

## Metadata

| Field                  | Value                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| Extension slug         | `planar-api-integration`                                                         |
| Status                 | `active`                                                                         |
| Planning model         | `extension`                                                                      |
| Active extension plan  | None；[总体计划](plans/2026-08-14-planar-api-integration-extension.md) completed |
| Current phase          | None                                                                             |
| Active phase plan      | None                                                                             |
| Active standalone plan | [Entity 通用属性修复](plans/2026-09-18-entity-api-fixes.md)                      |
| Architecture contact   | Architecture Agent                                                               |
| Execution contact      | Execution Agent                                                                  |
| Last updated           | `2026-09-18`                                                                     |

## Scope

### In scope

- 让 Cesium `Camera` 的 Cartesian view、flight、look-at 与 bounding-sphere framing 在
  `SceneGISPlanarWorld` 中使用固定 `+X East / +Y North / +Z Up` 语义。
- 让 `Viewer.zoomTo/flyTo`、InfoBox camera 和 `trackedEntity` 在明确的平面 Entity/DataSource profile
  内复用 Cesium 公共 API。
- 资格确认通用 Cartesian picking/screen transforms，并对仍依赖 `Cartographic`、`Rectangle`、`Ellipsoid`
  的球面 API 提供清晰边界，避免静默错误。
- 保持 Globe、`globe:false`、live World 与声明式 `planarWorld` 行为兼容，并让上游改动保持窄 SGP hook。

### Out of scope

- 3D Tiles/ECEF、GeoJSON/CZML/KML 自动 CRS 转换、runtime reprojection 和 clustering。
- 把 `Cartographic`、`Rectangle`、`Ellipsoid` 或 `Transforms.eastNorthUpToFixedFrame` 重新解释为平面类型。
- 平面阴影、天气、split/cutout、ordered ground layers、arbitrary ground Material 或 runtime Globe/planar 切换。
- 在没有独立阶段源码审计时改变 `Scene.sampleHeight`/`clampToHeight` 的类型或语义。

## Engineering links

- Expected engine source: `packages/engine/Source/SceneGIS/Scene/**`，以及必要的
  `packages/engine/Source/Scene/Camera.js`、`CameraFlightPath.js`、`Widget/CesiumWidget.js` 窄 hook
- Expected widgets source: `packages/widgets/Source/Viewer/Viewer.js` 与 `packages/widgets/Source/SceneGIS/**`
- Expected tests: `packages/engine/Specs/SceneGIS/**`、`packages/widgets/Specs/SceneGIS/**`
- Direct example: `Test/平面API集成.html`
- Branch: `feature/planar-api-integration`
- Base checkpoint: `b6377c5e6e865c8c04041359f99d952c15be17e3`
- Dependencies: completed `planar-content`、`planar-terrain-advanced`、`planar-environment`、V1
  `planar-viewer-bootstrap`
- ADR: I1 expected new camera-frame/flight ADR；later phases decide after source audit
- SGP: I1 proposed new SGP for Camera integration；existing `SGP-0001`/`SGP-0002` remain independent

## Current handoff

2026-09-18：[Camera 兼容性复核](plans/2026-09-18-camera-compatibility.md)的实现、
[技术自审](reviews/2026-09-18-camera-compatibility.md)与负责人验收通过；原 I1–I5 仍 completed。
沿用 ADR-0037 / SGP-0004，唯一 upstream-owned file 为 Camera.js。
329 项相关 Specs（含 Globe 回归与 real Context）通过；完整构建和类型检查已通过。负责人复测发现的 Home 末段
CA-R007 已在 private Camera / flight helper 修复并通过浏览器自然飞行复测。源码位置为既有 private Camera helper，
测试为 SceneGISPlanarCameraApiSpec / SceneGISPlanarCameraCesiumWidgetSpec，验收入口为 Test/Planar/相机控制.html。
负责人随后要求审计 Entity 是否遵循非必要不修改 API 原则。
[Entity API 审计](reviews/2026-09-18-entity-api-compatibility.md)已完成：原生数据模型未改，
但存在额外 gate 限制、Graphics 覆盖差异、Entity matrix 与渲染朝向不一致及 Rectangle 单位冲突。
负责人随后授权修复部分问题，并接受保留 Rectangle 米制字段解释。
[Entity 通用属性修复](plans/2026-09-18-entity-api-fixes.md)已实现 EA-R001 与 EA-R003 距离显隐，
[技术自审](reviews/2026-09-18-entity-api-fixes.md)通过；EA-R005 accepted。EA-R002 / EA-R004 与材质限制保留。
扩展回归有 118 项通过、2 项已在修复前对照复现的既有失败，由当前 Agent 负责后续 fixture 修复，详见技术自审。
本轮没有新增 upstream-owned 修改；保留旧阶段记录如下。

2026-09-18 负责人要求整理平面与高级环境两个已交付大阶段的示例。当前在 `feature/functional-examples`
已完成[示例整理](plans/2026-09-18-functional-examples.md)，八项页面 E2E 与[技术自审](reviews/2026-09-18-functional-examples.md)通过。
产品 I1–I5 保持 completed；当前 Agent 负责架构、执行和自审，本地 checkpoint 后继续高级环境示例。

- Current state: I1 checkpoint=`ff7c1916d6604400465414305f3f647ef9347d5c`；I2最终checkpoint=`e755ad95a2`
  （not pushed）；阶段外Test示例拆分checkpoint=`74b41bb999`。I3 Architecture/code review与项目负责人manual gate已通过，
  I3-R001-I3-R005全部closed；最终I3 checkpoint=`dfc8be40a92503b01b8ae9938a0e2ae581e3a878`
  （`实现平面实体跟踪`，not pushed）。I4 Architecture review/manual gate已通过，最终checkpoint/base=`0c95a54024`
  （`实现平面 Scene API 安全边界`，not pushed）。Architecture已确认
  [I5 phase plan](plans/2026-08-14-phase-i5-unified-qualification-delivery.md)。
- Next action: Extension已完成，等待未来Architecture audit或新extension assignment；当前无active phase，不得自行开始后续工作。
- Current phase status: I1=`completed`；I2=`completed`；I3=`completed`；I4=`completed`；I5=`completed`（Architecture checkpoint=`2eaa13ad29`，`完成平面 API 融合统一交付`，not pushed）。
- Open discussion:
  [Cesium public API planar compatibility](discussions/2026-08-14-cesium-public-api-planar-compatibility.md)
  （resolved；作为路线依据）。
- Approved reviews:
  [I1 Planar Camera View and Flight](reviews/2026-08-14-i1-planar-camera-view-flight.md)（approved；manual gate passed；
  I1 checkpoint已创建）。
- Approved review:
  [I2 Planar Entity/DataSource Framing](reviews/2026-08-14-i2-planar-entity-datasource-framing.md)（approved；
  I2-R001/R002 closed；manual gate passed；最终checkpoint=`e755ad95a2`，not pushed）。
- Approved review:
  [I3 Planar Entity Tracking](reviews/2026-08-14-i3-planar-entity-tracking.md)（approved；I3-R001-R005 closed；
  manual gate passed；checkpoint=`63cf8bbe44`，not pushed）。
- Completed phase: [I4 Planar Scene API Qualification and Safety](plans/2026-08-14-phase-i4-planar-scene-api-safety.md)
  （screen/pick资格、height/clamp与globe-only Camera guard、native Fog/Shadow/Earth environment安全边界）。
- Approved review: [I4 Planar Scene API Qualification and Safety](reviews/2026-08-14-i4-planar-scene-api-safety.md)
  （approved；I4-R001 closed；owner manual gate passed；checkpoint=`22bd7e1c29`，not pushed；I4 completed）。
- Approved final review: [I5 Unified Qualification and Delivery](reviews/2026-08-14-i5-unified-qualification-delivery.md)
  （dev/release同一named E2E各`1 passed`；I5-R001错误的HomeButton flight部分withdrawn，I5-R002-R006 closed；checkpoint=`2eaa13ad29`，not pushed）。
- Known risks: `Camera.js`/`CameraFlightPath.js`是高频upstream算法；flight期间legacy
  `screenSpaceCameraController.enableInputs`不能代表planar ControllerHost输入权威；当前以soft-private suspension token隔离。
  `Camera.js`仍是高频upgrade seam；I3新增的private tracker必须与I1 flight token和I2 framing transaction保持互斥。
  `Camera.positionCartographic`和`Scene.ellipsoid`仍被Cesium通用内部状态读取，I4只能把应用语义标为internal-only并阻止
  Fog/Shadow/Globe-specific consumer静默启用，不能用大范围内部patch换取getter throw。
