# ADR-0014：平面锚点内容与普通 Model Visualizer

## 状态

- Status：`approved`
- Date：`2026-08-09`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-09-phase-c2-anchor-and-model.md`
- Related patch：无；C2 必须保持 upstream-owned files=`0`、SGP=`0`

## 上下文与源码事实

ADR-0013 已确定平面内容使用米制 `Cartesian3`、固定 X east/Y north/Z up 轴、三个
`HeightReference` 值和 resident terrain/Z=0 fallback。C1 已实现私有
`_SceneGISPlanarPositionResolver`，但尚未让任何 Entity graphic 进入渲染。

Cesium 1.144 当前实现具有以下约束：

- 默认 `BillboardVisualizer`、`LabelVisualizer` 在非 `HeightReference.NONE` 时最终进入
  Billboard 的 ellipsoid clamping；默认 `PointVisualizer` 也会为非 `NONE` 的 Point 切换到该
  Billboard 路径。
- 默认 `ModelVisualizer` 使用 `Entity.computeModelMatrix`。Entity 未定义 orientation 时，该方法
  创建位置相关的 ECEF east-north-up frame；低层 `Model.heightReference` 同样依赖 ellipsoid、
  Cartographic 和 `Scene.getHeight/updateHeight`。
- `DataSourceDisplay` 已支持 constructor-level `visualizersCallback`，但现有 planar Viewer 路径尚未
  注入该 callback。Private global `registerVisualizer` 只能追加类型，无法安全替换消费同一 graphic 的
  默认 visualizer。
- `EntityCluster` 在 disabled 路径可以作为 Point、Billboard、Label collection/pool owner 使用；
  enabled clustering 路径会读取 `camera.positionCartographic`、`scene.ellipsoid` 并构造
  `EllipsoidalOccluder`，不满足 planar contract。
- `Model.fromGltfAsync`、`scene.primitives` 和 Model 的动态属性提供了不经过默认 Entity transform/
  height clamp 的低层组合能力。传入 `scene` 主要服务 Model height clamping；C2 可以不进入该路径。

因此，C2 可以复用 Entity/Property、EntityCluster 的 disabled collections、Primitive/Model 与 Scene
生命周期能力，但不能直接复用四个默认 Globe visualizer，也不能靠预处理 Entity Property 掩盖其
ellipsoid 假设。

## 决策

### 私有运行时与阶段边界

C2 新增两个 SceneGIS-owned private visualizer：

```text
_SceneGISPlanarAnchorVisualizer
_SceneGISPlanarModelVisualizer
```

二者遵循 Cesium Visualizer 的 `update(time)`、`getBoundingSphere`、`isDestroyed` 和 `destroy`
生命周期习惯，但不是 supported public API，必须使用 `@private`，不得进入 `.d.ts` 或 API HTML。

C2 只验证显式构造的 visualizer。它不修改 `DataSourceDisplay`、`CesiumWidget` 或 Viewer，不让
`viewer.entities` 自动获得 planar rendering，也不运行默认 visualizer 与 SceneGIS visualizer 的混合
路径。C4 将依据届时源码通过 instance-owned `DataSourceDisplay.visualizersCallback` 或另行批准的窄
集成缝隙统一安装 C2/C3 visualizer，并执行 aggregate compatibility allowlist。

### Anchor visualizer

`_SceneGISPlanarAnchorVisualizer` 在一个实例内处理 Point、Billboard 和 Label：

- 构造接收 live `SceneGISPlanarWorld`、Scene、caller-owned `EntityCluster` 和
  `EntityCollection`；完成全部 validation 后才订阅 collection 或取得 slot。
- 只接受 `entityCluster.enabled === false`。Enabled clustering 在任何 collection/resource mutation
  前抛英文 `DeveloperError`；C2 不实现 planar clustering。
- 使用 `EntityCluster` 现有 get/remove pool 管理 `PointPrimitive`、Billboard 与 Label slot，但不拥有、
  不销毁 `EntityCluster` 或它的 collections。
- 每个 graphic 单独调用 C1 resolver。低层对象始终接收已解析的绝对 `Cartesian3`，其
  `heightReference` 固定为 `HeightReference.NONE`。Point 在三个受支持高度模式下始终使用
  `PointPrimitive`，不切换为 Billboard。
- 保留原始 Entity 作为低层对象的 `id`，使 `scene.pick` 返回既有 Entity identity。
- 遵守 `Entity.isShowing`、availability、graphic `show`、动态 Property 与 inclusive extent。合法但
  extent 外位置隐藏，不 clamp、不触发 camera Home。
- 每次 normal `update(time)` 重新解析 resident terrain height；不订阅 terrain、不发请求、不持有
  terrain cache，也不改变 `world.tilesLoaded`。
- 临时 `show=false`、position undefined 或 extent 外时隐藏并保留已取得 slot，避免每帧 churn；Entity、
  对应 graphic 或 position Property 被移除，以及 visualizer destroy 时才归还 slot。
- 支持当前 `PointGraphics`、`BillboardGraphics`、`LabelGraphics` 中能直接映射到对应低层对象且不引入
  Globe 语义的属性。Billboard `alignedAxis` 按固定 planar world axis解释。具体映射由 C2 Spec 固定并
  回写使用文档。

单个 Entity 可以同时拥有 Point、Billboard 和 Label；各 graphic 拥有独立 slot 和解析结果。任何已知
非法 position、HeightReference 或 property 值必须在该 graphic 首次取得/修改 slot 前失败。

### Model transform 与属性范围

`_SceneGISPlanarModelVisualizer` 处理普通 glTF `ModelGraphics`，直接使用
`Model.fromGltfAsync` 和 `scene.primitives`，不调用 `Entity.computeModelMatrix`：

- orientation undefined 时，`modelMatrix` 是 translation-only，world rotation 为 identity。
- orientation defined 时必须是 finite、非零 Quaternion；先稳健归一化，再作为 object/model local
  frame 到固定 planar XYZ axes 的旋转。全部 derived matrix element finite 后才修改 Model。
- Position 使用 C1 resolver。Uniform scale继续写入 `Model.scale`，不折入 `modelMatrix`。
- glTF 内部 up-axis/forward-axis normalization 继续由 Cesium Model pipeline负责；C2 不复制或改写该
  pipeline。

C2 支持下列 `ModelGraphics` profile：

- `show`、`uri`；
- `scale`、`minimumPixelSize`、`maximumScale`；
- `incrementallyLoadTextures`、`runAnimations`、`clampAnimations`；
- `heightReference`；
- `color`、`colorBlendMode`、`colorBlendAmount`；
- `silhouetteColor`、`silhouetteSize`；
- `imageBasedLightingFactor`、`lightColor`；
- `distanceDisplayCondition`；
- `nodeTransformations`、`articulations`；
- Entity `orientation`。

下列配置在创建、加载或替换 Model resource 前同步拒绝：

- `enableVerticalExaggeration === true`；
- 已定义且不等于 `ShadowMode.DISABLED` 的 `shadows`；
- 已定义的 `environmentMapOptions`、`clippingPlanes` 或 `customShader`。

每个 C2 Model 固定使用：

- `heightReference=HeightReference.NONE`；
- `enableVerticalExaggeration=false`；
- `shadows=ShadowMode.DISABLED`；
- `environmentMapOptions: { enabled: false }`；
- picking enabled（`allowPicking`/`enablePick`）；
- 不向 `Model.fromGltfAsync` 传入用于 height clamping 的 `scene`。

模型仍使用 Scene 的普通 directional light 和 Cesium material pipeline。C2 不承诺阴影、动态 environment
map、PBR customization、classification、project-to-2D 或自定义 Shader。

### Model 异步状态与所有权

`_SceneGISPlanarModelVisualizer` 拥有它创建并加入 `scene.primitives` 的 Model、异步 generation 和
EntityCollection subscription；不拥有 Scene、World、EntityCollection、Entity 或输入 Resource。

- URI 与 load-time options 共同定义 load generation。二者变化时先移除并销毁旧 Model，再启动新
  generation；不保留旧 Model 作为 fallback。
- Promise completion 只保存 generation-matched candidate 并调用 `scene.requestRender()`；不能在异步
  callback 中直接向 `scene.primitives` 添加对象。下一次 `update(time)` 才完成添加和属性应用。
- Stale generation、Entity/graphic/position 已移除或 visualizer 已 destroy 的 completion candidate 必须
  exactly-once destroy。
- Load failure 记录为该 generation 的 stable failure，不自动无限重试；URI 或 load-time generation
  变化后才允许新请求。
- Position、resident terrain、orientation 和非 load-time style 变化只更新现有 Model，不 reload。
- `show=false`、position undefined 或 extent 外时隐藏已加载 Model并保留资源。
- Entity、model graphic、position Property移除、URI replacement 与 visualizer destroy 都必须
  remove+destroy owned Model，且 subscription/disconnect exactly once。

`getBoundingSphere` 遵循 Visualizer 状态：尚在加载返回 `PENDING`，该 Entity没有可用 Model或当前
generation failure返回 `FAILED`，ready Model返回 `DONE` 并复用 Model 的有效 bounding sphere。Model
的 `id` 保持原始 Entity。

C2 content readiness 不加入 `world.tilesLoaded`。异步成功通过 `requestRender` 请求后续 normal update，
但不会创建第二套全局 readiness。

### 集成、兼容性与失败边界

C2 private visualizer 只消费自己负责的 graphic。它不负责拒绝 C3 线面 graphic或首版永久 unsupported
graphics，因为尚未自动安装到 Viewer；C4 的 aggregate adapter 必须在任何 automatic resource mutation
前执行完整 Entity allowlist。

所有 C2 validation 都采用 per-graphic/resource atomic boundary：错误不能留下新 slot、subscription、
request、Model、scene primitive 或半更新属性。若实现发现必须修改 upstream-owned file、公开 World
API、Renderer、Shader、Worker、build/release 或 Viewer/DataSourceDisplay，Execution Agent必须暂停，
由 Architecture Agent重新裁决；不得自行创建 SGP。

## 不采用的方案

### 直接复用四个默认 visualizer

拒绝。Graphic 从 absolute 切换到 clamp、Point 改变 HeightReference 或 Model缺省 orientation 时都会
重新进入 ellipsoid/ECEF 语义，无法形成稳定 planar contract。

### 预处理或影子复制 Entity

拒绝。把高度预先写回 Position、强制写 Quaternion 或建立 shadow Entity会破坏 caller Property identity、
event 与动态更新语义，也无法阻止默认 visualizer再次 clamping。

### 修改每个 upstream visualizer 增加 planar 分支

拒绝。四个高频上游文件和底层 clamping会形成宽广、难升级的补丁面；当前低层组合能力足够，不需要
上游缝隙。

### 建立独立 planar Entity/collection 系统

拒绝。它会重复 Cesium Property、availability、事件、selection 与 DataSource 生命周期，违背总体
计划。

### 在 C2 启用 clustering

拒绝。当前算法依赖 camera cartographic、scene ellipsoid 与 ellipsoidal occlusion。若以后有真实需求，
应作为独立阶段重新设计 planar screen-space clustering。

### 将 C2 visualizer 暴露为公共 API

拒绝。它们是 C4 display integration 的内部角色；过早公开会固化 constructor、EntityCluster private
pool 和异步状态机细节。

## 兼容性、所有权与构建

C2 预计只新增 `packages/engine/Source/SceneGIS/DataSources/_private/**`、对应 SceneGIS Specs、必要的
SceneGIS durable docs 和 AgentDocs。Upstream-owned files=`0`、C2 SGP=`0`，不修改既有
SGP-0001/SGP-0002 或 manifest。

Private source basename 可以被 runtime barrel发现，但不得形成 supported declaration/API。不得手工编辑
generated root exports、`.d.ts`、SpecList、API HTML 或 `Build/**`。

C2 不新增 Sandcastle。公开可执行示例留到 C4 自动 Entity/DataSource integration 成立后，避免用只能
手工构造 private visualizer 的页面宣称产品能力。

## 测试与最小验证

- Anchor focused Specs 覆盖三个 graphic、静态/动态 Property、三个 HeightReference、extent/outside、
  show/availability、property映射、slot保留/归还、Entity pick identity、clustering fail-fast和销毁。
- Model focused Specs 覆盖 translation-only/Quaternion transform、三个 HeightReference、动态更新不
  reload、generation replacement、success/failure/stale/destroy、unsupported preflight、bounding sphere
  和 requestRender。
- 一个 local-fixture real WebGL Spec同时绘制 Point、Billboard、Label、Model，验证可见像素、原始 Entity
  picking、大 EPSG:3857-scale offset、finite bounds、warm identity 与 destroy balance。
- 复跑 C1 resolver focused Spec；运行 `build`、`build-ts`、`build-docs`、scoped lint/format、Markdown
  checks、`git diff --check` 和 upstream audit。
- 不运行全量 upstream suites、`build-release`、`tsc`、Sandcastle、E2E 或性能矩阵，除非实际影响边界
  扩大并先获 Architecture批准。

## 升级检查点

每次 Cesium 升级复核：

- Point/Billboard/Label visualizer 与 `EntityCluster` pool API、disabled/enabled分支和 ellipsoid依赖；
- PointPrimitive、Billboard、Label 的 property名称、default、picking id 与 bounding sphere行为；
- `Model.fromGltfAsync` options、Promise/load lifecycle、`scene.primitives` ownership和 Model destroy；
- Model transform、axis correction、style properties、bounding sphere与 picking path；
- `DataSourceDisplay.visualizersCallback` 和 Viewer/CesiumWidget construction path是否提供更稳定的
  instance-owned注入点；
- private symbol 的 declarations/API filtering 与 Spec discovery规则。

只有 upstream 提供不依赖 Ellipsoid/Cartographic、可替换默认 visualizer且生命周期明确的通用接口时，
才评估删除对应 SceneGIS private adapter。
