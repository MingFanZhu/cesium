# Discussion: Cesium Public API 与平面世界的兼容边界

## Metadata

- Status: `resolved`
- Owner role: `architecture`
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Related plan: [Planar API integration extension](../plans/2026-08-14-planar-api-integration-extension.md)
- Resulting ADR: I1 implementation前建立Camera view/flight ADR
- Related SGP: I1建立新的Camera integration SGP；`SGP-0001`/`SGP-0002`保持独立

## Question

已完成的真正平面 World、terrain、content、styling、environment 与 declarative Viewer，哪些 Cesium
公共 API 可以直接复用，哪些需要平面适配，哪些必须保持球面专用？应如何优先补齐 `Camera.flyTo` 等常用入口，
同时避免把 `Cartographic`/ellipsoid 语义伪装成平面？

## Current Cesium source facts

### 可直接复用或已资格确认

- 平面固定轴是 `+X East / +Y North / +Z Up`，位置为米制 `Cartesian3`，Scene保持 `SCENE3D`。
- `SceneTransforms.computeActualEllipsoidPosition` 在 `SCENE3D` 原样 clone world `Cartesian3`；因此
  `Scene.cartesianToCanvasCoordinates`、window/drawing-buffer transforms可保持纯Cartesian语义。
- `Camera.getPickRay`、view/inverse-view矩阵、move/look/rotate/zoom基本操作、四类Perspective/Orthographic frustum
  计算本身不要求椭球。现有 `_SceneGISPlanarCamera` 已覆盖四类frustum、world/local pose、fixed-axis
  heading/pitch/roll与ray数学。
- `Scene.pick`、`drillPick`、`pickPosition`和SceneGIS terrain/reference picking已有实际平面证据。
- SceneGIS八类Entity child visualizer均实现`getBoundingSphere`，`DataSourceDisplay.getBoundingSphere`可联合这些
  world-space bounds；Viewer selection与SelectionIndicator已经复用该流程。
- `Clock`、Animation、Timeline、Fullscreen、InfoBox title/description、post-process framebuffer能力和普通
  Cartesian Primitive不因世界形状自动失效。

### 当前会静默得到错误结果

- `Camera.setView`的SCENE3D分支通过`Transforms.eastNorthUpToFixedFrame(position, ellipsoid)`建立局部框架；
  heading/pitch/roll getters与direction/up转换使用同一椭球ENU。
- `Camera.flyTo`调用`CameraFlightPath.createTween`；其SCENE3D update把Camera与destination转为
  `Cartographic`，插值经纬高后再`Cartesian3.fromRadians`。平面destination即使类型为`Cartesian3`也会被当成ECEF。
- `Camera.lookAt`、`viewBoundingSphere`、`flyToBoundingSphere`同样围绕target构造ellipsoid ENU；`flyHome`
  使用`Camera.DEFAULT_VIEW_RECTANGLE`。
- `CameraFlightPath`只禁用legacy `screenSpaceCameraController.enableInputs`；Planar Viewer实际输入由
  `ControllerHost`中的`SceneGISPlanarCameraController`控制，flight期间仍可能响应手势。
- `CesiumWidget`的Entity/DataSource zoom/fly已能聚合SceneGIS bounds，但最终调用上述错误的Camera API；
  `Viewer.js`因此当前同步拒绝planar `zoomTo/flyTo`。
- `trackedEntity`最终创建`EntityView`。该类使用ellipsoid ENU、inertial/fixed transforms与轨道参考框架，不能通过
  解除Viewer guard获得平面语义。

### 必须保持 globe-specific

- `Cartographic`、`Rectangle`、`Ellipsoid`、Geographic/WebMercator projection与
  `Transforms.eastNorthUpToFixedFrame`的类型语义不改变。
- `Camera.positionCartographic`、`pickEllipsoid`、`computeViewRectangle`、`getRectangleCameraCoordinates`及
  `flyOverLongitude*`继续描述球面。平面调用必须明确不支持，不能返回伪造经纬高。
- `Scene.sampleHeight*`使用`Cartographic`；`clampToHeight*`沿ellipsoid normal做depth query。平面已有
  `world.getTerrainHeight`、`world.pickTerrain`与`SceneGISPlanarTerrainSampler`，不得在未设计union contract时重载原API。
- native Globe imagery/terrain、BaseLayerPicker、Geocoder、SceneMode/Projection picker、Earth navigation help继续不进入
  Planar Viewer。

## Compatibility matrix

| Area / API                                               | Current state                                              | Decision / target                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Cartesian3`、Ray、Plane、Matrix、BoundingSphere         | generic                                                    | 直接复用；增加代表性资格证据                                             |
| `Scene.pick/drillPick/pickPosition`                      | planar qualified                                           | 保持；不另建平行pick系统                                                 |
| `Scene.cartesianToCanvasCoordinates` / `SceneTransforms` | SCENE3D Cartesian path                                     | I4加入明确资格与文档                                                     |
| Camera move/look/rotate/zoom、frustum switch             | largely Cartesian                                          | 保持；I1做non-regression                                                 |
| Camera heading/pitch/roll、`setView`                     | ellipsoid ENU                                              | I1适配fixed planar axes                                                  |
| `lookAt` / `viewBoundingSphere`                          | ellipsoid ENU                                              | I1适配translation-only planar target frame                               |
| `flyTo` / `flyToBoundingSphere` / `flyHome`              | Cartographic/Rectangle flight                              | I1提供planar Cartesian flight与planar Home；globe-only options fail-fast |
| `Viewer/CesiumWidget.zoomTo/flyTo` Entity/DataSource     | bounds ready, Camera blocked                               | I2开放supported planar target profile                                    |
| InfoBox camera、double-click                             | disabled due tracking/flight                               | I2先启用zoom；I3再启用tracking状态                                       |
| `Viewer/CesiumWidget.trackedEntity`                      | EntityView ellipsoid frame                                 | I3建立SceneGIS-owned planar tracker，不修改EntityView地球算法            |
| Scene height/clamp APIs                                  | ellipsoid normal / Cartographic                            | I4明确guard；继续使用World/Sampler平面API                                |
| Fog / Shadows                                            | native implementation reads Cartographic/ellipsoid         | I4禁止静默启用；真正平面阴影单列后续扩展                                 |
| `Cartographic` / `Rectangle` / `pickEllipsoid`           | globe semantic                                             | 永久保持globe-specific并提供明确错误/文档                                |
| GeoJSON/CZML/KML                                         | geographic format loader                                   | 独立format/CRS extension                                                 |
| 3D Tiles / Tileset tracking                              | ECEF/SSE/Cartographic                                      | 独立3D Tiles extension                                                   |
| clustering                                               | native EntityCluster and screen-space policy not qualified | 独立content enhancement                                                  |
| split/cutout/day-night imagery、shadow/weather           | not camera integration                                     | 各自独立扩展                                                             |

## Constraints

- 不修改Cesium公共类型的本义，不让平面World伪装为Globe。
- 所有上游改动必须是SceneGIS-owned主体前的窄hook，并以独立SGP记录。
- Globe与`globe:false`行为必须保持；planar分支以`scene.world instanceof SceneGISPlanarWorld`或等价稳定contract判断。
- flight必须与ControllerHost输入权威协调，并保持`cancelFlight`/`completeFlight`、callbacks、requestRender和
  preload资源语义可解释。
- phases串行，每个阶段review/manual/checkpoint后才进入下一阶段。

## Options

### A. 仅解除 Viewer guard

改动最小，但会把平面Cartesian target送进ellipsoid ENU/Cartographic路径，产生更隐蔽的错误。拒绝。

### B. 把平面坐标伪装为 Cartographic/ECEF

会破坏已完成的米制Cartesian contract，并污染terrain/content/environment全部边界。拒绝。

### C. 先适配 Camera，再逐层开放 Viewer 与 tracking

Camera是公共行为的最底层依赖；fixed-axis helper可复用既有数学，Viewer bounds已经可用，tracking可独立避开EntityView。
采用。

## Recommendation

建立独立`planar-api-integration` extension，按Camera → Viewer framing → Entity tracking → globe-only safety →
unified delivery顺序推进。每阶段只开放已验证的target/option profile，不把“同名API存在”误写为所有Cesium输入均受支持。

## Outcome

Architecture确认采用Option C。I1先闭合Camera Cartesian view/flight；I2在其checkpoint后开放Entity/DataSource
`zoomTo/flyTo`；I3实现planar tracking；I4补通用Cartesian资格与globe-only guards；I5统一交付。

## Follow-up actions

- I1建立Camera fixed-axis/flight ADR与新的SGP，Execution不得在I1解除Viewer guard。
- I2进入前重新审计`CesiumWidget.updateZoomTarget`及InfoBox camera语义。
- I3进入前重新审计Entity time-varying position、`viewFrom`、orientation与ControllerHost priority。
- 3D Tiles、格式转换、阴影及其他独立候选留在兼容矩阵，不并入本扩展。
