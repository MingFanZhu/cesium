# SceneGIS Planar API Integration

## Metadata

| Field                  | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| Extension slug         | `planar-api-integration`                                          |
| Status                 | `active`                                                          |
| Planning model         | `extension`                                                       |
| Active extension plan  | [总体计划](plans/2026-08-14-planar-api-integration-extension.md)  |
| Current phase          | I5 Unified Qualification and Delivery                             |
| Active phase plan      | [I5](plans/2026-08-14-phase-i5-unified-qualification-delivery.md) |
| Active standalone plan | None                                                              |
| Architecture contact   | Architecture Agent                                                |
| Execution contact      | Execution Agent task `019ff3d8-d1f4-7fd1-aecb-8cf0aa638d4f`       |
| Last updated           | `2026-08-14`                                                      |

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

- Current state: I1 checkpoint=`ff7c1916d6604400465414305f3f647ef9347d5c`；I2最终checkpoint=`e755ad95a2`
  （not pushed）；阶段外Test示例拆分checkpoint=`74b41bb999`。I3 Architecture/code review与项目负责人manual gate已通过，
  I3-R001-I3-R005全部closed；最终I3 checkpoint=`dfc8be40a92503b01b8ae9938a0e2ae581e3a878`
  （`实现平面实体跟踪`，not pushed）。I4 Architecture review/manual gate已通过，最终checkpoint/base=`0c95a54024`
  （`实现平面 Scene API 安全边界`，not pushed）。Architecture已确认
  [I5 phase plan](plans/2026-08-14-phase-i5-unified-qualification-delivery.md)。
- Next action: Extension已完成，等待未来Architecture audit或新extension assignment；当前无active phase，不得自行开始后续工作。
- Current phase status: I1=`completed`；I2=`completed`；I3=`completed`；I4=`completed`；I5=`completed`（Architecture checkpoint=`a81bbecebd`，`完成平面 API 融合统一交付`，not pushed）。
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
  （dev/release同一named E2E各`1 passed`；I5-R001错误的HomeButton flight部分withdrawn，I5-R002-R006 closed；checkpoint=`a81bbecebd`，not pushed）。
- Known risks: `Camera.js`/`CameraFlightPath.js`是高频upstream算法；flight期间legacy
  `screenSpaceCameraController.enableInputs`不能代表planar ControllerHost输入权威；当前以soft-private suspension token隔离。
  `Camera.js`仍是高频upgrade seam；I3新增的private tracker必须与I1 flight token和I2 framing transaction保持互斥。
  `Camera.positionCartographic`和`Scene.ellipsoid`仍被Cesium通用内部状态读取，I4只能把应用语义标为internal-only并阻止
  Fog/Shadow/Globe-specific consumer静默启用，不能用大范围内部patch换取getter throw。
