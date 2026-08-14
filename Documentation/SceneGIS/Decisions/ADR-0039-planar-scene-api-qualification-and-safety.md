# ADR-0039：平面 Scene API 资格与安全边界

## 状态

- Status：`proposed`
- Date：`2026-08-14`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-api-integration/plans/2026-08-14-phase-i4-planar-scene-api-safety.md`
- Related patches：`SGP-0001`、`SGP-0002`、`SGP-0004`、`SGP-0007`
- Consumes： [ADR-0037](ADR-0037-planar-camera-view-and-flight.md)

## 上下文

Cesium 的 SCENE3D Cartesian screen transform、depth pick 和普通 ray pick 主要消费 Camera、view/projection matrix 与 depth buffer，
可以在平面世界中保持原实现。相反，`Scene.sampleHeight*`、`clampToHeight*`、Camera Rectangle/Ellipsoid 方法、native Fog、
ShadowMap、SkyAtmosphere、SkyBox、Sun 和 Moon 都包含 Ellipsoid、Cartographic、Earth environment 或 Globe 语义。仅凭这些入口在
平面 Scene 中返回有限数值，不能把它们认定为正确。

`Camera.positionCartographic` 和 `Scene.ellipsoid` 同时被 Cesium 通用内部 render state 消费。让它们在平面 Scene 中抛错会破坏
既有内部 invariant，因此它们保留为 Cesium internal ellipsoid substrate，但不得解释为项目 CRS 或 planar position。

## 决策

### 能力矩阵

- **Supported**：`Camera.getPickRay`、`Scene.cartesianToCanvasCoordinates`、`SceneTransforms` 的 SCENE3D window/drawing-buffer
  transforms、`Scene.pick`、`drillPick`、`pickPosition`、World terrain query，以及普通 private ray pick。它们继续使用上游实现，
  不增加 parallel facade。
- **Guarded globe-only**：`Scene.sampleHeight`、`sampleHeightMostDetailed`、`clampToHeight`、
  `clampToHeightMostDetailed`、`Camera.getRectangleCameraCoordinates`、`pickEllipsoid`、`computeViewRectangle`，以及 native Earth
  environment/Fog/Shadow。
- **Internal-only**：planar Scene 的 `Camera.positionCartographic` 与 `Scene.ellipsoid`。应用使用 `Camera.positionWC`/`position`
  和 World/CoordinateSystem API。
- **Deferred**：`pickFromRayMostDetailed`/`drillPickFromRayMostDetailed` 的 Cesium3DTileset LOD、planar Fog/Shadow、format/CRS
  conversion 与新的 3D Tiles 能力。

判定只依据 Scene 当前 live non-Globe primary World：`scene.world` defined、`scene.globe` undefined、World 未销毁。不得从 CRS、
ellipsoid identity、坐标值、DOM 或 provider 推断。

### Height 与 Camera fail-fast

non-Globe Scene 的 `sampleHeightSupported` 和 `clampToHeightSupported` 固定为 `false`。四个 height/clamp 方法必须在进入
`Picking`、创建 Promise/operation 或修改 input array/result 前同步抛 `DeveloperError`，并提示调用方改用
`world.getTerrainHeight`、`world.pickTerrain` 或 `SceneGISPlanarTerrainSampler`。不改变 Cartographic/Rectangle/Ellipsoid
类型本义，也不创建 Cartesian overload。

Camera 的三个 Rectangle/Ellipsoid 方法通过 ADR-0037 的 `SceneGISPlanarCamera` private helper 和 `SGP-0004` 在 result、Camera、
request-render mutation 前失败。Globe、`globe:false` 与没有 primary World 的 Camera 保留上游行为。

### 构造与 frame 边界

Direct `CesiumWidget({world})` 与 live/declarative planar Viewer 在 child DOM、Context、World、controller 和 provider mutation 前
执行同一 profile：只允许 SCENE3D、`scene3DOnly` true、disabled shadows/native sky；拒绝 defined ellipsoid/map projection/2D
options。non-Globe Scene 实际固定 `scene3DOnly=true`。`world:false` 和 `globe:false` 不进入该 profile。

`Scene._initializeWorld` 的 `SGP-0001` construction seam 在安装 non-Globe World 后把 WGS84 默认 Fog 关闭。`Scene.updateFrameState`
最前端的 `SGP-0007` 再拒绝 visible native skyBox/skyAtmosphere/Sun/Moon、enabled Fog 或 ShadowMap。defined 但 `show=false` 的
native objects与disabled Fog/Shadow允许保留，SceneGIS不接管或销毁其额外 ownership。该 guard位于 frame-state、World render、
native update/command/resource publication 前；caller修正状态后下一frame可恢复，warm planar resources保持identity。

## 上游补丁与所有权

- `SGP-0007`只登记`packages/engine/Source/Scene/Scene.js`的height capability/API和frame-boundary safety。
- `CesiumWidget.js` construction preflight与World prepare继续属于`SGP-0001`。
- `Viewer.js` planar preflight继续属于`SGP-0002`。
- `Camera.js` globe-only方法guard继续属于`SGP-0004`。

SceneGIS private helper、Specs、文档与Test示例保持SceneGIS-owned。不得通过修改`Picking`、`Fog`、`ShadowMap`、
`SceneTransforms`或prototype patch实现本决定。

## 验证与升级

Focused Specs必须覆盖构造failure atomicity、height input/result/Promise atomicity、preRender同frame native conflict、恢复后的warm
identity、Camera result/view atomicity，以及Perspective/Orthographic和high-DPI Cartesian screen/depth/terrain/ray证据。Globe、
`globe:false`和I1-I3代表路径必须保持。

升级Cesium时复核Scene constructor Fog/Shadow初始化、`updateFrameState`在`preRender`之后的位置、height API delegation、Camera三个
globe-only入口、Widget/Viewer option forwarding和SceneTransforms SCENE3D分支。若上游提供primary-world-aware capabilities与
native-effect policy，可退役`SGP-0007`；其他SGP按各自独立removal condition处理。
