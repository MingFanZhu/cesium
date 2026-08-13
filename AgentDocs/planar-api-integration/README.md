# SceneGIS Planar API Integration

## Metadata

| Field                  | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| Extension slug         | `planar-api-integration`                                         |
| Status                 | `active`                                                         |
| Planning model         | `extension`                                                      |
| Active extension plan  | [总体计划](plans/2026-08-14-planar-api-integration-extension.md) |
| Current phase          | I1 Planar Camera View and Flight                                 |
| Active phase plan      | [I1](plans/2026-08-14-phase-i1-planar-camera-view-flight.md)     |
| Active standalone plan | None                                                             |
| Architecture contact   | Architecture Agent                                               |
| Execution contact      | Execution Agent task `019ff3d8-d1f4-7fd1-aecb-8cf0aa638d4f`      |
| Last updated           | `2026-08-14`                                                     |

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
- Direct example: `Test/平面环境.html`
- Branch: `feature/planar-api-integration`
- Base checkpoint: `b6377c5e6e865c8c04041359f99d952c15be17e3`
- Dependencies: completed `planar-content`、`planar-terrain-advanced`、`planar-environment`、V1
  `planar-viewer-bootstrap`
- ADR: I1 expected new camera-frame/flight ADR；later phases decide after source audit
- SGP: I1 proposed new SGP for Camera integration；existing `SGP-0001`/`SGP-0002` remain independent

## Current handoff

- Current state: I1 fixed-axis public Camera view/flight、SGP-0004、ADR-0037、focused/real-Context/Globe与
  build/types/docs/package证据已完成；I1-R001-I1-R003 closed，Architecture review approved，owner manual gate passed，
  Architecture已创建I1独立本地checkpoint（`实现平面相机视图与飞行接口`，not pushed；稳定hash由后续phase作为parent记录）。
- Next action: 等待Architecture基于I1 checkpoint审计并建立I2 confirmed phase plan/assignment；此前不修改、不commit/push、
  不进入I2。
- Current phase status: I1=`completed`；I2-I5=`proposed`。
- Open discussion:
  [Cesium public API planar compatibility](discussions/2026-08-14-cesium-public-api-planar-compatibility.md)
  （resolved；作为路线依据）。
- Approved reviews:
  [I1 Planar Camera View and Flight](reviews/2026-08-14-i1-planar-camera-view-flight.md)（approved；manual gate passed；
  I1 checkpoint已创建）。
- Known risks: `Camera.js`/`CameraFlightPath.js`是高频upstream算法；flight期间legacy
  `screenSpaceCameraController.enableInputs`不能代表planar ControllerHost输入权威；当前以soft-private suspension token隔离。
  `Camera.js`仍是高频upgrade seam；direct Test manual gate已通过。
