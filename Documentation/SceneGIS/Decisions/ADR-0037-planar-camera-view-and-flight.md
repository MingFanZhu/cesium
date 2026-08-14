# ADR-0037：平面 Camera 视图与飞行

## 状态

- Status：`approved`
- Date：`2026-08-14`
- Decision owners：Architecture Agent
- Related plan：`AgentDocs/planar-api-integration/plans/2026-08-14-phase-i1-planar-camera-view-flight.md`
- Related patch：`SGP-0004`

## 上下文

Cesium `Camera` 的 SCENE3D `heading`、`pitch`、`roll`、`setView`、`lookAt`、bounding-sphere view 与
`CameraFlightPath` 默认依赖ellipsoid ENU、Cartographic interpolation和Earth rectangle。把planar Cartesian坐标伪装成
Cartographic会破坏固定轴、large-finite坐标、非identity transform以及四种frustum语义。Planar Viewer同时关闭legacy
`ScreenSpaceCameraController` inputs并由`ControllerHost`注册`SceneGISPlanarCameraController`，因此flight还必须显式协调
这条输入authority，而不能重新启用legacy controller。

## 决策

当`camera._scene.world`是live primary `SceneGISPlanarWorld`且Scene处于`SCENE3D`时，public `Camera`通过paired
`SGP-0004`分派到SceneGIS-owned private helpers。检测只依据live World identity，不从ellipsoid、CRS、extent或坐标数值
推断。Globe与`globe:false`继续执行原Cesium路径。

Planar HPR固定采用world `+X East/+Y North/+Z Up`：heading从`+Y`顺时针朝`+X`，pitch从XY平面，roll绕view
direction。`setView`、`lookAt`和bounding-sphere framing接受finite Cartesian与finite orientation，支持nonidentity Camera
transform及Perspective/PerspectiveOffCenter/Orthographic/OrthographicOffCenter；Rectangle同步拒绝，不能生成假的
Cartographic。Off-center framing以实际frustum中心ray/center shift为目标，near/far必须完整包含sphere。

Planar flight在SceneGIS helper中直接插值Cartesian XY、有限Z-height curve与fixed-axis HPR，复用Scene的
`TweenCollection`、duration/easing、complete/cancel、replacement、`cancelFlight`/`completeFlight`、requestRender和preload
culling-volume协议。`flyOverLongitude`与`flyOverLongitudeWeight`同步拒绝。Zero-duration直接原子发布final pose；candidate、
tween-add或validation失败不得取消既有flight、改变Camera transform或遗留input suspension。

若同一`ControllerHost`注册了唯一匹配World的`SceneGISPlanarCameraController`，flight使用soft-private token计数暂停其
input与surface-clearance update，并在complete/cancel/replacement/error时exactly once恢复；caller原有`enabled`值不改变。
没有该controller的低层planar Scene仍可flight。Flight结束后的下一次controller frame才恢复surface clearance，避免controller
与tween争夺Camera。热更新复用scratch Cartesian/pose，不为每个tween update分配对象，也不改变Surface、terrain、imagery或
Environment资源identity。

本决定只覆盖public `Camera` view/flight方法。`Viewer.zoomTo`、`Viewer.flyTo`、Entity tracking与InfoBox camera仍保持
既有限制，留给后续独立阶段。

## 上游缝隙与升级

唯一upstream修改是`packages/engine/Source/Scene/Camera.js`中的paired `SGP-0004` import/dispatch/JSDoc hunk。
`CameraFlightPath.js`不修改。升级Cesium时必须复核Camera method入口、`_currentFlight`、`TweenCollection` callback顺序、
`preloadFlightCullingVolume`和四类frustum字段；若upstream提供Cartesian/fixed-frame pluggable flight，应移除SGP-0004并让
SceneGIS helper只保留planar validation/controller suspension。不得用prototype patch、全局registry或Earth
Cartographic conversion替代显式dispatch。

## 验证

Focused private/controller/Widget Specs覆盖large-finite HPR round-trip、nadir/roll、nonidentity transform、四类frustum、
Rectangle/fly-over拒绝、zero/default/custom flight、replace/cancel/complete、candidate failure atomicity、input suspension、
preload与next-frame clearance。Real Context覆盖Perspective与Orthographic actual tween frames，以及terrain mesh、Surface
command/shader/VA、imagery binding/texture和Environment light warm identity；representative Globe Camera regression确认原路径
不变。

I5 unified dev/release E2E与installed engine/root package验证已闭合public Camera view/flight联合路径、
`_SceneGISPlanarCamera`/`_SceneGISPlanarCameraFlight` archive与soft-private delivery、无underscore public hiding；
对应paired `SGP-0004`已转为`active`。
