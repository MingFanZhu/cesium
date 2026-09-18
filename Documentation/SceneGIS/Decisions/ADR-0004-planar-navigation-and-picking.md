# ADR-0004：平面导航、相机约束与 Surface Picking

## 状态

- Status：`approved`
- Date：`2026-08-05`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-world/plans/2026-08-05-phase-4-planar-navigation.md`
- Related patch：无；P4 禁止修改 upstream-owned file
- P7 amendment：`2026-08-06`，修正真实 browser wheel normalization、boundary
  synchronization 与 pitch round-trip；不改变 public picking contract
- A1 successor：`2026-08-10`，[ADR-0024](ADR-0024-planar-terrain-aware-navigation-anchors.md)
  取代controller只使用Z=0 gesture anchor的阶段性限制；public Z=0 pick、Home与target clamp保持不变
- A2 successor：`2026-08-10`，[ADR-0025](ADR-0025-planar-navigation-mode-and-surface-relationship.md)
  取代单一surface-side/Z=0 center rig；public World picking与Home语义保持不变
- Inertia successor：`2026-09-18`，[ADR-0079](ADR-0079-planar-camera-inertia.md)
  取代下文 P4 的无惯性阶段限制；平移、旋转与滚轮默认使用与 Globe 相同的惯性系数和衰减参数

## 上下文与源码事实

P3 已实现 `SceneGISPlanarWorld`、有界 `Z=0` 双面平面、四种 frustum 下的
surface rendering、LOD 和资源生命周期。平面世界只支持 `SceneMode.SCENE3D`，坐标
采用完整的米制 `Cartesian3`，轴向固定为 X east、Y north、Z up。

Cesium `ScreenSpaceCameraController` 是具体的 Globe-oriented controller，不是可替换
的通用接口。当前 `Scene` 会固定创建 `_screenSpaceCameraController`，在
`initializeFrame` 中独立调用其 `update()`，并在 Scene 销毁时销毁它。它的 3D pan、
spin、zoom、tilt 和 collision 路径会读取 ellipsoid、cartographic、geodetic normal、
ray-ellipsoid intersection 和 ENU 等球面语义。即使 Scene 没有 Globe，这些路径仍会
回退到 Scene ellipsoid，不能表示真正的任意米制平面 CRS。

Cesium 同时提供了公共 `Controller` structural interface 和 `ControllerHost`：

- `scene.controllerHost.registerController(controller, element, priority)` 调用
  `connectedCallback`，并在首个启用帧依次调用 `firstUpdate` 和 `update`；
- `unregisterController` 调用 `disconnectedCallback`；
- `CesiumWidget.addController`、`removeController` 已公开转发上述生命周期；
- ControllerHost 不把 legacy `screenSpaceCameraController` 纳入同一槽位，也不会自动
  替调用方销毁仍注册的 controller。

因此 P4 可以在 SceneGIS-owned 路径实现独立平面 controller，但必须显式禁止 legacy
controller 同时处理输入。把新的平面类型直接赋给
`scene.screenSpaceCameraController` 会破坏该属性的既有具体类型和球面专用公开属性，
也需要扩大 `Scene` 的创建、更新、销毁和类型契约。

当前 `Camera.getPickRay` 只在 frustum 同时具有 `aspectRatio`、`fov` 和 `near` 时进入
perspective helper。直接设置的 `PerspectiveOffCenterFrustum` 不满足该 structural
判断，会落入 orthographic helper。P4 已承诺支持 `PerspectiveFrustum`、
`PerspectiveOffCenterFrustum`、`OrthographicFrustum` 和
`OrthographicOffCenterFrustum`，因此不能把 public planar window picking 建立在该
方法对四种类型都正确的假设上。

`scene.pickPosition` 和 `scene.pickPositionWorldCoordinates` 使用当前 rendered depth
重建 frontmost world position，在 `SCENE3D` 中不要求结果具有地球语义；但它们依赖
depth texture、当前 render result 和遮挡关系。平面 surface 的数学拾取必须与该深度
拾取保持不同契约。

## 决策

### Controller 架构

新增公共 `SceneGISPlanarCameraController`。它结构化实现 Cesium `Controller`，通过
`scene.controllerHost` 或 `CesiumWidget.addController` 注册，不继承、不复制，也不
替换 `ScreenSpaceCameraController`。

构造形式：

```text
new SceneGISPlanarCameraController({
  world,
})
```

- `world` 必须是未销毁的 `SceneGISPlanarWorld`，并作为只读引用保存。
- `enabled`、`enablePan`、`enableRotate` 和 `enableZoom` 默认为 `true`。
- `homePadding` 默认为 `1.05`，必须是 finite number 且大于等于 `1.0`。
- `viewHome(scene)` 是唯一的 P4 programmatic navigation method，立即设置视图，不创建
  flight、Tween 或 Earth rectangle。它在任何 pose/frustum mutation 前执行与启用
  controller 相同的 world、mode、frustum 和 legacy-input validation。
- `target`、`heading`、`pitch` 和 projection-specific view scale 在 P4 保持私有，
  避免调用方分别修改后形成不一致 rig。后续若需要 programmatic arbitrary view，使用
  一次性校验全部状态的 `setView(options)`，不增加可分别写入的状态属性。

把 `enabled` 或某个 per-feature flag 设为 `false` 时，立即取消其 active gesture并清除
未消费 delta；重新启用不能重放禁用期间或旧 gesture 的输入。

`connectedCallback(element)` 创建并独占一个输入 aggregator；
`disconnectedCallback(element)` 释放它、清除 gesture state，并允许同一实例在完成
移除后重新连接。一个实例不能同时连接多个 element 或绑定多个 Scene。当前
`ControllerHost.registerController` 不检查重复实例，并且先写入 host list 再调用
`connectedCallback`，因此 P4 把“同一实例必须先 unregister 再重新 register”定义为
调用方前置条件，不宣称能在 controller 内对错误的重复注册做原子回滚。资源释放必须
exactly once；P4 不假定 `ControllerHost` 会自动销毁 controller。显式集成路径必须在
Widget/Scene destroy 前先 remove controller。

`firstUpdate(scene)` 和每次会处理输入的 `update(scene)` 在任何 Camera mutation 前
验证。这里的 fail-fast 只保证 planar controller 自身不会继续 mutation；legacy
controller 在 Scene lifecycle 中更早独立更新，因此调用方必须在注册前关闭它，P4
不能回滚已经由 legacy path 造成的 Camera 变化。验证项为：

- `scene.world === controller.world`；
- Scene 和 world 均未销毁；
- `scene.mode === SceneMode.SCENE3D`；
- Camera 使用四种明确支持的 frustum 之一；
- `scene.screenSpaceCameraController.enableInputs === false`。

当平面 controller 启用而 legacy controller 仍启用时抛出 `DeveloperError`。P4 不
静默关闭或恢复 legacy controller，避免两个不同 owner 争用该状态。P6 的
CesiumWidget/Viewer 自动集成负责把关闭 legacy controller、注册 planar controller
和最终销毁组合成透明生命周期。

`scene.screenSpaceCameraController` 保留其 Cesium 具体类型；P4 只替代它在平面世界中
的输入职责。如果未来需要统一访问当前 primary navigation controller，应设计新的
通用入口，不能改变旧属性的类型含义。

### Navigation Rig 与坐标语义

所有导航数学使用 world-space `Cartesian3` 和 `Z=0` 平面，不读取
`positionCartographic`、ellipsoid normal、map projection 或 ENU transform。

navigation target 定义为实际 viewport center pixel 对应的 ray 与 `Z=0` 平面的交点。
这条 center ray 是 navigation axis：

- 普通 perspective 中通常与 `camera.directionWC` 相同；
- `PerspectiveOffCenterFrustum` 中不能假定二者相同；
- orthographic ray 方向平行，但 `OrthographicOffCenterFrustum` 的 center-ray origin
  可以相对 Camera position 偏移。

`heading` 从世界 `+Y` 开始，朝 `+X` 顺时针增加，与 Cesium heading 习惯一致。
`pitch` 沿用 Cesium 从 XY plane 计量的符号：垂直下视为 `-Math.PI / 2`，接近地平线
为 `0`。`roll` 恒为 `0`。controller 不改变或重定义整个 CRS origin。

permanent target 的 Z 恒为零，XY 分别 clamp 到 coordinate-system extent 的闭区间。
约束的是 center target 或当前 gesture pivot，不要求整个 viewport footprint 始终落在
extent 内。强制全部屏幕 footprint 留在有界平面中会在倾斜视角和地平线附近产生跳变，
不属于 P4 contract。Camera position 可以在倾斜时位于 extent XY 外，但必须保持在
`Z=0` 之上。

controller 在 idle frame 不持续重写 Camera。调用方直接修改 Camera 后，下一次输入
gesture 开始时从实际 world-space pose 和 center ray 重新同步 rig。只有 pose、frustum
或 plane intersection 无法形成有效 planar view 时才回到 home。

同步使用 SceneGIS private four-frustum window ray 与无限 `Z=0` plane 求交。该 prospective
center target 即使位于配置 extent 外也仍是有效 planar view；controller 对它执行 inclusive
target clamp 并整体平移 Camera，而不是调用 `viewHome`。public
`SceneGISPlanarWorld.pickFromWindowPosition` 继续保持 bounded surface contract，不能被内部
navigation intersection 复用或放宽。

pose 同步必须同时分解 `directionWC`、`upWC` 和 `rightWC`。非垂直视角以 direction
确定 heading，并相对期望的 zero-roll axes 检验 roll；真正的 non-zero roll 或非正交
axes 不满足 planar invariant。exact nadir 的 direction XY 为零，此时 heading 从
screen up/right 的 world orientation 恢复，因此合法的非零 heading 不会在下一 gesture
跳回零。该规则对 identity 与 non-identity Camera transform 相同。

### Home View

`viewHome(scene)` 使用不会产生 `minimum + maximum` 中间溢出的 extent center，并
建立：

```text
target  = extent center at Z=0
heading = 0
pitch   = -Math.PI / 2
roll    = 0
```

屏幕上方对应世界 `+Y`。home fit 使用真实 canvas aspect 和实际 frustum 四边，不把
off-center frustum 假定为左右或上下对称。

- perspective 保持 frustum type、FOV/off-center slopes、near 和 far，通过 Camera 与
  plane 的距离适配 extent；
- `OrthographicFrustum` 保持 type、aspect、near 和 far，通过 width 适配；
- `OrthographicOffCenterFrustum` 对 left/right/top/bottom 应用同一正比例，保持原有
  normalized off-center ratio；
- `homePadding` 应用于完整 extent fit，默认 `1.05`；
- extent 的全部四角必须位于 padded viewport 内；
- 如果现有 near/far 无法容纳计算得到的 home pose，抛出明确
  `DeveloperError`，不静默改变 clipping range。

四种 frustum 都必须在任何 Camera/frustum mutation 前验证 endpoint 以及由其推导的
span、center 和 perspective slope 为 finite、positive/non-degenerate。`viewHome` 先
完整计算并验证 prospective home pose 和 orthographic scale，之后才应用；失败时保持
原 Camera 与 frustum identity/state。

首个 `firstUpdate` 保留已经满足全部 planar invariant 的调用方 Camera；否则调用
home。zero-sized canvas 不产生除零或无效 Camera mutation，并等待后续有效 frame。

### PC 输入映射

P4 固定支持 PC mouse，不开放任意 input remapping：

| 输入          | 行为                                          |
| ------------- | --------------------------------------------- |
| Left drag     | 平面平移                                      |
| Middle drag   | 围绕平面 pivot 修改 heading 和 pitch          |
| Wheel         | 以 pointer 对应平面位置为优先锚点进行比例缩放 |
| Right drag    | P4 不绑定                                     |
| Touch / pinch | P4 不处理                                     |

`CameraEventAggregator` 可以监听更多底层事件，但 P4 controller 只消费上述 PC mouse
输入。P4 不实现 pan、rotation 或 zoom inertia；mouse release 后 Camera 不再因该
gesture 改变。输入按钮的一致性不表示复制 legacy Globe controller 的球面算法。

controller/feature disable、first update stale input 与 zero-sized canvas 会把当时仍按下的
drag 隔离到真实 release；隔离只丢弃 movement，不伪造 `_isDown` 或 `_buttonsDown`，因此
release 后的新 press 能开始新 gesture，`anyButtonDown` 仍反映 aggregator 的真实状态。

Left drag 在按下时通过有界 surface pick 获取 world anchor。按下点位于 extent 外、ray
平行或交点无效时，本次 pan 不启动。拖动期间在没有 boundary correction 时，同一 world
anchor 保持在 pointer 下方。gesture 已经由 bounded anchor 启动后，后续 pointer ray
使用 private unbounded `Z=0` intersection 计算 translation；否则 pointer 一离开当前
surface projection 就无法继续把 target 推到边界。该内部计算不改变 public bounded
pick contract。到达 extent 后优先 clamp center target，允许 anchor 停止严格跟随
pointer。pan 不改变 heading、pitch、roll 或 view scale。

Middle drag 在按下时优先选择 pointer 下的有界 planar pick 作为 gesture pivot；没有
surface hit 时使用当前 target。整个 gesture 中 pivot 固定。水平 mouse delta 修改
heading，垂直 delta 修改 pitch。没有 boundary correction 时，pivot 应保持其按下时的
screen-space location，避免开始旋转时跳变。gesture 后重新求 center target 并应用
extent clamp。

当 press miss 并回退到当前 center target 时，pivot 的 press-time screen anchor 是当时
的 viewport center，而不是 miss pointer；成功 pick 时才使用 pointer 作为 anchor。

Wheel 使用指数比例而不是固定米数增量。pointer 有 bounded surface hit 时，该位置是
zoom anchor；否则回退当前 target。没有 boundary correction 时，anchor 在 zoom 前后
保持同一 screen position。

真实浏览器 `WheelEvent` 先由 `ScreenSpaceEventHandler` 把标准 `deltaY` 反向规范为 wheel
delta，再由 `CameraEventAggregator` 转成 movement：向前滚动最终得到正的
`endPosition.y - startPosition.y`。P7 固定使用 canvas viewport 高度归一化：

```text
diff = endPosition.y - startPosition.y
ratio = clamp(diff / canvas.clientHeight, -0.1, 0.1)
factor = exp(-5.0 * ratio)
```

因此向前滚动使 range/span 变小，向后滚动使其变大。比例上限约束单帧大 delta，small
trackpad-like delta 保持连续；不增加 public speed option。

- perspective zoom 改变 Camera 到 navigation plane/anchor 的距离，不修改 frustum；
- `OrthographicFrustum` 修改 width；
- `OrthographicOffCenterFrustum` 同比例缩放四边，不改变其 off-center ratio；
- wheel direction 与 Cesium 默认 mouse wheel zoom 方向一致。

同一 update 中只允许一个 drag operation：middle rotation 优先于 left pan；存在有效
middle movement 时忽略该帧 left movement。wheel 在 drag 之后处理，以处理完成后的
Camera/target 重新选择 zoom anchor。该顺序固定并由 Specs 锁定。

### Camera 约束与缩放范围

- heading 规范化到 `[0, CesiumMath.TWO_PI)`；
- pitch clamp 到 `[-Math.PI / 2, -CesiumMath.toRadians(5.0)]`；
- roll 保持 `0`；
- Camera 不得穿过或落在 `Z=0` 平面；
- center target 使用 inclusive extent clamp；
- 最大 view range 是当前 canvas/frustum 对应的 home view；
- 最小 view range 由坐标 ULP、Camera-plane distance、viewport 和 frustum 共同得到
  precision-safe internal floor，不能退化为零、`NaN` 或不可逆矩阵；
- P4 不把 arbitrary minimum/maximum view size 暴露为公共属性。

从 Camera axes 分解 pitch 时允许一个仅覆盖浮点 round-trip 的窄 angular tolerance，随后将
controller state clamp 回精确边界。out-of-pitch-tolerance、axes 仍合法但 center ray 与平面
parallel、Camera 位于平面下方或 non-zero-roll 的 pose 走安全 home recovery。non-finite 或
degenerate Camera axes 由 four-frustum helper 在 mutation 前抛出 `DeveloperError`；P7 不捕获或
降级该 P4 fail-fast contract。Camera 必须位于 `Z=0` 上方只是当前
`SceneGISPlanarCameraController` 的 surface-side profile，不是 `SceneGISPlanarWorld`、
double-sided surface、imagery 或 mathematical picking 的永久负 Z 禁令；地下导航需要后续
独立架构设计。

canvas resize 不自动调用 home，也不在 idle frame改变 Camera。下一次 home 或输入开始
时重新计算当前 canvas 下的 home maximum 和 numerical minimum。

perspective range 使用 Camera 到 viewport-center target 的 center-ray distance，是与
pointer anchor 无关的 projection-scale metric。home maximum 由当前 frustum slopes、
viewport、extent 和 `homePadding` 纯计算得到，不依赖先调用 `viewHome`，也不缓存跨越
frustum、padding 或 resize 变化的旧值。pointer pick 只用于缩放后的 XY anchor correction，
不能改变 range clamp 的度量。

perspective helper 在 bounds validation 后保存 `bound / near` 的 dimensionless slopes。
window ray 与 rotation anchor 以 unit-depth vector
`direction + right * xSlope + up * ySlope` 构造，并通过 max-component scaling 后 normalize；
home fit 使用 `halfSize / slopeMargin`，off-center pose 使用
`distance * centerSlope`，center range 使用
`distance * hypot(centerSlopeX, centerSlopeY, 1)`。该运算顺序不得用 raw `near` scale
vector 或先乘后除代替，以保证 huge near 与 subnormal near 在最终结果可表示时不因
intermediate overflow/underflow 失败。world/local Camera pose conversion集中在同一 private
helper 并直接应用 Camera transform，不触发与 planar CRS 无关的 ellipsoid/cartographic
派生状态。

### Surface Picking 公共契约

在 `SceneGISPlanarWorld` 增加：

```text
world.pick(ray, result)
world.pickFromWindowPosition(windowPosition, scene, result)
```

这两个方法属于 bounded flat `SceneGISPlanarWorld` 的具体能力，不加入 P1
`SceneGISWorld` primary-world lifecycle structural contract，也不要求未来非平面 world
伪造相同 surface semantics。

`pick(ray, result)` 是 render-independent world-space surface intersection：

- ray origin/direction 和结果均使用完整米制 `Cartesian3`；
- direction 必须 finite 且 non-zero，但不要求预先 normalize；交点不得依赖 direction
  magnitude；
- 与无限 `Z=0` plane 求交后，再按 inclusive extent 检查 bounded surface；
- extent 的四条边和四个角均属于 surface；
- 支持从平面上方或下方射入；
- 交点位于 ray 反方向、非有限、extent 外时返回 `undefined`；
- 非零但与 plane 平行的 ray 返回 `undefined`；共面 ray 同样返回 `undefined`，避免
  infinite-intersection 歧义；
- origin 已位于 plane 且 direction 不平行时，`t=0` 是合法 hit；
- 缺失 ray、非有限 component、zero direction 或 destroyed world 抛出
  `DeveloperError`；
- optional `result` 必须复用并由方法返回。

`pickFromWindowPosition(windowPosition, scene, result)` 使用 Cesium canvas-relative
window coordinates，根据明确的四种 frustum 构造正确 world ray，再委托
`world.pick`。它要求 `scene.world === world`、`SCENE3D`、未销毁对象、finite
window position 和 supported frustum。zero-sized canvas 返回 `undefined`，不修改
result。finite 但位于 canvas bounds 外的坐标可以形成 ray，最终是否命中仍由 bounded
surface 决定。

P4 的 frustum/pick helper 保持 SceneGIS private。它不能 monkey patch
`Camera.getPickRay`，也不能修改 upstream Camera classification。

### 与 Depth Picking 的边界

`world.pick` 和 `world.pickFromWindowPosition` 只返回 flat base surface 的数学交点，
不返回 Primitive、Entity、3D Tiles、feature 或未来高程 surface。

`scene.pickPosition` 保持 Cesium 既有 frontmost rendered-depth 语义。P4 不修改其实现，
只在支持 depth reconstruction 的 WebGL fixture 中验证：仅有 P3 opaque flat surface
可见时，depth position 与 planar mathematical pick 在规定 tolerance 内一致。以后在
surface 前方出现 object 时，两者允许且应当不同。

为满足该一致性，P4 采用 Architecture Agent 批准的 P3 Surface correction：normal
render 缓存最近一次实际提交的 planar DrawCommand references；Cesium
`pickPosition` 使用的 `passes.pick && passes.depth` 路径只重提这些 command，不重新
执行 visibility/SSE/LOD selection，不创建 tile、GPU resource 或 DrawCommand，也不
改变 LRU、protected set 和 normal-render statistics。该 replay 不扩展 generic
`passes.pick`，不提供 object/feature picking。

rendered depth 还依赖 ADR-0003 修订后的双包围体职责：quadtree 继续使用 exact
zero-thickness OBB，DrawCommand 使用从该 OBB 一次性派生的 conservative
`BoundingSphere` 做 Scene command culling 与 near/far fitting。真实 quad、model
matrix 和数学 surface 仍严格位于 `Z=0`，没有 epsilon 或物理厚度。真实 WebGL
logarithmic 与 linear depth fixtures 都必须证明 `0 < rawDepth < 1`，再比较
`scene.pickPosition` 与 mathematical pick。

## 备选方案与取舍

### 直接替换 `scene.screenSpaceCameraController`

拒绝。该属性具有具体 `ScreenSpaceCameraController` 类型和大量 Globe-oriented public
settings。替换会破坏类型与兼容性，或者迫使 planar controller 伪造无意义的
ellipsoid/collision API。P4 使用 ControllerHost 替代行为职责，不篡改旧属性类型。

### 在 legacy controller 中增加 planar branches

拒绝。文件规模大且 pan/spin/zoom/tilt 广泛共享 ellipsoid/cartographic assumptions，
会形成高冲突 upstream fork，并使每次 Cesium 升级都难以证明球面和平面分支互不影响。

### 复用 Cesium Camera 的 Earth home/HPR API

拒绝。`flyHome`、rectangle framing、`lookAt` 和 heading/pitch/range helpers 会使用
Earth rectangle、ellipsoid 或 ENU。P4 直接使用 world Cartesian axes 和真实 frustum
几何。

### 只公开 `world.pick(ray)`

不采用。它与 `Globe.pick` 相似，但调用方通常需要依赖 `Camera.getPickRay` 从 pointer
构造 ray，而当前 direct `PerspectiveOffCenterFrustum` 路径不正确。增加明确命名的
`pickFromWindowPosition` 才能兑现四 frustum 的 public picking contract。

### 用 `scene.pickPosition` 代替 surface pick

拒绝。depth pick 依赖 render result、depth support、遮挡和当前内容，不能作为 bounded
flat mathematical surface 的确定性接口。

### 约束整个 viewport footprint

拒绝。有限平面、倾斜视角和接近地平线的组合会产生不稳定修正。P4 约束 navigation
target/pivot，并允许 extent 外 background 可见。

### P4 同时实现触摸和惯性

延期。先用 PC mouse 锁定四 frustum 的 pointer anchoring、boundary、projection scale
和外部 Camera resync。触摸与 inertia 是可独立增加的输入策略，不应阻塞核心数学契约。

## 兼容性与所有权

P4 只新增或修改 SceneGIS-owned Source、Specs、Documentation 和 AgentDocs。预计
upstream-owned files 为 0，P4 SGP 为 0，`.scenegis/upstream-patches.json` 不变。

`SceneGISPlanarCameraController` 和 `SceneGISPlanarWorld` 新增的方法通过现有 engine
basename generator 进入 root export/types/API docs。projection、frustum、rig 和 input
helper 使用 `_SceneGIS*` basename、`@private` 或 file-scope function，不进入 public
declarations/API HTML，不形成兼容性承诺。

P4 的 explicit registration 是 engine-level integration seam，不是最终 Viewer UX。
P6 才负责 automatic controller ownership、Globe-only widget suppression、HomeButton、
Sandcastle 和 Viewer public construction path。

## 测试要求

- 纯数学 Specs：四 frustum window ray、bounded plane intersection、inclusive edges、
  coplanar/parallel/behind、above/below、result reuse、large coordinate offset。
- home Specs：四 frustum、landscape/portrait、off-center asymmetry、padding、large offset、
  near/far preservation 和 impossible clipping range。
- interaction Specs：left anchor pan、middle fixed pivot、wheel anchor、boundary clamp、
  pitch limit、zero roll、home/minimum scale 和 release-without-inertia。
- lifecycle Specs：register/unregister/reconnect、wrong world/mode/frustum、legacy conflict、
  disabled no-op、zero canvas、external Camera resync 和 cleanup exactly once。
- WebGL integration：交互后 surface pixel/command 正常；支持 depth position 时，与
  mathematical surface pick 一致。
- 回归：P1/P3 SceneGIS Widget、CesiumWidget、Scene、Camera、
  ScreenSpaceCameraController 和 Globe。
- public controller、world methods、types 和 docs 可见；private helper 隐藏；生成文件
  不进入 diff。

P4 不以人工鼠标操作或 Sandcastle 代替自动化 Specs。

## 升级检查点

每次 Cesium 升级检查：

- `Controller`、`ControllerHost`、`CesiumWidget.addController/removeController` 的
  lifecycle、priority 和 destruction 行为；
- legacy `ScreenSpaceCameraController` 是否仍由 Scene 独立更新，以及是否出现真正
  planar/generic navigation contract；
- `Camera.getPickRay` 对四种 frustum 的 type classification 和 off-center math；
- perspective/orthographic frustum public fields、projection matrices和 resize 更新；
- Camera world/local transform、`positionWC`、`directionWC`、`upWC` 和 `rightWC`；
- `CameraEventAggregator` movement/reset/destroy protocol；
- `Scene.pickPositionWorldCoordinates` 的 depth support 和 result coordinate space。

只有 upstream 提供语义等价、四 frustum 正确且不重新引入球面假设的抽象时，才评估
删除 SceneGIS private projection/navigation helper。
