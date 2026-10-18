# ADR-0006：平面 Viewer 与 Widget 集成

## 状态

- Status：`approved`
- Date：`2026-08-06`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-world/plans/2026-08-06-phase-6-planar-viewer-integration.md`
- Related patch：`SGP-0002`；仅允许修改
  `packages/widgets/Source/Viewer/Viewer.js`

## 上下文与源码事实

P1 至 P5 已经建立互斥的 primary-world slot、平面坐标与瓦片数学、surface renderer、
PC 导航和拾取，以及显式的平面栅格图层。低层调用方已经可以通过
`CesiumWidget({ world })` 组装这些能力，但 Cesium 1.144 的 `Viewer` 仍只把 `globe`
转发给 `CesiumWidget`，并默认创建多个带有 Earth/Globe 语义的 widget。

当前源码具有以下约束：

- `Viewer` 在创建自己的 DOM、`CesiumWidget` 和各类 widget 后才形成完整所有权，构造
  失败后的回滚面较大；平面不兼容选项必须尽量在 DOM/WebGL/request mutation 前拒绝；
- `BaseLayerPicker`、terrain post-construction mutation、`Geocoder`、
  `SceneModePicker`、`ProjectionPicker`、`NavigationHelpButton` 和 `VRButton` 都直接或
  间接包含 Globe、ellipsoid、map projection、Earth navigation 或当前平面控制器不支持的
  交互语义；
- 上游 `HomeButtonViewModel` 的 command 调用 `scene.camera.flyHome(duration)`，不能表达
  P4 的 planar extent、四种 frustum 和 controller target contract；
- `Viewer` 默认安装 left-click selection 和 left-double-click Entity tracking，并从
  `zoomTo`、`flyTo`、`trackedEntity` 与 InfoBox camera button 进入 Entity tracking；P6 没有
  为这些路径建立平面 DataSource/clamping/flight 契约；
- `SelectionIndicator` 的核心坐标是 `Cartesian3` 到 window coordinate，InfoBox 的
  title/description 也不要求 Globe，因此二者可以在收窄能力后保留；
- `CesiumWidget.addController/removeController` 是公开的 ControllerHost 注册协议。
  `SceneGISPlanarCameraController` 明确要求调用方先关闭 legacy controller，销毁 widget 前
  再移除自己；ControllerHost 不会由 Scene destroy 自动代替这个配对；
- `Scene._initializeWorld` 只约束一个 Scene 的 primary-world slot，不是跨 Scene 的全局
  owner registry。P3 的 single-Context guard 能发现第二个 Context 的渲染，但不能把共享
  world 变成受支持用法；
- P5 的 provider 必须与 `world.tilingScheme` 使用同一 object identity。自定义平面 CRS、
  extent、tile endpoint 和 provider coverage 无法由一个 Cesium 通用底图目录安全推断。

## 决策

### Viewer 的平面构造入口

P6 在现有 `Viewer` 上增加显式构造入口：

```js
const viewer = new Cesium.Viewer("cesiumContainer", {
  world: planarWorld,
});
```

`Viewer.ConstructorOptions.world` 只接受一个尚未销毁的
`SceneGISPlanarWorld` instance。它不接受 `false`、任意其他 `SceneGISWorld`
implementation 或 duck-typed custom world。更低层的 `world: false` 和 generic custom-world
composition 继续只属于 `CesiumWidget`。

一旦定义 `world`，Viewer 就进入 planar construction mode，并把该 instance 原样转交给
`CesiumWidget`。`world` 与任何已定义的 `globe`（包括 `globe: false`）互斥。没有定义
`world` 时，Viewer 的所有既有 Globe 路径，包括 `globe: false`，保持原样。

平面 Viewer 固定 `scene3DOnly: true`。`sceneMode` 只允许未定义或
`SceneMode.SCENE3D`，`scene3DOnly` 只允许未定义或 `true`。P6 不增加新的 SceneMode，也不
把 planar world 映射成 2D projection。

传入 `world` 表示把该 instance 的独占生命周期所有权转交给一个 Viewer/Scene。调用方不得
把同一 instance 交给第二个 Viewer 或 CesiumWidget；每个 Viewer 必须使用独立 world。
P6 记录并测试现有 single-Context failure signal，但不扩展 engine owner registry。

### 构造前兼容矩阵

平面模式在创建 Viewer 子 DOM、WebGL Context、controller 或 provider request 前完成参数
验证。矩阵如下：

| 选项组                                                                                                                                            | 平面 Viewer 规则                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `world`                                                                                                                                           | 必须是 live `SceneGISPlanarWorld`                               |
| `globe`                                                                                                                                           | 任何 defined value 均拒绝                                       |
| `sceneMode`                                                                                                                                       | undefined 或 `SCENE3D`；内部固定 `SCENE3D`                      |
| `scene3DOnly`                                                                                                                                     | undefined 或 `true`；内部固定 `true`                            |
| `baseLayerPicker`                                                                                                                                 | undefined 自动关闭，`false` 允许，其他值拒绝                    |
| `baseLayer`、legacy `imageryProvider`                                                                                                             | 任何 defined value（包括 `false`）均拒绝                        |
| imagery provider view model 选项                                                                                                                  | 任何 defined value 均拒绝                                       |
| `terrainProvider`、`terrain`、`terrainShadows`                                                                                                    | 任何 defined value 均拒绝                                       |
| terrain provider view model 选项                                                                                                                  | 任何 defined value 均拒绝                                       |
| `geocoder`、`navigationHelpButton`、`sceneModePicker`、`projectionPicker`、`vrButton`                                                             | undefined 自动关闭，`false` 允许，显式启用或配置均拒绝          |
| `navigationInstructionsInitiallyVisible`                                                                                                          | 任何 defined value 均拒绝                                       |
| `mapProjection`、`mapMode2D`、`depthPlaneEllipsoidOffset`                                                                                         | 任何 defined value 均拒绝                                       |
| `ellipsoid`                                                                                                                                       | 允许作为 Cesium Scene 的辅助 ellipsoid；不定义或改变 planar CRS |
| `skyBox`、`skyAtmosphere`、shadows、OIT、MSAA、Context、Clock、render loop、request-render、credits、DataSources、Animation、Timeline、Fullscreen | 保留既有选项语义                                                |

`selectedImageryProviderViewModel`、`imageryProviderViewModels`、
`selectedTerrainProviderViewModel` 和 `terrainProviderViewModels` 都属于被拒绝的 view-model
选项。错误必须是带英文 JSDoc `@exception {DeveloperError}` 的确定性 fail-fast，而不是
创建半个 Viewer 后依赖 `scene.globe` 的偶然异常。

### 导航控制器所有权

平面 Viewer 自动完成 P4 低层案例中由应用负责的组装：

1. 关闭 `scene.screenSpaceCameraController.enableInputs`；
2. 创建唯一的 `SceneGISPlanarCameraController({ world })`；
3. 通过 `CesiumWidget.addController` 注册；
4. 通过只读 `viewer.planarCameraController` 暴露该 instance；
5. Viewer destroy 时先调用 `removeController`，再销毁 CesiumWidget/Scene/world。

`scene.screenSpaceCameraController` 的具体类型和属性保持存在，不替换、不 monkey patch。
平面 Viewer 不提供 constructor opt-out；调用方需要临时停止导航时使用
`viewer.planarCameraController.enabled = false`，需要自定义 controller ownership 时改用
`CesiumWidget`。Globe Viewer 的 `planarCameraController` 为 `undefined`。

构造中若 controller 创建或注册失败，Viewer 必须清理已经建立的 planar controller 状态，
不能遗留连接的 `CameraEventAggregator`。正常销毁和失败回滚都必须具有 exactly-once
disconnect 证据。

### 平面 Home Button

P6 新增 SceneGIS-owned public widget：

- `SceneGISPlanarHomeButton`；
- `SceneGISPlanarHomeButtonViewModel`。

公共构造形式采用明确依赖：

```js
new SceneGISPlanarHomeButton(container, scene, planarCameraController);
new SceneGISPlanarHomeButtonViewModel(scene, planarCameraController);
```

view model 的 command 直接调用
`planarCameraController.viewHome(scene)`，不调用 `camera.flyHome`，不创建 Earth rectangle，
也不承诺 flight duration。command 保留 Cesium `createCommand` 的 `beforeExecute` 和
`afterExecute`，使 Viewer 可以继续在 home 前清理 tracked/selected state。

在平面 Viewer 中，`homeButton` 未定义或为 `true` 时创建 planar button，为 `false` 时不
创建。`viewer.homeButton` 在 Globe 模式返回原 `HomeButton`，在平面模式返回
`SceneGISPlanarHomeButton`，关闭时为 `undefined`；生成声明必须表达这个 union。P6 优先复用
现有 toolbar button CSS class，不修改 upstream `widgets.css`。若实际实现必须增加 CSS
集成缝隙，Execution Agent 必须暂停并交回架构评审。

### Widget 与 Entity 能力边界

平面 Viewer 的默认 widget 行为分为三类：

- 保留：planar Home、InfoBox title/description、SelectionIndicator、Animation、Timeline、
  Fullscreen；
- 默认关闭并禁止显式启用：BaseLayerPicker、Geocoder、SceneModePicker、ProjectionPicker、
  NavigationHelpButton、VRButton；
- 不自动提供：任何 planar provider picker。影像始终由应用显式写入
  `world.imageryLayers`。

NavigationHelpButton 的上游说明包含右键缩放与 touch gestures，而 P4 第一版只承诺左键
拖动、中键旋转和滚轮缩放，因此不能显示误导性帮助。未来若增加平面帮助 widget，应基于
当时控制器能力独立设计，不复用这次被关闭的 Earth instructions。

P6 保留 Viewer 的 left-click Entity/Primitive selection 和 SelectionIndicator。InfoBox 可以
显示选中对象的 title/description，但其 camera control 在平面 Viewer 中始终 disabled。
平面模式不安装默认 left-double-click Entity tracking，并对下列入口 fail-fast：

- `viewer.trackedEntity = definedEntity`；
- `viewer.zoomTo(...)`；
- `viewer.flyTo(...)`。

`viewer.trackedEntity = undefined` 保持允许，以支持通用清理代码。以上收窄不宣称
DataSource position、Entity clamping、tracking 或 flight 已与 planar CRS 兼容。没有定义
`world` 的 Viewer 继续使用全部既有 Entity 行为。

### 影像组装与 Sandcastle

P6 不建立通用平面 base-layer/provider picker。自定义平面坐标系的 CRS、extent、canonical
tiling scheme 和服务 coverage 都属于应用配置；仅凭 provider 名称不能安全匹配。应用必须
先创建 world，再用 `world.tilingScheme` 创建 provider/layer，并显式加入
`world.imageryLayers`。

P6 增加一个 `scenegis-planar-viewer` Sandcastle：显式创建 EPSG:3857 world、OpenStreetMap
XYZ provider 和 layer，再调用 `new Viewer({ world })`。它必须显示 OSM attribution，遵守
公开 tile policy，并把网络可用性视为 best-effort 人工信号。自动化验证必须拦截或使用本地
fixture，不能依赖外部 OSM 服务。

P5 的 `scenegis-planar-imagery` 继续作为低层 `CesiumWidget` 显式组装案例，不被 P6 替换，
也不从 Viewer 示例反向形成隐式 online provider/default layer contract。

## 不采用的方案

### 让 Viewer 接受任意 `SceneGISWorld`

不采用。Viewer 的默认 widget、navigation 和 Entity compatibility 必须由具体 world 能力
决定。P6 只有 `SceneGISPlanarWorld` 的完整证据；接受 structural custom world 会把未验证
能力伪装成公共承诺。

### 用平面 controller 替换 `scene.screenSpaceCameraController`

不采用。该属性是 Cesium 的具体 legacy controller，许多现有调用方依赖它。ControllerHost
已经提供并行的显式扩展点；关闭其输入并注册 planar controller 可以保持类型和销毁边界。

### 复用上游 HomeButton 并伪造 Earth home state

不采用。`camera.flyHome` 与 P4 的 planar extent、center-ray range、off-center frustum 和
target clamp 契约不同。伪造 rectangle 或 camera default view 会重新引入 Earth 语义。

### 保留全部 Viewer 默认 widget

不采用。静默显示无法兑现的 geocoder、terrain、projection、navigation 或 VR 能力比明确
关闭更危险。P6 采用 allowlist，并对显式冲突在构造前报错。

### 增加通用平面底图选择器

不采用。平面坐标系是自定义的，provider 与 canonical tiling scheme 的 identity 也是 world
实例级契约。一个通用目录无法可靠判断 CRS、extent、axis、root coverage 和授权策略；选择
UI 应由具体应用实现。

### 在 P6 支持 Entity tracking、zoom 和 flight

不采用。这些路径涉及 DataSource position 语义、bounding sphere、clamping、camera flight
和当前 Globe 假设。P6 只保留 selection/display，并通过 fail-fast 防止错误承诺。

### 增加跨 Scene 的 world owner registry

不采用。P6 只需要明确所有权文档和现有 second-Context failure evidence；修改 engine owner
协议会越过 widget integration 范围，并需要重新评估 P1/P3 生命周期。

## 兼容性与所有权

P6 预计只修改一个 upstream-owned product file：
`packages/widgets/Source/Viewer/Viewer.js`。该窄缝隙由 `SGP-0002` 跟踪，每个独立 hunk 使用
成对 `SCENEGIS_PATCH_BEGIN/END SGP-0002` 标记。SceneGIS widget、Specs、Sandcastle、ADR 和
AgentDocs 保持在 SceneGIS-owned 路径。

`SGP-0001` 的 `Scene.js`/`CesiumWidget.js` primary-world seam 不在 P6 修改范围。P6 不修改
engine runtime、P5 imagery state、upstream HomeButton、InfoBox、SelectionIndicator、
BaseLayerPicker、widgets CSS 或生成文件。

没有定义 `world` 时，默认 Globe Viewer、`globe: false`、所有现有 widget option、Entity
tracking/zoom/flight 和 destroy 顺序必须保持上游行为。升级 Cesium 时应重点复核 Viewer
constructor option validation、CesiumWidget forwarding、widget creation order、screen-space
event registration、InfoBox tick handling、HomeButton hooks 和 destroy order。

## 验证要求

- SceneGIS-owned Specs 覆盖 planar option matrix 的成功与 fail-fast，并证明失败发生在
  Viewer child DOM、WebGL Context、controller 和 request mutation 前；
- 覆盖 controller 唯一注册、legacy inputs 关闭、公开 getter、临时 disable/re-enable、
  registration failure rollback 和 destroy 前 exactly-once remove；
- 覆盖 planar Home command、`beforeExecute/afterExecute`、`viewHome` 调用、无
  `camera.flyHome`、widget destroy 和四 frustum 代表性 home；
- 覆盖保留/关闭 widget matrix、left-click selection、InfoBox camera disabled、无默认
  double-click tracking，以及 trackedEntity/zoomTo/flyTo guard；
- 覆盖显式 P5 imagery 通过 Viewer render、credit、depth pick 与 stable warm frame；
- 覆盖 Globe Viewer 与 `globe: false` 的现有 Viewer Specs 和代表性回归；
- 验证 public exports、JSDoc、generated TypeScript declarations 和 API HTML；生成物不得出现在
  Git diff/status，SGP marker 不得泄漏到生成声明或 API 文档；
- Sandcastle 自动化使用本地 fixture/interception，人工 OSM 结果只作 best-effort 证据；
- 构建、release build、types、docs、scoped lint/format、Markdown 和 ownership audit 全部通过。

## 后果与后续

P6 完成后，大多数应用可以用一个 Viewer 构造入口获得平面渲染、影像、PC 导航、Home、
selection 和常用非地理 UI，而不必手工管理 ControllerHost。代价是 Viewer 的平面模式采用
明确的 capability allowlist；不兼容选项会立即报错，而不是部分工作。

## 2026-08-14 amendment：声明式平面 World 入口

V1在strict live `world`高级入口之外增加`Viewer.ConstructorOptions.planarWorld`。该raw config只包含square extent、
opaque CRS、required `maximumLevel`与现有`SceneGISPlanarWorld` constructor字段；SceneGIS-owned private helper同步创建
`SceneGISPlanarExtent`→`SceneGISPlanarCoordinateSystem`→`SceneGISPlanarWorld`，不推断CRS、不创建provider、不访问DOM或
WebGL，也不保留config引用。底层public constructors继续是字段validation的唯一事实源。

`world`、`planarWorld`与任何defined `globe`严格互斥；完整planar option matrix必须先于helper和Viewer child DOM验证。
成功后Viewer内部只使用单一resolved World，readonly `viewer.planarWorld`与`viewer.scene.world`为同一identity；Globe与
`globe:false`返回`undefined`。Scene继续exactly-once拥有并销毁resolved World，planar controller仍在Scene/World前移除。
需要canonical tiling scheme的imagery/terrain provider只能在Viewer返回后，从resolved World显式创建和安装。

该amendment复用SGP-0002，不增加CesiumWidget/engine seam。升级时还必须复核Viewer constructor option typedef、raw config
preflight、resolved local forwarding/getter、controller rollback与生成declaration/API HTML；默认Globe、`globe:false`及live
`world`行为不得改变。

通用 planar provider picker、Geocoder、准确的 NavigationHelp、touch/inertia、Entity
tracking/flight/clamping，以及 generic custom-world Viewer 都是未来独立能力，不因本 ADR
自动进入 roadmap。P6 评审和独立本地 checkpoint 完成后仍需停在阶段门禁，由项目负责人
决定 P7。

## 2026-08-14 amendment：Entity/DataSource framing与InfoBox zoom-only

I2取代P6对planar `Viewer.zoomTo`/`flyTo`和InfoBox camera的永久禁用，但不开放tracking。直接`CesiumWidget`与
live/declarative planar Viewer仅接受`Entity`、全为真实`Entity`的snapshot数组、`EntityCollection`、`entities`为真实
`EntityCollection`的DataSource interface，以及resolve为这些类型的Promise/thenable。Plain object、mixed array、
ImageryLayer、3D Tiles、point cloud、Voxel和Buffer目标保持拒绝；应用负责Entity属性的planar Cartesian米制语义。

SceneGIS-owned private helper以per-operation identity管理target snapshot、DataSource loading listener、bounds candidate及
Promise终态。同步非法直接target/options必须在replacement、requestRender和Camera mutation前失败；async rejection/invalid
target/Camera candidate错误拒绝并原子清理。Replacement、cancel、trackedEntity cleanup和destroy仅把当前operation resolve
为`false`一次；stale target/loading/flight callback不能结算新operation。Bounds继续来自
`DataSourceDisplay.getBoundingSphere(entity, false, scratch)`：PENDING不发布，mixed DONE/FAILED只合并DONE，empty或全部
FAILED resolve `false`。最终只调用ADR-0037适配的public Camera bounds API。

Planar InfoBox camera仅在selected Entity bounds状态为DONE时启用；PENDING不读取stale scratch，FAILED position fallback只供
SelectionIndicator。Camera click调用`viewer.zoomTo(selectedEntity)`，不赋值`trackedEntity`。Defined trackedEntity与
left-double-click tracking仍由后续阶段处理，Globe与`globe:false`保留上游target和InfoBox行为。

该amendment由proposed SGP-0005跟踪`CesiumWidget.js`与`Viewer.js`的独立paired seams，不扩大SGP-0001/0002/0004。
升级时复核target overload、`_postRender`更新点、destroy/cancel顺序、DataSource loading event、InfoBox tick/click以及
`DataSourceDisplay`三态；若上游提供等价custom-world target profile与operation-isolated lifecycle，可移除SGP-0005。

## 2026-08-14 amendment：FIXED Entity tracking与Viewer交互

I3取代P6/I2对planar tracking与left-double-click的禁用。直接`CesiumWidget`及live/declarative planar Viewer的defined
`trackedEntity`只接受真实`Entity`、defined `ReferenceFrame.FIXED` position与`AUTODETECT/ENU`
`trackingReferenceFrame`；两种frame都解释为translation-only fixed `+X East/+Y North/+Z Up`。Private tracker不读取Entity
orientation，不进入Earth `EntityView`，也不支持INERTIAL、VELOCITY、body frame、clamping或CRS推断。

Tracker lazy注册到`ControllerHost`，在`DataSourceDisplay.update(time)`后消费同一native Clock time。初次authority使用
`viewFrom`或PENDING/DONE/FAILED bounds fallback建立fixed offset，并以独立计数token暂停planar input controller；token可与
Camera flight suspension嵌套且不改变caller `enabled`。Direct Camera flight暂时优先，successful I2 framing、Home、remove、clear
与destroy停止tracking。Definition listener、Camera transform与token均exactly once清理。

Planar InfoBox camera对当前可track Entity执行track/untrack，对不可track但DONE bounds执行I2 zoom fallback；left-double-click
使用同一track-or-zoom规则。Globe、`globe:false`与generic custom World继续使用原EntityView/Viewer行为。该amendment由proposed
SGP-0006跟踪`CesiumWidget.js`与`Viewer.js`的独立paired seams；完整Camera authority、failure atomicity与升级边界见
[ADR-0038](ADR-0038-planar-entity-tracking.md)。

## 2026-08-14 amendment：Scene API 与 native effect safety

I4进一步收紧direct `CesiumWidget({world})`和live/declarative planar Viewer的构造profile：`sceneMode`只允许
`SCENE3D`，`scene3DOnly`实际固定true；defined `ellipsoid`、`mapProjection`、`mapMode2D`、
`depthPlaneEllipsoidOffset`拒绝；`shadows`、native `skyBox`和`skyAtmosphere`只允许undefined/false。该规则取代本ADR早期
矩阵中“planar Viewer允许辅助ellipsoid及generic native environment”的描述。`Scene.ellipsoid`仍由Cesium内部创建并供render
invariant使用，但不是planar CRS或application position contract。

Direct Widget preflight和construction Fog normalization继续属于SGP-0001，Viewer preflight继续属于SGP-0002；Scene height/native
frame safety由SGP-0007与[ADR-0039](ADR-0039-planar-scene-api-qualification-and-safety.md)定义。`world:false`、`globe:false`和默认
Globe Viewer不进入该profile。

## 2026-10-18 amendment：原生 planar tileset 取景

在既有 Entity/DataSource profile 之外，live/declarative planar Viewer 和低层 CesiumWidget
接纳原生 `Cesium3DTileset` 及 resolve 为该类型的 Promise。前提是内容和全部包围体已经
使用当前 World Cartesian 坐标，目标已属于 Scene 的 primitive collection tree。
这取代 I2 对全部 3D Tiles target 的拒绝，不开放其他未支持的 target 类型或地理重投影。

执行时读取公开 `tileset.boundingSphere`，让原生 getter 刷新当前 `modelMatrix × root.transform`
对应的根包围球，然后复用 ADR-0037 的 fixed-axis Camera API。`fromUrl` Promise 提供根元数据
readiness；不等待所有内容加载，不直接调用私有 root 方法，不缓存请求时的旧 bounds。
飞行开始后的矩阵变化不自动重定向航程，调用方应发起新请求。

operation 继续独立结算，保留 stale callback、replacement、cancel、trackedEntity 和 controller
suspension 契约。实际执行时目标仍未加入 Scene、已经销毁或根尚未初始化时 resolve false；允许
Promise resolve 后、执行取景前加入 Scene，避免 Promise continuation 顺序导致提前失败。所在 collection
路径的 primitiveRemoved 取消已失去场景归属的目标；多重归属时重新绑定有效路径。preUpdate
发现直接销毁后取消；完成回调也检查目标存活。所有 terminal path 必须解除监听。
Widget destroy 先取消 operation；Scene teardown 通过原生 tween/primitive 生命周期取消。
调用方仍负责不把已销毁对象留在原生 collection 中。

公开 `tileset.root.transform` 已满足 SDK 显式根矩阵替换需求；modelMatrix 是额外外层矩阵，
不能替代该语义。此能力不转换 region、RTC、子矩阵或烘焙 ECEF 顶点。地理投影、完整 tileset
渲染/LOD/picking 资格须另行设计，详见
[源码审计](../../../AgentDocs/planar-api-integration/discussions/2026-10-18-geographic-tileset-scope.md)。

复用 SGP-0005，仅更新 CesiumWidget.js / Viewer.js 既有配对标记内的公共目标说明。
运行时与资源管理在自有 helper 中完成；不新增 Camera、Scene 或 Cesium3DTileset 上游修改。
