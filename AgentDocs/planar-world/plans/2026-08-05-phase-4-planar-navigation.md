# 阶段计划：P4 平面导航与拾取

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- 总体计划（Parent plan）：
  [2026-08-05-planar-world-extension.md](2026-08-05-planar-world-extension.md)
- 阶段（Phase）：`P4-planar-navigation`
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`approved`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-05`
- 更新日期（Updated）：`2026-08-06`
- 相关讨论（Related discussions）：无；结论已提升到 ADR
- 相关评审（Related reviews）：
  [P4 planar navigation review](../reviews/2026-08-05-p4-planar-navigation.md)
  （`approved`，P4-R001 至 P4-R005 均为 reviewer-confirmed `fixed`）
- ADR：
  `Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md`
- SGP：无；本阶段禁止修改 upstream-owned file

## 目标

在 P3 flat planar surface 之上实现第一个可用的 PC navigation 和 deterministic
surface picking。调用方应能显式关闭 legacy `ScreenSpaceCameraController`，将公共
`SceneGISPlanarCameraController` 注册到现有 `ControllerHost`，并在四种 Cesium
perspective/orthographic frustum 下完成 home、left-drag pan、middle-drag rotation、
wheel zoom、extent target constraint 和 world-coordinate picking。

本阶段必须闭合：

- public planar Controller structural lifecycle；
- 四 frustum 的真实 window ray 和 home fit；
- meter-based navigation rig、pitch/roll/above-plane constraint；
- pointer-anchored pan、rotation 和 zoom；
- bounded flat-surface ray/window picking；
- 与 `scene.pickPosition` 的语义分离和无前景内容时的一致性证据；
- public API、types、docs、input lifecycle、WebGL 和默认 Globe 回归；
- upstream-owned files = 0、P4 SGP = 0。

P4 完成、review 和独立本地提交前不得进入 P5。

## 非目标

- 替换 `scene.screenSpaceCameraController` 属性的具体类型，或修改其球面行为。
- 修改 `Scene`、`CesiumWidget`、`Viewer`、`Camera`、`ControllerHost`、
  `CameraEventAggregator` 或任何 upstream-owned file。
- 自动关闭 legacy controller，或在 CesiumWidget/Viewer 构造时自动创建 planar
  controller；这些属于 P6。
- 增加 `scene.navigationController` 或其他新的 upstream public controller slot。
- 支持 touch、pinch、mobile gesture、right-drag binding 或任意 input remapping。
- 支持 pan/rotate/zoom inertia、damping、flight animation、Tween 或 animated home。
- 公开可分别写入的 target、heading、pitch、roll、distance 或 view-scale 属性。
- 支持 `SCENE2D`、`COLUMBUS_VIEW`、`MORPHING`、map projection 或 morph。
- 支持 Camera 穿过平面、地下导航、高程 terrain、collision 或 object avoidance。
- 实现 object、Primitive、Entity、3D Tiles、feature 或 raster pixel picking。
- 修改 `scene.pickPosition`、depth reconstruction、pick pass 或 P3 surface shader。
- 修改 P3 quadtree、SSE、cache、DrawCommand 或 resource ownership，除非新增 Spec 暴露
  P3 blocking defect；此时停止并交回 Architecture Agent。
- 实现 P5 raster provider/layer/loading/fallback，或 P6 Viewer/Sandcastle/E2E。
- 修改或提交任何生成文件。

## 进入条件

- P1、P2 和 P3 均为 `completed`，相关 review 均为 `approved`。
- P3 已形成独立本地提交
  `4cfbf58a5658f57bba57e3ba8cd7e75ef9989439`
  （`完成平面世界第三阶段地表运行时`）。
- 当前分支为 `feature/planar-world`，P4 不创建新分支。
- 项目负责人已确认 public controller、ControllerHost integration、四 frustum、home、
  PC mouse bindings、target constraint、无 inertia 和两层 picking contract。
- ADR-0004 状态为 `approved`，Architecture review 为 `approved`。
- P4 implementation diff base 固定为
  `4cfbf58a5658f57bba57e3ba8cd7e75ef9989439`。
- Execution Agent 开始前重新读取根、engine、AgentDocs `AGENTS.md`，以及
  `Architecture.md`、`DevelopmentGuide.md`、总体计划、ADR-0001 至 ADR-0004、P3
  plan/review 和本计划。
- Execution Agent 使用 code graph 重新确认当前 `Controller`、`ControllerHost`、
  `CameraEventAggregator`、四个 frustum、Camera world/local axes、
  `Camera.getPickRay`、Scene depth picking 和 DOM input Specs；不得根据旧行号实现。

## 当前源码事实

1. 上游基线是 Cesium `1.144`，提交
   `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
2. P3 checkpoint 上 `SceneGISPlanarWorld` 已公开 coordinate system、tiling scheme、
   maximum level、surface settings 和 frame lifecycle；它尚无 picking method。
3. P3 surface 是 bounded square、opaque、double-sided `Z=0` plane，使用完整 world
   `Cartesian3` 和 tile-local geometry/modelMatrix，并支持真实 perspective 与
   orthographic frustum。
4. `Scene` 固定创建 concrete `_screenSpaceCameraController`，在
   `initializeFrame()` 独立调用其 `update()`，并在 Scene destroy 时销毁它。
5. legacy `ScreenSpaceCameraController` 的 `spin3D`、`pan3D`、`zoom3D`、`tilt3D`
   和 underground/collision 路径读取 ellipsoid、cartographic、geodetic normal、
   ENU 或 ray-ellipsoid behavior；不能作为任意 planar CRS controller。
6. `Scene.controllerHost` 是 readonly public `ControllerHost`。registered controller
   按 priority 更新；首次启用时调用 `firstUpdate`，每个启用帧调用 `update`。
7. `ControllerHost.registerController` 在注册时调用 `connectedCallback(element)`；
   `unregisterController` 在存在该实例时调用 `disconnectedCallback(element)`。host
   不销毁 controller object，也不阻止同一对象被错误重复注册。
8. `CesiumWidget.addController/removeController` 已把 widget container 传给上述 host
   API。P4 不需要新的 Widget hook。
9. `CameraEventAggregator` 已聚合 LEFT/RIGHT/MIDDLE drag、WHEEL 和 PINCH，并提供
   per-frame movement/reset/destroy protocol。P4 只消费 LEFT_DRAG、MIDDLE_DRAG 和
   WHEEL。
10. `Camera.getPickRay` 仅在 frustum 具有 `aspectRatio`、`fov` 和 `near` 时进入
    perspective helper。direct `PerspectiveOffCenterFrustum` 会落入 orthographic
    helper，不能作为 P4 四 frustum 的唯一 ray source。
11. `PerspectiveFrustum` 的 effective off-center frustum 由其 FOV/aspect/offset
    派生；direct `PerspectiveOffCenterFrustum` 公开 left/right/top/bottom/near/far。
12. `OrthographicFrustum` 以 width 和 aspect 派生 off-center bounds；direct
    `OrthographicOffCenterFrustum` 公开四边。
13. `camera.positionWC`、`directionWC`、`upWC`、`rightWC` 提供 world axes；P4 不得
    读取 `positionCartographic` 或 map projection。
14. `scene.pickPositionWorldCoordinates` 在 `SCENE3D` 中返回 rendered-depth world
    position；其 support、遮挡和当前 frame 依赖与 mathematical surface pick 不同。
15. P1 的 upstream-owned files 仍只有 `Scene.js` 和 `CesiumWidget.js`，由
    `SGP-0001` 跟踪。P4 不得改变它们、marker 或 patch manifest。

源码行号不是契约。若 Execution Agent 发现上述事实不再成立，先停止实现并回写本
计划；改变 public API、input ownership、frustum scope、upstream diff 或 P4 非目标的
问题交回 Architecture Agent。

## 详细设计

### 对象关系与私有边界

```text
CesiumWidget / direct Scene host
  └─ registers → SceneGISPlanarCameraController (public Controller)
                       ├─ references → SceneGISPlanarWorld
                       ├─ owns → CameraEventAggregator
                       └─ uses → planar camera/frustum helpers (private)

SceneGISPlanarWorld
  ├─ pick(Ray)
  └─ pickFromWindowPosition(Cartesian2, Scene)
         └─ uses → the same private four-frustum ray helper
```

预计新增或修改：

```text
packages/engine/Source/SceneGIS/Scene/
├── SceneGISPlanarCameraController.js
├── SceneGISPlanarWorld.js
└── _private/
    └── _SceneGISPlanarCamera.js
```

`_SceneGISPlanarCamera.js` 可以保存 type classification、window-ray、plane
intersection、home-fit 和 pose conversion 的纯函数。它是建议布局，不是必须创建的
类。如果执行后拆成多个私有 helper，或简单函数适合留在 public module 的 file scope，
Execution Agent 可以调整，但必须回写最终路径与理由。

私有 module basename 使用前导 `_` 并标记 `@private`；若包含 class/constructor，符号
名不带前导 `_`。不得导出 private helper 为 public API，也不得为测试便利添加 public
debug method。

### `SceneGISPlanarCameraController` 公共 API

构造形式：

```text
new SceneGISPlanarCameraController({ world })
```

构造器：

- `options.world` 必须是未销毁的 `SceneGISPlanarWorld`；缺失、错误类型或 destroyed
  world 抛出 `DeveloperError`。
- 保存 readonly `world` identity。
- `enabled`、`enablePan`、`enableRotate`、`enableZoom` 默认为 `true`，setter 只接受
  boolean；设为 `false` 时取消对应 active gesture和 pending delta，重新启用不重放
  旧输入。
- `homePadding` 默认为 `1.05`，setter 只接受 finite number `>= 1.0`。
- 不接收 Scene、Context、canvas、ellipsoid、projection 或 Globe。

公开方法：

- `connectedCallback(element)`
- `disconnectedCallback(element)`
- `firstUpdate(scene, time)`
- `update(scene, time)`
- `viewHome(scene)`

前四个方法是 Controller lifecycle conformance，不鼓励调用方脱离 host 手工调用。
JSDoc 必须声明 `@implements Controller` 和所有 public `DeveloperError` 条件。
`viewHome(scene)` 可以在正确注册前调用，但必须先由调用方关闭 legacy input，并在任何
Camera/frustum mutation前验证 world identity、liveness、SCENE3D和 supported frustum。
public JSDoc example必须显示完整的 explicit lifecycle：先设置
`scene.screenSpaceCameraController.enableInputs = false`，再
`widget.addController(controller)`，并在 Widget/Scene destroy前
`widget.removeController(controller)`。

P4 不公开 sensitivity、input binding、rig state、minimum/maximum distance 或 debug
counter。实现使用的固定 mouse-to-angle 和 wheel exponent 常量必须命名、有限、与
viewport scale 归一化，并由行为 Specs 锁定方向和稳定性；不能依赖真实 wall-clock
使相同 movement fixture 产生不同 Camera。

### Controller Lifecycle 与冲突

`connectedCallback`：

- 验证 element；
- 未连接时创建唯一 CameraEventAggregator；
- 不在此阶段推测 Scene，也不修改 legacy controller。

调用方必须把 add/remove 成对使用，并在 Widget/Scene destroy 前 remove controller。
同一个 controller instance 未移除前不得再次 register到同一或另一 host。当前
ControllerHost在 callback前已经写入内部 list，controller无法为错误的重复注册提供
原子 rollback；P4记录该 precondition，不为该 host限制增加 upstream patch。

`firstUpdate`：

- 在 mutation 前验证 element 已连接、`scene.world === world`、SCENE3D、world/Scene
  live、supported frustum 和 legacy `enableInputs === false`；
- 保存唯一 active Scene identity；
- zero-sized canvas 时不 home、不产生非法状态，等待有效 update；
- 有效且满足 planar invariants 的调用方 Camera 保持不变；否则立即 home；
- 清除 aggregator 的 stale movement，注册前的事件不能在首帧移动 Camera。

`update`：

- controller enabled 时每帧先重做 world/mode/frustum/legacy conflict validation；
- 无 input 时不写 Camera；
- `enablePan/Rotate/Zoom === false` 时只忽略对应 gesture，不影响其他 gesture；
- 一帧出现多个输入类别时使用固定处理顺序，并在 plan result 中记录；不得根据对象
  iteration order 决定结果；
- 每帧结束正确 reset aggregator，上一帧 delta 不能重复应用；
- `enabled=false` 时 ControllerHost 不调用 update，Camera 和输入状态不得产生 side
  effect。重新启用后的首个实际输入重新同步 rig。

`disconnectedCallback`：

- destroy aggregator exactly once，清除 Scene、gesture、anchor、pivot 和 rig state；
- 不自动重新启用 legacy controller，因为 P4 从未拥有该状态；
- 移除后允许同一实例重新连接，重新连接的 first update 重新建立 Scene identity。

controller 已启用而 `scene.screenSpaceCameraController.enableInputs !== false` 时必须抛
出冲突 `DeveloperError`，且从 planar controller method entry 开始，Camera、aggregator
gesture state和 SceneGIS world均不发生部分 mutation。由于 legacy controller在
Scene lifecycle中先于 ControllerHost独立更新，P4不能回滚它在本帧更早造成的 Camera
变化；调用方必须在输入前关闭 legacy controller。不得 monkey patch或赋值替换
`scene.screenSpaceCameraController`。

### 四 Frustum Ray Helper

helper 必须先按真实 Cesium frustum type 明确分类，再考虑仅用于 test double 的
structural fallback，避免 P3 曾出现的 offCenter getter 误分类：

1. `PerspectiveFrustum`
2. `PerspectiveOffCenterFrustum`
3. `OrthographicFrustum`
4. `OrthographicOffCenterFrustum`

window position 使用 canvas `clientWidth/clientHeight` 和 top-left DOM origin。对每种
frustum，从实际 left/right/top/bottom/near 或 width/aspect 推导 pixel 在 near plane
或 orthographic plane 的 origin/direction。不要先读取 generic
`frustum.offCenterFrustum` 再判断原始类型。

- perspective ray origin 是 `camera.positionWC`，direction 通过 world-space
  direction/right/up axes 与 asymmetric near-plane offset 得到并 normalize；
- orthographic ray direction 是 `camera.directionWC`，origin 按对应 pixel 的
  frustum-plane offset 平移；
- zero client width/height 返回 `undefined`；
- unsupported frustum、invalid public bounds、non-finite Camera axes或退化 direction
  抛出明确 `DeveloperError`；
- optional Ray result 复用；helper 不修改 Camera/frustum。

viewport center 使用与任意 pointer 完全相同的 helper，不能另写只适用于 symmetric
frustum 的 center shortcut。

### `SceneGISPlanarWorld` Picking

增加：

```text
SceneGISPlanarWorld.prototype.pick(ray, result)
SceneGISPlanarWorld.prototype.pickFromWindowPosition(
  windowPosition,
  scene,
  result,
)
```

`pick` validation 和结果：

- required ray 至少具有 finite `origin.x/y/z` 和 `direction.x/y/z`；
- direction magnitude 必须 finite 且 non-zero；
- direction 不要求 unit length，同一几何 ray 的 scaled direction必须得到相同 hit；
- horizontal non-zero ray、coplanar ray、negative intersection parameter、non-finite
  intersection 和 extent-outside hit 返回 `undefined`；
- `t=0`、above-to-down、below-to-up 和 inclusive min/max edge/corner 是合法 hit；
- hit 的 `z` 写为 canonical `0.0`，XY 使用计算结果并通过 inclusive bounds；
- optional Cartesian3 result 在成功时保持 identity；miss 不承诺清空 result；
- destroyed world 调用抛出 `DeveloperError`。

不要使用 epsilon 扩大 coordinate-system extent。并行判断可以使用与 floating-point
ray-plane 数学相称的方向判定，但不能把明显穿过 plane 的小 Z direction 当作平行；
overflow/underflow 结果必须安全变成 miss 或明确 invalid input，不能返回 `NaN`。

`pickFromWindowPosition`：

- required finite Cartesian2-like position；
- required live Scene；`scene.world` 必须严格等于当前 world；
- required SCENE3D 和四种 supported frustum；
- zero-sized canvas 返回 `undefined`；
- 使用共享 private ray helper并立即委托 `pick`；
- finite out-of-canvas coordinate 不预先 clamp，是否命中由 ray 和 bounded surface
  决定；
- 不调用 `scene.pickPosition`，不要求当前 frame 已渲染。

### Navigation Rig、External Camera 与 Pose

private rig 至少表达：

- inclusive planar center target；
- Cesium-convention heading；
- pitch；
- projection-specific distance或 orthographic scale；
- 当前 canvas/frustum 对应的 home maximum 和 precision-safe minimum；
- active gesture anchor/pivot 与其 original screen position。

所有计算基于 `positionWC/directionWC/upWC/rightWC`。写回 Camera 时必须得到 finite、
orthonormal、zero-roll world pose，并正确转换到 Camera 当前 reference transform；不得
通过 Earth ENU/HPR helper、Cartographic 或 ellipsoid 完成。如果公共 Camera API 无法
安全写回该 pose，Execution Agent 先检查 current private transform protocol并将依赖
封装在单一 SceneGIS private helper；不得自行修改 `Camera.js`。

当 idle 后调用方外部修改 Camera：

- controller 不在无 input frame 抢回；
- 下一 gesture start 使用真实 center ray 与 Camera axes重建 rig；
- supported、finite、above-plane 且 center ray forward-intersects bounded plane 的 pose
  被保留；
- 无法形成有效 planar view 时才执行 home；
- 重新同步不能应用上一 gesture 的 anchor/delta。

### Home Fit

center 使用 `minimum + (maximum - minimum) * 0.5` 或等价防溢出形式。home 固定
heading `0`、pitch `-PI/2`、roll `0`，screen up 为 `+Y`。

fit 必须使用 actual four frustum bounds 与 viewport：

- perspective 不改变 FOV、aspect/off-center parameters、near/far；移动 Camera 使
  padded extent 四角全部进入 viewport；
- `OrthographicFrustum` 修改 width，但保持 type/aspect/near/far；
- direct orthographic off-center 将 left/right/top/bottom 同乘一个 positive scale，
  保持 normalized center offset和 near/far；
- asymmetric perspective 以最受限的 side 求满足全部四角的 distance，不假定 extent
  center 相对 optical axis 对称；
- `homePadding` 乘在 fit size 上；
- near/far 不能容纳 home 时抛出 `DeveloperError`，且不得留下部分 Camera/frustum
  mutation。

landscape、portrait、square、direct off-center 和 large-offset fixtures 都必须验证
四角投影，而不是只检查 Camera height。

### Input Semantics

固定绑定：left drag pan、middle drag rotate、wheel zoom；right和 touch/pinch忽略。

Pan：

1. left press/start 时用 `world.pickFromWindowPosition` 获取 bounded anchor；miss 时
   整个 gesture inactive。
2. gesture 启动后，每次 movement 使用 private ray helper 与 infinite `Z=0` plane 求
   当前 pointer point，计算使 original world anchor 保持在 pointer 下的 Camera/target
   translation。这里不能再次使用 bounded public pick，否则 pointer 离开 surface
   projection 后无法继续拖至 target boundary；parallel/non-finite movement保持上一
   valid pose。
3. 计算后的 center target clamp 到 extent；需要 correction 时整体平移 Camera 和
   target，优先满足 boundary。
4. 保持 heading、pitch、roll和 projection scale。

Rotate：

1. middle start 优先 pick pointer position；miss 时使用 current center target。
2. pivot 在 gesture lifetime 内不改变。
3. horizontal normalized pixel delta 改 heading；vertical delta 改 pitch。
4. 对 Camera position和 orientation 应用围绕 fixed world pivot 的一致旋转，使无边界
   情况下 pivot 保持 original screen coordinates。
5. pitch clamp 为 `[-PI/2, -5 degrees]`，heading规范化到 `[0, TWO_PI)`，roll归零，
   Camera保持 `z > 0`。
6. 从新 center ray 计算 target并应用 extent correction。

Zoom：

1. wheel event 使用最近 pointer position；bounded hit 为 anchor，否则 current target。
2. wheel delta 转换为 deterministic exponential positive scale；方向与默认 Cesium
   wheel zoom 一致。
3. perspective 只移动 Camera/target关系，不改变 frustum fields。
4. `OrthographicFrustum` 等比例改变 width；direct off-center 等比例改变四边。
5. 通过 world translation保持 anchor screen position，再应用 target clamp。
6. zoom range clamp 到 current home maximum和 precision-safe internal minimum。

gesture release 后不保留 velocity、Tween 或 pending delta；下一无输入 frame Camera
bitwise/epsilon unchanged。边界 clamp 可以破坏 pointer anchoring，但不能破坏 finite、
above-plane、pitch 或 roll invariant。

### View Range 与数值安全

home maximum 在当前 canvas/frustum 下按实际 fit 重新计算。canvas resize 不主动修改
Camera，下一 home/gesture才应用新范围。

minimum 不使用与 CRS 无关的 magic meter constant。至少考虑：

- extent size 和绝对 coordinate 的 Number ULP；
- target附近可区分的 XY translation；
- perspective Camera-plane distance或 orthographic span；
- viewport pixel count和 frustum scale；
- near plane 和 finite projection matrix。

implementation 可以采用保守下限，但必须记录公式并用 origin-near-zero 与 large-offset
fixtures 证明继续 zoom-in 最终稳定 clamp，而不是 Camera crossing、zero scale、
oscillation、Infinity或 NaN。若无法形成普遍可证明的公式，先停止并回交 Architecture
Agent，不能暗中增加固定 public minimum。

### Depth Picking Integration

P4 不改 `scene.pickPosition`。在 runner 支持 pick-position/depth texture 时：

- 渲染仅有 P3 opaque planar surface 的真实 Scene；
- 对一个内部点分别调用 mathematical window pick和 Scene depth pick；
- 结果 XYZ 在由 camera/frustum/viewport precision 推导的 tolerance 内一致；
- extent 外 mathematical pick为 `undefined`，background depth不得伪造成 surface hit。

如果 test Context 明确不支持 depth picking，Spec 使用 Cesium 现有 capability guard并
记录 skip 分支；不能把不支持环境写成产品通过的唯一证据。

## 影响路径

允许新增或修改：

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js` 或回写后的等价
  SceneGIS private helper
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCameraSpec.js` 或回写后的等价
  private Spec
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidgetSpec.js`
- P4 发现且经两次 Architecture decision 授权的 P3 correction：
  `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`、
  `_SceneGISPlanarTile.js` 及对应 `SceneGISPlanarSurfaceSpec.js`、
  `SceneGISPlanarTileSpec.js`
- P3 post-approval correction 记录：ADR-0003、P3 completed plan 与 approved review
- `Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md`
- `AgentDocs/planar-world/**` 中本阶段文档、索引和 review evidence

如果新增其他 SceneGIS-owned helper/Spec，先回写本节。禁止修改：

- `packages/engine/Source/Scene/Scene.js`
- `packages/engine/Source/Widget/CesiumWidget.js`
- `packages/engine/Source/Scene/ScreenSpaceCameraController.js`
- `packages/engine/Source/Scene/Camera.js`
- `packages/engine/Source/Scene/CameraEventAggregator.js`
- `packages/engine/Source/Scene/Controllers/**`
- `packages/widgets/**`
- P3 `_SceneGISPlanarSurface`、Quadtree、Tile，除非发现 blocking defect并暂停
- `scripts/build.js`、Shader、Worker、静态资源和 Sandcastle
- `.scenegis/upstream-patches.json`
- 所有生成文件和 P5/P6 路径

## 执行步骤

1. Execution Agent 保持本计划 `active`，确认 branch、base、status、owned paths、
   graph freshness 和相关 test helpers；不能先写代码再补源码事实。
2. 实现/测试 private four-frustum camera helper：type classification、window ray、center
   ray、plane math、result reuse、invalid/zero canvas 和 large offsets。
3. 在 `SceneGISPlanarWorld` 实现 `pick` 与 `pickFromWindowPosition`，先闭合纯数学、
   bounded/inclusive、above/below、parallel/coplanar/behind和 destroyed Specs。
4. 实现 public controller construction/properties、Controller lifecycle、single
   element/Scene ownership、legacy conflict和 aggregator cleanup。
5. 实现 private rig、external Camera synchronization和 four-frustum home，闭合
   landscape/portrait/off-center/near-far/large-offset Specs。
6. 按固定顺序实现 left pan、middle rotation和 wheel zoom，闭合 pointer anchoring、
   boundary、pitch/roll/above-plane、projection preservation和 no-inertia Specs。
7. 添加真实 CesiumWidget explicit registration integration Spec；确认 default controller
   必须由调用方关闭、移除 controller 后资源释放、world仍由 Scene销毁。
8. 添加 WebGL/depth integration evidence；不得把人工操作或 screenshot作为唯一结果。
9. 从 engine root入口导入 public controller/world methods，生成并检查 JS export、types
   和 API docs；检查 private helper 不进入 declarations或 public HTML。不得手改或提交
   生成文件。
10. 运行全部 mandatory commands，记录 exit code、Spec count、capability guard、
    anchor tolerance、Camera invariant和 cleanup evidence。
11. 相对 P3 commit审计 final diff：upstream-owned files = 0、P4 SGP = 0、patch
    manifest unchanged、generated files absent。
12. 回写本 plan 的实际路径、private formulas、input order、偏差和验证矩阵；更新已创建
    的 P4 review request，保持 `open` 并请求 Architecture/code review。总体 roadmap和
    extension index 在 review通过前保持 P4 `active`。
13. Execution Agent 不 commit、不 push、不创建 P5 文件；通知 Architecture Agent后
    停止。
14. Architecture Agent 完成 architecture/code review；findings由 Execution Agent
    修复并回写，直至 review `approved`。
15. Architecture Agent 将 P4 code、Specs、ADR和 AgentDocs创建为单独中文本地提交。
    提交成功后停在阶段边界，与项目负责人讨论 P5，不自动激活下一阶段。

## 验证要求

### 必须覆盖的 Ray 与 Picking Specs

- Ray validation：missing、non-finite origin/direction、zero direction、result reuse和
  destroyed world。
- Plane relation：above/down、below/up、origin-on-plane `t=0`、behind、horizontal
  parallel、coplanar和 non-finite intersection。
- Bounds：center、四 edge、四 corner、每边外部、no epsilon extent expansion。
- Precision：near-zero coordinate fixture、large absolute CRS offset、small but valid Z
  direction和 overflow-safe miss。
- Window ray：四种真实 frustum分别覆盖 center和至少两个非中心 pixel；direct
  perspective off-center必须证明不是 orthographic origin/direction。
- window validation：wrong world、wrong mode、unsupported frustum、zero canvas、finite
  out-of-canvas coordinate和 result reuse。
- render independence：不调用 world lifecycle/render也能得到同一 mathematical hit。

### 必须覆盖的 Home 与 Rig Specs

- 四种真实 frustum，包含 standard perspective、direct perspective off-center、
  standard orthographic和 direct orthographic off-center。
- landscape、portrait和 square viewport；home后四个 extent corner均位于 padded
  viewport。
- extent使用 large positive/negative offset而非只测试 origin-centered square。
- target为 overflow-safe extent center，Z=0；screen up +Y、heading 0、pitch -90°、
  roll 0、Camera z>0。
- perspective FOV/aspect/offset/near/far identity不变；orthographic aspect/normalized
  off-center ratio/near/far不变。
- insufficient near/far抛出且 Camera/frustum无部分 mutation。
- first update保留 valid caller Camera；invalid/parallel/below-plane pose才 home。
- external valid Camera mutation在 idle保持，下一 gesture同步；invalid mutation在下一
  gesture安全 home。
- resize idle不改 Camera；next home/gesture使用新 canvas constraints。

### 必须覆盖的 Input Specs

- bindings：left只 pan、middle只 rotate、wheel只 zoom；right和 pinch不改变 Camera。
- 同帧 middle movement 优先于 left movement；wheel在 drag后处理并基于更新后的 Camera
  重新选择 anchor。
- per-feature enable flags和 controller `enabled` no-op。
- left-start hit/miss、world anchor screen stability、target min/max boundary clamp和
  projection/orientation保持。
- middle pick pivot/fallback target、pivot screen stability、heading wrap、pitch两端 clamp、
  zero roll和 Camera不穿 plane。
- wheel pointer hit/fallback、zoom direction、exponential stability、home maximum、precision
  minimum和 repeated clamp无 oscillation。
- perspective zoom不改 frustum fields；orthographic width或四边按同一正比例改变。
- pointer anchoring分别在 perspective、orthographic和至少一个 direct off-center
  fixture中验证。
- release后的下一无输入 frame Camera不变；没有 inertia、Tween或 residual delta。
- 同帧多输入使用记录的 deterministic order。

### 必须覆盖的 Lifecycle 与集成 Specs

- constructor defaults、readonly world、boolean setters、homePadding validation。
- connect、paired remove、remove后 reconnect和 aggregator destroy exactly once；同一
  instance重复 register是明确记录的调用方错误，不伪造 host-level atomic rollback。
- wrong Scene/world、destroyed world、wrong mode、unsupported frustum和 legacy controller
  conflict在任何 planar-controller Camera mutation前抛出。
- explicit Widget registration path：先关闭 legacy controller，再 add/remove planar
  controller；P4不修改 Widget或 ScreenSpaceCameraController。
- zero canvas不 home、不产生 NaN；有效 resize后恢复。
- P3 surface渲染前后 controller不改变 world resource ownership。
- WebGL interaction后 extent内有正确 surface pixel/command，extent外保持 background。
- depth supported时 mathematical window pick与 `scene.pickPosition`在 tolerance内一致。
- 正确的 controller remove-before-Widget/Scene-destroy顺序不造成 double destroy或
  retained DOM handler；P4明确不宣称 host会在 Scene destroy时自动 disconnect。

### 必须运行的命令

```powershell
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCamera"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"
npm run test -- --webglValidation --includeName "SceneGIS/Scene/SceneGISPlanar"
npm run test -- --includeName "SceneGIS/Widget/SceneGISWorldCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarWorldCesiumWidget"
npm run test -- --includeName "Scene/Camera"
npm run test -- --includeName "Scene/CameraEventAggregator"
npm run test -- --includeName "Scene/Controllers/ControllerHost"
npm run test -- --includeName "Scene/ScreenSpaceCameraController"
npm run test -- --includeName "Widget/CesiumWidget"
npm run test -- --includeName "Scene/Globe"
npm run test -- --includeName "Scene/Scene"
npm run build
npm run build-release
npm run build-ts
npm run build-docs
npm run tsc
npx eslint "packages/engine/Source/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Widget/**/*.js"
npx prettier --check "packages/engine/Source/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Scene/**/*.js" "packages/engine/Specs/SceneGIS/Widget/**/*.js"
npx prettier --check --ignore-path .gitignore "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"
npx markdownlint "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"
git diff --check
```

如果 final private layout没有 `SceneGISPlanarCamera` suite，Execution Agent必须把第一条
替换为真实命中的 private helper suite并回写 mapping；不得把零命中当作通过。全部 test
命令串行运行，避免多个 gulp runner并发清理同一 Build目录。每条实际命令记录 exit
code、passed/failed/skipped count和必要 warning。

### 生成与公共 API 检查

- `SceneGISPlanarCameraController` 出现在 engine root JS export、
  `packages/engine/index.d.ts`、`Source/Cesium.d.ts`和 API HTML。
- `SceneGISPlanarWorld.pick`、`pickFromWindowPosition`和 controller `viewHome`出现在生成
  declarations/API docs，参数顺序与 ADR一致。
- private helper/type不出现在 generated `.d.ts`或 public API HTML。
- development/release bundle都能解析 public controller和 private helper。
- generated root files、Build outputs和 SpecList只作为验证结果，不进入 diff/status/stage。

### 数值、交互与资源证据

Execution Agent 在“偏差与结果”记录至少两个可重复 fixture：

- ordinary extent fixture：extent、canvas、frustum fields、home Camera pose、四角 projected
  window coordinates、pan/rotate/zoom前后 anchor误差和 boundary结果；
- large-offset fixture：absolute coordinate量级、extent size、Camera pose、minimum zoom
  clamp、pick result和 rendered/depth tolerance。

同时记录：

- supported four-frustum matrix及每种 home/pick/zoom断言；
- connected/disconnected/reconnected aggregator create/destroy count；
- release后的 zero-input Camera delta；
- depth capability和 mathematical/depth pick差值；
- invalid input/conflict调用相对 planar method entry的 Camera unchanged evidence。

P4不是性能优化阶段，不要求宣称 frame-time提升；但 idle controller不得持续创建
gesture object、持续改变 Camera或引入 request-render loop。若使用 private debug
counter，只能存在于 Specs可访问的 private seam，不得成为 public API。

### Diff 与所有权审计

- implementation diff base：
  `4cfbf58a5658f57bba57e3ba8cd7e75ef9989439`。
- 只允许本计划“影响路径”登记的 SceneGIS-owned files；新增路径先回写计划。
- upstream-owned files必须为 0。
- P4 SGP必须为 0；`.scenegis/upstream-patches.json`必须 unchanged。
- `Scene.js`、`CesiumWidget.js`中既有 `SGP-0001` marker和行为不得改变。
- P4新增 `SCENEGIS_PATCH` marker必须为 0。
- generated files、Build outputs和 SpecList不得出现在 final status。

## 风险与依赖

- direct perspective off-center是现有 `Camera.getPickRay`的已知分类缺口；private helper
  必须由真实类型 Specs锁定，不能只用 shape mock。
- four-frustum home和 pointer anchoring容易把 `camera.direction`误当 viewport center
  ray；所有中心、pivot和target都必须走同一 actual ray helper。
- Camera current reference transform可能使 world/local pose写回复杂。依赖 private
  transform protocol时必须集中封装并列为 Cesium upgrade checkpoint。
- near-horizontal pitch会放大 plane footprint和数值误差；P4固定 `-5°`上限，不能为了
  某个 fixture放宽到 horizon。
- large CRS offset下可分辨平移取决于 Number ULP；precision minimum必须按实际坐标和
  viewport推导，不能承诺物理上不可表示的 sub-ULP zoom。
- ControllerHost与 legacy controller是两条独立 update路径。遗漏 conflict validation
  会造成同一 input被两套算法处理，因此每次可变 update都必须先验证。
- `CameraEventAggregator`监听 touch/pinch不表示P4支持它们；controller必须忽略且测试
  Camera unchanged。
- depth picking可能受 runner/GPU capability影响；mathematical pick不能依赖或回退到
  depth result。
- P4 explicit registration存在使用门槛，但这是刻意的 phase boundary。P6自动化之前
  示例和JSDoc必须明确先关闭 legacy controller并在销毁前 remove。

## 完成条件

- ADR-0004与实际 public API、input、frustum和picking行为一致并保持 `approved`。
- `SceneGISPlanarCameraController`是P4唯一新增 public type，结构化实现 Controller并
  通过现有 ControllerHost explicit registration工作。
- `SceneGISPlanarWorld`只新增确定性的 `pick`和 `pickFromWindowPosition` surface API。
- 四种真实 frustum的 window ray、home、pan/rotate/zoom和projection preservation由
  Specs锁定。
- left/middle/wheel、target boundary、pitch/roll/above-plane、home maximum、precision
  minimum和 no-inertia contract通过自动化测试。
- public mathematical pick与 depth pick边界明确，支持环境中的一致性 evidence通过。
- controller connect/remove/reconnect、legacy conflict、disabled no-op和cleanup exactly
  once通过。
- public exports、types、docs、development/release builds和 private hiding通过。
- mandatory tests、WebGL validation、Camera/Controller/Globe/Scene/CesiumWidget regressions、
  lint、format、Markdown和diff checks通过，或只保留已证明与P4无关的既有 warning。
- final diff upstream-owned files = 0、P4 SGP = 0、patch manifest unchanged、generated
  files absent。
- P4 review为 `approved`，没有 unresolved finding；所有 finding都有 evidence或明确
  后继计划。
- Architecture Agent创建独立中文P4本地提交；提交后停止并与项目负责人讨论P5。

## 偏差与结果

P4 implementation 已按首次 Architecture/code review 修复 P4-R001 至 P4-R005，并通过
focused Architecture/code re-review。P4 状态为 `completed`，review 为 `approved`；本文件
随独立 P4 本地 checkpoint 一并提交，不 push、不进入 P5。实现期间两次按门禁暂停并取得
Architecture decision，以下保留诊断历史并记录最终 resolved evidence。

### 最终实现路径与选择

- 新增 public `SceneGISPlanarCameraController.js`，以及 private
  `_private/_SceneGISPlanarCamera.js`；后者集中四种真实 frustum 分类、window ray、
  infinite `Z=0` intersection、world/local Camera pose 和 orthographic scale helper。
- `SceneGISPlanarWorld.js` 新增 `pick` 与 `pickFromWindowPosition`。
- 已新增 private helper、world、controller 和 Widget integration Specs；测试 basename
  按 constructor/helper symbol 命名，private source module basename 保持前导 `_`。
- 当前 input processing order 为：同帧 `MIDDLE_DRAG` 优先于 `LEFT_DRAG`，随后处理
  `WHEEL`；right/pinch 不消费，无 inertia。
- P4-discovered P3 correction 修改 `_SceneGISPlanarSurface.js` 与
  `_SceneGISPlanarTile.js`：normal render 缓存实际提交 command，pick+depth pass 只重提
  相同 references；quadtree 使用 exact zero-thickness OBB，DrawCommand 使用从该 OBB
  一次性派生的 conservative BoundingSphere。对应 Tile/Surface Specs 一并更新。
- 最终 product/spec paths 为本计划“影响路径”列出的 11 个 SceneGIS-owned JS 文件；
  文档另更新 ADR-0003、ADR-0004、P3 post-approval correction 记录及本阶段 plan/review。

### 两次 Architecture decision 与已解决的 depth blocker

- 真实 WebGL fixture 中，P3 opaque planar surface 的 center pixel 为 lime，且
  `scene.pickPositionSupported === true`，但 `scene.pickPosition(center)` 返回
  `undefined`；设置 `scene.pickTranslucentDepth = true` 后仍相同。
- 源码事实：`Picking.pickPositionWorldCoordinates` 从 `PickDepth` 读取已复制 depth；
  `Scene.executeCommands` 的 depth copy 位于
  `useGlobeDepthFramebuffer || renderTranslucentDepthForPick` 分支。更直接的阻断是 P3
  `_SceneGISPlanarSurface.render` 在 `!frameState.passes.render` 时立即返回，因此
  `pick/depth` pass 不提交 planar `Pass.OPAQUE` command。
- Architecture Agent 已裁决允许在 P4 中把 P3 SceneGIS-owned surface correction 纳入
  当前提交，禁止 upstream seam。已据此让普通 render 精确缓存实际 commands，并在
  `passes.pick && passes.depth` 中只重提相同 command references；private Surface Specs
  16/16 通过，确认 selection/SSE/tile/protection/LRU 和 GPU/command allocation 均无
  delta，Context guard 仍先于 early return。
- 第一次 correction 后真实 WebGL 复核仍失败。normal render 与
  translucent-depth replay 两条路径的 `PickDepth.getDepth` 都得到 `0`；
  `Picking.pickPositionWorldCoordinates` 只接受 `0 < depth < 1`，所以结果仍为
  `undefined`。两条 fixture 的 drawing-buffer coordinate 都为 `[150, 75]`，buffer 为
  `300x150`，cached command 为 `1`；normal submitted command 为 `1`，translucent-depth
  replay counter 从 `0` 增至 `1`，证明重提实际发生。
- 当时对应 `frustumCommandsList` 只有一个区间：near
  `465.5752570745143`、far `470.23100964525946`。surface center color pixel 正确，说明
  command 执行但 copied depth 落在 `0`。根据裁决“默认 false 仍失败则暂停”再次停止；
  未修改 upstream Scene/Picking/View/GlobeDepth。
- 第二次 Architecture decision 确认 exact OBB 的 Z half-axis 为 `0`，使 nadir plane
  精确落在 near plane 并写入 raw depth `0`。最终采用双包围体职责，不增加物理厚度或
  epsilon：selection/SSE 仍使用 exact OBB，DrawCommand 改用一次性派生的 sphere。
- 最终 Tile 4/4 与 Surface 18/18 证明 ordinary、large-offset、maximum-level tile 的
  sphere finite/positive 且包含四角；DrawCommand 严格引用 sphere，quadtree 严格引用
  OBB；depth replay 前后 selection/SSE/tile/protection/LRU 和 GPU/command allocation
  均无 delta。nadir plane distance 严格落在 sphere interval 与生成 frustum near/far 内。
- 四个独立真实 Widget fixtures 通过：默认 depth、首次 translucent-depth replay、关闭
  logarithmic depth 的 linear path、以及 `1e9` large offset，均得到
  `0 < rawDepth < 1`；rendered position 与 mathematical pick 分别在 `1e-4` 和
  large-offset `1e-3` 容差内一致。extent 外 mathematical/depth pick 均为 undefined。
  blocker 因此 resolved。

### 实现期间诊断记录

| 命令                                                                                   | 结果                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run build`                                                                        | Exit 0                                                                               |
| `npm run build-ts`                                                                     | Exit 0；有既有批量 TSD-JSDoc warnings，并发现/随后修正本阶段 property JSDoc 格式     |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCamera"`                  | 最后一次完成运行 10/10（该 pattern 同时命中 controller）；早期 private-only 迭代 5/5 |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"`        | 暂存 12/13；唯一失败为正在调试的 boundary fixture，停止门禁触发后未继续修改          |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                   | Exit 0，11/11                                                                        |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"` | 0/1；color pixel/command通过，supported depth pick 返回 `undefined`                  |

第一次 correction 后该 Widget suite 拆为两个独立 fixture，当时 0/2：默认 false
与 `pickTranslucentDepth=true` 均确认 command/cached replay，但 raw depth 为 `0`，故
`scene.pickPosition` 为 `undefined`。P3 Surface correction 专项为 Exit 0，16/16。

上述表只保留 gate 触发时的历史证据，不代表最终状态。

### 数值、交互与资源证据

- P4-R001：perspective zoom 改用 Camera 到 viewport-center target 的 center-ray range，
  pointer 仅参与缩放后的 anchor correction。home maximum 每次由当前 frustum、viewport、
  extent 与 `homePadding` 纯计算；valid initial Camera 可以 zoom out，普通/direct
  off-center perspective 在 home 的非中心 pointer zoom-out 均保持 maximum，padding、
  frustum 和 resize 后不复用 stale maximum。
- P4-R002：pose sync 同时归一化并分解 world direction/up/right；非 nadir pose 验证
  zero roll 与正交 handed axes，exact nadir 从 up/right 恢复 heading。identity helper 与
  non-identity Camera transform fixture 均保留非零 nadir heading；真实 rolled pose 在下一
  gesture 安全 home 后继续，无首帧跳变。
- P4-R003：取消输入不再写 `CameraEventAggregator._isDown`。controller/feature disable、
  stale first update 与 zero canvas 将已按下 drag 按原 press identity 隔离到真实 release，
  仅清除 movement update；held move-before-release 不续接，release 后新 press 可用，
  `_buttonsDown`/`anyButtonDown` 始终一致。
- P4-R004：middle start miss 回退 center target 时，同时把 press-time rotation window
  anchor 设为当时 viewport center；perspective、orthographic 与 direct off-center
  fixture 的 pivot 投影保持 center，target 不误 clamp 到边界。
- P4-R005：四 frustum 先验证 endpoint 和 derived span/center/slope；world/local pose 与
  orthographic scale 都在应用前完成 finite/non-degenerate preflight。`±Number.MAX_VALUE`
  finite bounds 对四 frustum helper 均在 mutation 前拒绝，`viewHome` 失败时 Camera/frustum
  identity 与字段保持不变。focused re-review 进一步发现 accepted extreme perspective
  arithmetic 的 intermediate overflow/underflow；最终把 dimensionless left/right/top/bottom
  slope 固化在 frustum info，ray/anchor 使用 unit-depth slope vector 和 max-component robust
  normalization，home/range/position 使用 division-before-multiplication 与 `Math.hypot`。
  `±1e300` bounds、near `1.5e306`、far `2e306` 的 reviewer fixture 现在成功 home，
  subnormal near/non-zero slope fixture 也得到 finite unit rays、center pick 和 home-anchor；
  四边、near/far 与 Camera transform 均保持。为避开 Cesium Camera 在超大平面坐标上无关的
  ellipsoid/cartographic 更新，world/local pose 由 private helper 直接通过 Camera transform
  转换，仍保持 identity/non-identity 既有证据。

- ordinary fixture：extent `[-128,128]²`；真实 perspective `fov=PI/3`、aspect `2`、
  near `1`、far `10000`。home 为 north-up/nadir、target `(0,0,0)`、Camera Z positive；
  四角落在 padded viewport。center left-drag 到 X=`10000` 后 target 与 center-ray hit
  精确 clamp 到 X=`-128`、Y=`0`。middle drag 保持 pivot、heading 位于
  `[0,TWO_PI)`、pitch 位于 `[-PI/2,-5°]`；wheel 保持 perspective fields，并在
  minimum 与 home maximum 间 clamp。
- large-offset fixture：extent `[999999872,1000000128]²`，center `1e9`。四种真实
  frustum × landscape `200x100`、portrait `100x200`、square `160x160` 均保持 type、
  FOV/aspect 或 off-center ratio、near/far，四角投影在 viewport 内；center pick 精确为
  `(1e9,1e9,0)`。真实 WebGL rendered-depth difference 在 `1e-3` 内。
- ControllerHost 注册/移除/重连分别创建新 aggregator；每个被移除 aggregator 只销毁
  一次。idle frame 和 release 后 Camera delta 为零；外部合法 Camera mutation 不被
  抢回，非法 pose 在下一 gesture 自动 home。legacy conflict、invalid home 和 flags
  disable 均在 planar mutation 前保持 Camera unchanged。
- 同帧输入顺序固定为 middle、否则 left，最后 wheel；right/touch-pinch 不处理，无
  inertia。Left gesture 只要求 bounded start anchor，后续使用 unbounded plane ray，
  pointer 离开 projection 后仍能连续 clamp 到 boundary。
- depth replay 重提相同 command references；重复 pass、无 prior render、hidden/zero
  buffer 均无 allocation。Context guard 位于所有 early return 前；destroy 清除 cache。

### 最终验证矩阵

| 命令                                                                                   | 结果                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTile"`                    | Exit 0，4/4                                                              |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`                 | Exit 0，18/18                                                            |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCamera"`                  | Exit 0，33/33（private 8 + controller 25）                               |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"`        | Exit 0，25/25                                                            |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                   | Exit 0，13/13                                                            |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"` | Exit 0，4/4                                                              |
| `npm run test -- --webglValidation --includeName "SceneGIS/Scene/SceneGISPlanar"`      | Exit 0，79/79                                                            |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISWorldCesiumWidget"`            | Exit 0，16/16                                                            |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarWorldCesiumWidget"`      | Exit 0，1/1                                                              |
| `npm run test -- --includeName "Scene/Camera"`                                         | Exit 0，241/241                                                          |
| `npm run test -- --includeName "Scene/CameraEventAggregator"`                          | Exit 0，16/16                                                            |
| `npm run test -- --includeName "Scene/Controllers/ControllerHost"`                     | Exit 0，1/1 SceneGIS-owned integration suite；原仓库无独立 upstream Spec |
| `npm run test -- --includeName "Scene/ScreenSpaceCameraController"`                    | Exit 0，73/73                                                            |
| `npm run test -- --includeName "Widget/CesiumWidget"`                                  | Exit 0，75/75；Node `DEP0060` warning                                    |
| `npm run test -- --includeName "Scene/Globe"`                                          | Exit 0，119/119；Node `DEP0060` warning                                  |
| `npm run test -- --includeName "Scene/Scene"`                                          | Exit 0，220/220；Node `DEP0060` warning                                  |
| `npm run build`                                                                        | Exit 0                                                                   |
| `npm run build-release`                                                                | Exit 0                                                                   |
| `npm run build-ts`                                                                     | Exit 0；仅现有批量 TSD-JSDoc warnings                                    |
| `npm run build-docs`                                                                   | Exit 0                                                                   |
| `npm run tsc`                                                                          | Exit 0                                                                   |
| scoped ESLint / JS Prettier                                                            | Exit 0                                                                   |
| SceneGIS Markdown Prettier / Markdownlint                                              | Exit 0                                                                   |
| `git diff --check`                                                                     | Exit 0                                                                   |

`SceneGISPlanarCameraController` 出现在 engine root JS、两份 generated declarations 和
API HTML；`viewHome`、`pick`、`pickFromWindowPosition` 的签名可见。private camera helper
不在 declarations/API HTML。生成文件不在 status。

相对 `4cfbf58a5658f57bba57e3ba8cd7e75ef9989439`，upstream-owned files = `0`，
P4 SGP = `0`，`.scenegis/upstream-patches.json` unchanged，P4 新增
`SCENEGIS_PATCH` marker = `0`，generated/build files in status = `0`。Execution Agent
未 commit、未 push。剩余风险限于已记录的 Cesium private Camera/frustum、
CameraEventAggregator input seam 与 Surface command replay upgrade checkpoints，以及已明确
延期的 touch/inertia/P5/P6；没有已知 P4 blocking defect。
