# ADR-0024：平面地形感知导航锚点

## 状态

- Status：`approved`
- Date：`2026-08-10`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-terrain-advanced/plans/2026-08-10-phase-a1-terrain-aware-navigation-anchors.md`
- Related patch：无；A1 只允许修改 SceneGIS-owned product files
- Supersedes：ADR-0004 与 ADR-0010 中“camera controller 只使用 Z=0 pick”的阶段性限制；
  两者定义的 public World pick、four-frustum Camera、target clamp 和 terrain query 契约保持有效
- A2 successor：[ADR-0025](ADR-0025-planar-navigation-mode-and-surface-relationship.md) 取代本ADR保留的
  Z=0 center rig与单一surface-side profile；A1 pointer anchor chain与public picking保持有效

## 上下文与源码事实

`planar-world` P4 在只有 flat Z=0 surface 时建立了
`SceneGISPlanarCameraController`。当前 left-drag、middle-drag 和 wheel 都从
`SceneGISPlanarWorld.pickFromWindowPosition` 获得 bounded Z=0 anchor：

- `_pan` 在 drag start 保存 Z=0 anchor，之后的 end ray 仍与 Z=0 求交；
- `_rotate` 在 middle press 保存 Z=0 pivot，但其 `positionForWindowAnchor` 已能围绕完整
  `Cartesian3` pivot 保持 screen anchor；
- `_zoom` 在每个 wheel update 保存 Z=0 pointer anchor，缩放后再次与 Z=0 求交并平移校正；
- `_syncRig`、`_target`、Home、center target clamp 和 range 仍属于当前 surface-side Z=0 rig。

后续 terrain T1-T6 已增加 actual Float32 terrain、normal-render query snapshot、
`world.pickTerrain`/`pickTerrainFromWindowPosition` 与 rendered-depth replay，但 ADR-0010 当时明确不改变
controller。项目负责人在真实 terrain/content Sandcastle 中确认：middle drag 的视觉旋转中心与鼠标所指
terrain 点不一致。相同根因也会使 pan/zoom 在非零 terrain 或对象位置上使用错误高度。

当前 Cesium 1.144 `ScreenSpaceCameraController` 的私有 `pickPosition` 提供可借鉴思想：它同时考虑
rendered depth 与 `Globe.pickWorldCoordinates`，让 camera gesture 使用当前可见对象或 globe surface，而
不是固定数学平面。平面实现不能直接复用该 helper，因为它依赖 Globe、Ellipsoid、Camera underground
状态和 `Camera.getPickRay`；SceneGIS 仍需使用自己的 four-frustum world ray 与 planar terrain contract。

`scene.pickPosition` 在 SCENE3D 返回 frontmost rendered depth。默认不包含不写 depth 的 translucent
geometry；应用显式启用 `pickTranslucentDepth` 时，Cesium 会执行 pick+depth pass。当前 SceneGIS surface
已保证该 pass 只重放最近 normal render 的 exact command references，不推进 selection、terrain、imagery
或资源状态。`world.pickTerrain` 读取最近成功 normal render 的 actual terrain cover，排除 skirt；它的
首版 triangle traversal 适合 fallback query，但不应在已有有效 depth 时无条件重复扫描。

## 决策

### 公共 API 保持不变

不新增或修改公共类型、property 或 method：

- `world.pick` 与 `pickFromWindowPosition` 继续是有界、render-independent 的 Z=0 数学参考平面；
- `world.pickTerrain` 与 `pickTerrainFromWindowPosition` 继续只返回 actual terrain cover，不回退 Z=0；
- `scene.pickPosition` 继续由 Cesium 定义为 frontmost rendered depth；
- `SceneGISPlanarCameraController` 的 public construction、feature flags、Home 和 ControllerHost lifecycle
  不变。

A1 只在 controller 内增加 private navigation-anchor policy。应用需要明确查询时仍直接调用上述各自 API，
不能把 controller 的内部 fallback chain 当成新的公共 pick contract。

### 私有 anchor fallback chain

每次需要建立新 gesture anchor 时，controller 先用
`SceneGISPlanarCamera.getWindowRay` 计算一次支持四种 frustum 的 world ray，再按以下顺序选择：

1. 如果 `scene.pickPositionSupported` 为 true，调用 public `scene.pickPosition(windowPosition, scratch)`。
   结果必须是 finite `Cartesian3`，并且 X/Y 位于 World inclusive extent；合法结果作为当前视觉上
   frontmost rendered-depth anchor。
2. Depth unsupported、disabled、undefined、non-finite 或 extent 外时，调用 `world.pickTerrain(ray, scratch)`。
   它只读取 actual render-cover terrain、排除 skirt，并服从现有 snapshot/revision invalidation。
3. Terrain miss 时调用 `world.pick(ray, result)`，得到 bounded Z=0 reference fallback。

合法 rendered depth 已包含当前 planar surface 的 depth，并可能表示前方 Entity/Primitive，因此不再
无条件执行昂贵 terrain triangle scan 后比较距离。这是对 Cesium globe 思想的 planar 适配，不是复制其
private helper。`pickTranslucentDepth`、`useDepthPicking` 和 depth texture capability 继续服从 Scene 配置；
A1 不在 controller 内临时修改这些 Scene properties，也不执行 color/object pick。

Depth point 可以来自对象或可见 skirt，这是“视觉锚点”的既定含义；只有 depth 不可用时，terrain fallback
才保证 skirt-excluded terrain 语义。Extent 外 depth 不允许扩大 planar navigation boundary。

Resolver 不创建 request、tile、mesh、GPU resource 或 render command，不修改 query snapshot、LRU、
`tilesLoaded` 或 Scene selection。异常的 Scene/camera/frustum 继续由既有 validation fail-fast；合法 miss
只进入下一 fallback。

### Gesture 生命周期与高度平面

- Pan：left press 的 anchor 只解析一次并保存到真实 release/cancel。每次 movement 的 end ray 与
  `Z=anchor.z` 的无限水平面求交，再平移 Camera 使同一 world anchor 保持在 pointer 下。Miss 或平行/
  backward intersection 本帧不修改 Camera，也不调用 Home。
- Rotate：middle press 的 pivot 只解析一次并保存。既有 full-Cartesian3
  `positionForWindowAnchor` 围绕该 pivot 更新 heading/pitch；miss 继续使用 viewport center 上的现有
  `_target` fallback。A1 不改变 pitch、roll、surface-side Z 或 target clamp 规则。
- Zoom：每次 wheel movement 在 pointer 解析一个 anchor。Perspective range 或 orthographic span 更新后，
  pointer ray 与 `Z=anchor.z` 的水平面求交并做一次 anchor-preserving translation。无 anchor 时继续围绕
  现有 center target 缩放。

Pan/rotate 的 anchor 在一次 drag 内保持不变，即使 normal render 发布新 terrain LOD；这样异步 replacement
不会让正在进行的手势跳动。下一次 gesture 重新读取最新 depth/terrain。Wheel 本身没有 held lifecycle，
每个 movement 独立解析。

水平面求交必须使用有限 height 和 overflow-safe arithmetic，允许正、负 anchor Z；它不是 terrain tangent
plane，也不会在 movement 过程中重新采样坡面。该选择保持平面 XY 拖动直观、避免异步 LOD 漂移，并把
法向/碰撞/underground relationship 留给 A2/A3。

### 保留的 A2/A3 边界

A1 不改变以下现有行为：

- `_target`、center synchronization、Home、extent clamp 和 range 仍基于 Z=0 reference plane；
- 当前 controller 仍是 surface-side profile，`_syncRig` 对 camera Z、pitch 和 roll 的恢复规则不变；
- 不增加 navigation mode、terrain clearance、continuous collision、穿越检测、防穿透或 underground
  transition；
- 不改变 programmatic `Camera`、Viewer tracking/flight 或 content selection。

因此 A1 可以修复非零 terrain/object anchor，而不会用局部碰撞规则阻断未来合法地下导航。A2 先定义
surface/underground mode，A3 再实现模式感知 collision。

### 内存、所有权与实现位置

Anchor resolver 与 horizontal-plane intersection 默认保持为
`SceneGISPlanarCameraController.js` 的 file-scope private helper；三种 gesture 共享同一 resolver。
Controller-owned anchor/scratch object 应复用，wheel hot input 不新增每次事件的 `Cartesian3` allocation。
只有实现证明 helper 必须跨文件共享时，才可增加正确标记 `@private` 的 `_SceneGIS*` 模块；不得为 A1
增加 public export。

A1 不修改 World、Surface、Terrain query、Shader、Worker、build、Widget/Viewer product source 或
upstream-owned file。预计 upstream-owned files=`0`、A1 SGP=`0`。

## 不采用的方案

### 修改 public `world.pickFromWindowPosition` 使其 terrain-aware

拒绝。它会把确定性的 render-independent Z=0 API 变成依赖 depth/LOD/snapshot 的动态 API，破坏既有
调用方与 ADR-0010 的职责表。

### 三种 gesture 各自直接改用 `pickTerrainFromWindowPosition`

拒绝。它无法优先使用可见对象 depth，在 terrain snapshot 不可用时没有 flat fallback，也会保留 pan/zoom
后续仍与 Z=0 求交的实际错误。共享 resolver 与 anchor-height plane 才能关闭完整根因。

### 每帧或每个 drag movement 重新拾取 terrain

拒绝。异步 LOD、provider replacement 和 depth cache 会让 anchor 在手势中漂移；terrain triangle scan 也会
进入 pointer hot path。Drag anchor 必须在 gesture start 固定。

### 无条件同时查询 depth 与 terrain，再选择最近点

首版不采用。Planar terrain command 已写入 normal depth；有效 in-extent depth 已代表 frontmost depth-writing
surface/object。无条件 terrain scan 会重复工作，并把 T4 的低频线性 triangle query 放到每个 wheel event。
若后续真实证据发现 depth 与 visible planar surface 可重复不一致，再独立设计距离比较或 query acceleration。

### 在 A1 同时增加 collision 或允许 camera 穿越 surface

拒绝。Anchor accuracy 与 camera-surface policy 是不同职责；在 mode contract 之前加入防穿透会再次把合法
underground 状态误判为错误。

## 测试与最小验证

- Controller deterministic Specs：depth/terrain/Z=0 顺序、depth capability/extent validation、正负非零 Z、
  result/scratch reuse 和无额外 terrain call。
- 三种 gesture：pan 与 zoom 使用 anchor-height plane，rotate 保持 full 3D pivot；覆盖 perspective、
  orthographic、一个 off-center representative、large-offset、miss 与边界 clamp，不重复既有全部 frustum
  home 矩阵。
- Input lifecycle：drag anchor 只解析一次，release/cancel 后下一 gesture 更新；feature disable、zero canvas、
  middle-priority 与 no-inertia 既有契约不退化。
- Real Context：确定性非平坦 terrain 先证明 `scene.pickPosition`、`world.pickTerrain` 和 actual mesh 在
  tolerance 内闭环，再执行至少一次 middle drag，证明真实 terrain pivot 与 press pixel 保持、public Z=0
  pick 仍为 Z=0，terrain selection/request/resource counters 不因 anchor query 变化。
- 最小命令：controller、A1 terrain-navigation integration、现有 World terrain query 与 navigation depth
  regression、`npm run build`、scoped ESLint/Prettier、SceneGIS Markdownlint、`git diff --check` 和 upstream
  audit。无 public API、build、Shader 或 Worker 变化，因此不要求 build-ts/build-docs/tsc/full Viewer/Globe。
- Architecture review 通过后，项目负责人在现有 terrain/content Sandcastle 复测 middle pivot，并抽查 pan/
  wheel anchor；人工结果是 A1 phase 完成门禁。

## 升级检查点

每次 Cesium 升级复核：

- `Scene.pickPosition`、`pickPositionSupported`、`useDepthPicking`、`pickTranslucentDepth` 和 depth cache 的时序；
- upstream `ScreenSpaceCameraController.pickPosition` 的 depth/globe 选择是否出现可复用的非 Globe 抽象；
- ControllerHost 在 current normal render 前更新 controller 的顺序；
- SceneGIS surface normal/depth replay 与 terrain query snapshot 的发布、失效和 no-mutation 语义；
- four-frustum world ray、Camera transform 和 anchor-height intersection 在大坐标下的精度。
