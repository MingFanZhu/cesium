# ADR-0038：平面 Entity 跟踪

## 状态

- Status：`proposed`
- Date：`2026-08-14`
- Decision owners：Architecture Agent
- Related plan：
  `AgentDocs/planar-api-integration/plans/2026-08-14-phase-i3-planar-entity-tracking.md`
- Related patches：`SGP-0006`
- Depends on：[ADR-0037](ADR-0037-planar-camera-view-and-flight.md)

## 上下文

Cesium 1.144 的 `CesiumWidget.trackedEntity` 通过 `EntityView` 更新 Camera。该路径会消费
ellipsoid ENU、inertial transform、velocity 与 Earth reference-frame 语义，不能用于
`SceneGISPlanarWorld` 的固定轴。I1 已让 public `Camera` 支持 planar Cartesian view/flight，
I2 已提供 operation-isolated Entity/DataSource framing；I3 需要在两者之间建立独立的 tracking
Camera authority，而不修改 `EntityView`、`ControllerHost`、Entity 或 PositionProperty。

## 决策

当 primary World 是 live `SceneGISPlanarWorld` 且 Scene 为 `SCENE3D` 时，public
`CesiumWidget/Viewer.trackedEntity` 分派到 SceneGIS-owned private tracker。defined target
必须是真实 `Entity`，具有 `ReferenceFrame.FIXED` position；`trackingReferenceFrame` 仅接受
`AUTODETECT` 或 `ENU`，两者都解释为 translation-only fixed `+X East / +Y North / +Z Up`。
Tracker 不读取 Entity orientation，也不提供 body、velocity 或 inertial frame。

Tracker 作为 lazy、one-per-widget `ControllerHost` controller 注册，并在
`DataSourceDisplay.update(time)` 之后消费同一显式 `JulianDate`。当前 position undefined 时保留
最后 Camera pose；defined sample 必须是 finite `Cartesian3`。`viewFrom` 只在首次取得 authority
时采样并解释为 fixed-axis offset。没有 `viewFrom` 时，PENDING bounds 等待，DONE bounds 复用
ADR-0037 的 public Camera framing 后建立 fixed offset，FAILED bounds 使用当前 Camera world
position 与 target 的非零差值。Entity 类型、position property、reference frame 与 tracking mode
等 static profile 必须在 public tracking publication 前完成 validation。current position、`viewFrom`
与 bounds 等 time-dependent candidate 则在首次取得 Camera authority、listener/token mutation 前验证。
undefined current position 是合法的已发布 tracking assignment：tracker 保留 last pose 与 assignment，
等待后续 sample；dynamic candidate failure 同样保留 assignment 与 last pose，但不得部分取得 authority
或修改 Camera。

Planar Camera controller 使用独立、计数式 tracking suspension token；它与 flight suspension 可
嵌套且不改变 caller `enabled`。Tracker 持有 authority 时，direct Camera flight 暂时优先，
complete/cancel 后 tracker 在下一 host frame 恢复。成功的 I2 framing 停止 tracking；PENDING、
FAILED、validation 或 Camera candidate failure 不停止。Replacement、clear、Home、Entity/DataSource
removal、controller disconnection与widget destroy均exactly once移除definition listener、恢复world
Camera transform并释放token。

Planar Viewer恢复left-double-click与InfoBox camera：当前可track Entity执行track；已track同一
Entity执行untrack；不可track但DONE bounds执行I2 zoom fallback。SelectionIndicator与description
保持现有语义。Globe、`globe:false`和generic custom World继续逐字使用原`EntityView`行为。

## 上游缝隙与所有权

`SGP-0006`只覆盖`CesiumWidget.js`和`Viewer.js`中的paired import/dispatch/lifecycle/interaction
seams。它不扩大`SGP-0001/0002/0004/0005`，不修改`EntityView`、`ControllerHost`或InfoBox
widget source。Private tracker、Specs、文档与direct Test均为SceneGIS-owned。

升级Cesium时必须复核`CesiumWidget` tracked setter、Clock/DataSourceDisplay/Scene update顺序、
postRender framing、destroy顺序，以及Viewer double-click、InfoBox tick/click、Home和DataSource
removal入口。若upstream提供等价custom-world tracking controller与interaction policy，可移除
`SGP-0006`。

## 验证

Focused private/controller/Widget/Viewer Specs覆盖profile validation、viewFrom/bounds acquisition、
native Clock、position gap、replacement/clear/remove/destroy、flight/framing互斥、InfoBox/double-click、
Perspective/Orthographic real Context、actual input suppression以及Globe/default回归。Build、types、
docs、installed package verifier、SGP audit和direct Test人工验收闭环交付。
