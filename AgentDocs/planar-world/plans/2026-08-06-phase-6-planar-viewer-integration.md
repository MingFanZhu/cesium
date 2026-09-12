# 阶段计划：P6 平面 Viewer 与 Widget 集成

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- 总体计划（Parent plan）：
  [2026-08-05-planar-world-extension.md](2026-08-05-planar-world-extension.md)
- 阶段（Phase）：`P6-planar-viewer-integration`
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`approved`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-06`
- 更新日期（Updated）：`2026-08-06`
- 相关讨论（Related discussions）：无；架构对话中的确认结论已提升到 ADR-0006
- 相关评审（Related reviews）：
  [P6 planar Viewer integration review](../reviews/2026-08-06-p6-planar-viewer-integration.md)
  （`approved`）
- ADR：
  `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`
  （`approved`）
- SGP：`SGP-0002`（required；Execution Agent 修改 `Viewer.js` 前在 patch manifest 中创建）

## 目标

在 P5 checkpoint 已稳定的 engine public API 之上，为 `Viewer` 增加一个明确、可测试且不
伪装 Globe 能力的平面构造路径：

```js
const viewer = new Cesium.Viewer("cesiumContainer", {
  world: planarWorld,
});
```

P6 必须闭合以下能力：

- `Viewer.ConstructorOptions.world` 只接受 live `SceneGISPlanarWorld`；
- planar-specific option preflight 在 DOM/WebGL/controller/request mutation 前 fail-fast；
- Viewer 自动关闭 legacy camera inputs、创建并注册唯一 planar controller，并在 destroy 前
  成对移除；
- public readonly `viewer.planarCameraController`；
- public `SceneGISPlanarHomeButton` 与 `SceneGISPlanarHomeButtonViewModel`；
- 平面模式下经过 allowlist 的 widget defaults、Entity selection/InfoBox 收窄和 unsupported
  navigation guard；
- 显式 EPSG:3857 + OpenStreetMap imagery 的 `scenegis-planar-viewer` Sandcastle；
- public exports、generated types/API docs、Viewer/Globe regression、ownership 与 lifecycle
  evidence；
- upstream-owned product diff 仅 `Viewer.js`，由 `SGP-0002` 追踪。

P6 implementation、验证、Architecture/code review 和独立本地提交完成前不得讨论、激活或
实现 P7。Execution Agent 不提交、不 push；阶段 review 通过后由 Architecture Agent 使用
中文提交信息建立 P6 checkpoint。

## 非目标

- 让 Viewer 接受 `world: false`、generic `SceneGISWorld`、duck-typed world 或任意 custom
  primary world；这些能力继续只属于低层 `CesiumWidget`。
- 增加跨 Scene 的 world owner registry，或修改 P1/P3 engine ownership/single-Context
  contract。
- 修改 `Scene`、`CesiumWidget`、`SceneGISPlanarWorld`、surface、imagery cache、provider、
  P4 controller 数学、input mapping、touch 或 inertia。
- 替换、删除或改变 `scene.screenSpaceCameraController` 的具体类型；P6 只关闭其 inputs。
- 增加通用平面底图/provider picker。自定义 planar CRS 与 canonical tiling scheme 不适合
  Cesium 通用 provider catalog，选择 UI 属于应用层。
- 在 Viewer 中隐式创建 online provider、base layer、terrain 或默认 CRS。
- 支持 Geocoder、SceneModePicker、ProjectionPicker、NavigationHelpButton、VRButton、
  terrain widget 或 Earth base-layer widget。
- 宣称 DataSource position、Entity clamp、tracking、`zoomTo` 或 `flyTo` 已支持 planar CRS。
- 修改上游 `HomeButton`、`HomeButtonViewModel`、InfoBox、SelectionIndicator、
  BaseLayerPicker、NavigationHelpButton 或 `widgets.css`。
- 删除或重写 P5 的低层 `scenegis-planar-imagery` 示例。
- 修改构建器、Worker、Shader、package layout 或生成文件。
- 开始 P7 performance/release audit。

## 进入条件

- P1 至 P5 均为 `completed`，相关 review 均为 `approved`。
- P5 已形成独立本地 checkpoint
  `ac56b9c6f79cf813e1c6b8208bfdf1138f2c4a4c`
  （`完成平面世界第五阶段栅格影像`）。
- 当前分支为 `feature/planar-world`，P6 不创建新分支。
- P6 开始前 checkpoint worktree clean；implementation diff base 固定为上述 P5 checkpoint。
- 项目负责人已经明确批准本计划的 Viewer-only public入口、automatic controller ownership、
  planar Home、widget allowlist、Entity navigation guards、无通用 provider picker和
  EPSG:3857/OSM Viewer案例。
- ADR-0006 状态为 `approved`。
- Architecture Agent 已把本计划设为 `active/approved` 并交给 Execution Agent；实现只能在
  本计划边界内进行。
- Execution Agent 开始前重新读取根、AgentDocs、engine、Sandcastle 作用域内的
  `AGENTS.md`，以及 `Architecture.md`、`DevelopmentGuide.md`、总体计划、ADR-0001、
  ADR-0004 至 ADR-0006、P4/P5 plan/review 和本计划。
- 修改 `Viewer.js` 前必须读取 `.scenegis/upstream-base.json` 和
  `.scenegis/upstream-patches.json`，创建 `SGP-0002`，再使用成对 marker 修改最小 hunk。
- Execution Agent 必须优先使用 code graph 重新确认当前 Viewer constructor、widget creation、
  Entity handlers、getter/method和destroy路径，以及 ControllerHost/HomeButton构建关系；不得
  根据本计划记录的旧行号直接实现。

## 当前源码事实

1. 上游基线是 Cesium `1.144`，提交
   `6d5d8b1f0725b6f831b336463f4b11c98023427b`；P5 checkpoint 为本阶段 diff base。
2. `Viewer` 当前只向 `CesiumWidget` 转发 `globe`，没有 `world` option，也没有
   `planarCameraController`。
3. Viewer constructor 在创建 child DOM 后依次建立 CesiumWidget、SelectionIndicator、
   InfoBox、toolbar widgets、Animation、Timeline、Fullscreen/VR、event handlers和自身字段。
4. 当前 `baseLayerPicker` 默认启用；其 provider view models、base layer mutation和 terrain
   mutation均假设 `scene.globe`/Globe imagery/terrain contract。
5. 当前 Geocoder 使用 scene ellipsoid、Cartographic和terrain destination；不能作为任意
   planar CRS geocoder复用。
6. SceneModePicker、ProjectionPicker和map projection是Earth/SceneMode能力；planar world只
   支持`SCENE3D`。
7. NavigationHelpButton说明包含right-drag zoom和touch gestures；P4当前只承诺left-drag pan、
   middle-drag rotate和wheel zoom。
8. 当前上游HomeButtonViewModel command调用`scene.camera.flyHome(duration)`，没有经过
   `SceneGISPlanarCameraController.viewHome(scene)`。
9. Home command提供`beforeExecute/afterExecute`；Viewer使用beforeExecute清理tracked object，
   因此planar replacement必须保持同一command事件能力。
10. `SelectionIndicatorViewModel`使用`SceneTransforms.worldToWindowCoordinates`和
    `Cartesian3`，没有要求Cartographic；代表性planar Scene仍需由Specs实证。
11. InfoBox title/description本身不要求Globe，但Viewer `_onTick`会根据selected Entity
    position打开camera control，camera click又会进入tracking或zoom。
12. Viewer当前安装left-click selection和left-double-click tracking；P6只保留前者。
13. `Viewer.trackedEntity`转发给CesiumWidget；`zoomTo`和`flyTo`会进入DataSource display、
    bounding sphere和camera flight路径，P6尚无planar contract。
14. `CesiumWidget.addController/removeController`通过公共ControllerHost配对调用
    `connectedCallback/disconnectedCallback`；Scene destroy不会自动移除第三方controller。
15. `SceneGISPlanarCameraController`构造时要求live `SceneGISPlanarWorld`；caller contract要求
    先关闭legacy controller、widget destroy前remove。其`firstUpdate`负责四frustum初始home。
16. `SceneGISPlanarCameraController.disconnectedCallback` exactly once销毁其
    `CameraEventAggregator`并清理输入状态；controller本身没有独立`destroy()`所有权入口。
17. P1 `CesiumWidget({ world })`已经实现primary-world互斥、Earth默认资源隔离和world
    lifecycle；P6应转发现有能力，不在Viewer复制engine逻辑。
18. `Scene._initializeWorld`只保护单个Scene slot，不记录world的全局owner。P3 surface在第二
    Context begin/render时fail-fast；同一world跨Viewer共享仍是不受支持用法。
19. P5 provider/layer要求`provider.tilingScheme === world.tilingScheme`；因此generic provider
    picker无法仅凭CRS名称或数值相等安全组装图层。
20. P5已有`scenegis-planar-imagery`低层示例，显式创建world、CesiumWidget、controller和OSM
    layer；P6新增高层Viewer示例而不替换它。
21. SceneGIS-owned widgets可以放在`packages/widgets/Source/SceneGIS/**`，Specs放在
    `packages/widgets/Specs/SceneGIS/**`。本阶段不需要新增upstream CSS；公共root导出、声明和
    API HTML必须通过生成流程验证，不得手工编辑生成产物。
22. 当前P1 upstream patch只有`SGP-0001`，覆盖`Scene.js`和`CesiumWidget.js`。P6不得改动该
    条目或两个文件；新的Viewer seam使用独立`SGP-0002`。

源码行号不是契约。若 Execution Agent 发现以上事实不成立，或者实现需要修改 engine、
第二个 upstream product file、CSS、P5 runtime、Entity camera算法或本计划禁区，必须停止，
回写 blocker并交回Architecture Agent裁决，不能用扩大SGP或复制上游代码自行绕过。

## 详细设计

### 模式识别与构造前验证

仅以`defined(options.world)`进入planar Viewer分支。该值必须满足：

```text
options.world instanceof SceneGISPlanarWorld
options.world.isDestroyed() === false
```

`world: false`、其他`SceneGISWorld`、structural object和destroyed instance都抛
`DeveloperError`。没有定义`world`时，不运行planar preflight，也不改变任何Globe或
`globe:false`语义。

planar preflight必须位于Viewer child DOM、CesiumWidget/WebGL、controller和provider/request
创建之前。允许现有container lookup/validation先发生，但冲突不能向有效container添加
Viewer child。所有新增错误都补充英文`@exception {DeveloperError}`，并由Specs验证错误类型
和无mutation证据。

#### Option matrix

| Option                                                           | Undefined           | Allowed explicit value     | Rejected defined values                |
| ---------------------------------------------------------------- | ------------------- | -------------------------- | -------------------------------------- |
| `world`                                                          | Globe path          | live `SceneGISPlanarWorld` | `false`、other/destroyed world         |
| `globe` in planar mode                                           | allowed by omission | none                       | all defined, including `false`         |
| `sceneMode`                                                      | force `SCENE3D`     | `SCENE3D`                  | all other modes/values                 |
| `scene3DOnly`                                                    | force `true`        | `true`                     | `false`/other                          |
| `baseLayerPicker`                                                | suppress            | `false`                    | any non-false value                    |
| `baseLayer`                                                      | omit                | none                       | every defined value, including `false` |
| `imageryProvider`                                                | omit                | none                       | every defined legacy value             |
| `selectedImageryProviderViewModel` / `imageryProviderViewModels` | omit                | none                       | every defined value                    |
| `terrainProvider` / `terrain` / `terrainShadows`                 | omit                | none                       | every defined value                    |
| `selectedTerrainProviderViewModel` / `terrainProviderViewModels` | omit                | none                       | every defined value                    |
| `geocoder`                                                       | suppress            | `false`                    | `true`, string, service or array       |
| `sceneModePicker` / `projectionPicker` / `vrButton`              | suppress            | `false`                    | any non-false value                    |
| `navigationHelpButton`                                           | suppress            | `false`                    | any non-false value                    |
| `navigationInstructionsInitiallyVisible`                         | omit                | none                       | every defined value                    |
| `mapProjection` / `mapMode2D` / `depthPlaneEllipsoidOffset`      | omit                | none                       | every defined value                    |
| `ellipsoid`                                                      | existing default    | any existing valid value   | none added by P6                       |

`ellipsoid`只保留为Cesium Scene辅助值，不解释成planar CRS、extent或surface。以下选项继续按
Viewer/CesiumWidget现有规则工作：skyBox、skyAtmosphere、shadows、OIT、MSAA、context、Clock、
render loop、request render、credits、DataSources、Animation、Timeline、Fullscreen、InfoBox、
SelectionIndicator及与地理能力无关的display配置。

### Viewer 与 CesiumWidget 组装

planar branch向`CesiumWidget`传递同一`world`，固定`sceneMode: SCENE3D`与
`scene3DOnly: true`，并避免向低层传入任何被planar preflight禁止的base/terrain/map选项。
不得自行创建默认影像或terrain，也不得在构造后访问`scene.imageryLayers`或
`scene.terrainProvider`。

传入world即转移exclusive lifecycle ownership。Viewer不克隆、不替换、不自动destroy provider；
world依旧按P1/P5契约拥有自己的layer collection并由CesiumWidget/Scene destroy。文档必须说明
同一world不得用于第二个Viewer/CesiumWidget，每个Viewer创建独立instance。P6不增加全局owner
flag；second-Context guard只作为误用signal测试。

### Planar Camera Controller

CesiumWidget成功创建后，planar branch必须：

1. 把`scene.screenSpaceCameraController.enableInputs`设为`false`；
2. 创建`new SceneGISPlanarCameraController({ world })`；
3. 通过`cesiumWidget.addController(controller)`注册一次；
4. 保存为`this._planarCameraController`并通过readonly getter公开。

默认Globe Viewer getter返回`undefined`。不增加constructor opt-out；临时禁用使用
`controller.enabled`。不得把controller赋给`scene.screenSpaceCameraController`，也不得修改
legacy controller的更新或destroy实现。

Viewer destroy必须在`this._cesiumWidget.destroy()`之前，对已注册的planar controller调用一次
`removeController`。失败回滚必须区分“尚未注册”和“已注册”，只清理由本次构造创建的对象，
并保证不重复disconnect。Specs必须观察ControllerHost数量/回调或aggregator生命周期，而不能只
检查getter变成undefined。

### Planar Home Button

新增public SceneGIS-owned文件：

```text
packages/widgets/Source/SceneGIS/SceneGISPlanarHomeButton.js
packages/widgets/Source/SceneGIS/SceneGISPlanarHomeButtonViewModel.js
```

公共构造形式固定为：

```js
new SceneGISPlanarHomeButton(container, scene, planarCameraController);
new SceneGISPlanarHomeButtonViewModel(scene, planarCameraController);
```

view model使用Cesium标准`createCommand`，command body只调用
`planarCameraController.viewHome(scene)`。它必须暴露`beforeExecute/afterExecute`，不得读取Earth
default rectangle、调用`camera.flyHome`或模拟duration。Button遵循现有container resolution、
toolbar button DOM、viewModel和destroy模式，复用已有CSS class/assets；不得复制大段HomeButton
实现或修改`widgets.css`。

planar Viewer中：

- `homeButton` undefined/true：创建planar button；
- `homeButton: false`：不创建；
- `viewer.homeButton`：返回planar button或undefined；
- Home command的`beforeExecute`继续挂接Viewer clear-state callback；
- 不创建上游HomeButton。

Globe Viewer仍创建并返回原HomeButton。JSDoc和generated declaration必须把getter表达为
`HomeButton | SceneGISPlanarHomeButton | undefined`，不能把planar类型泄漏成private或把Globe
类型收窄。

### Widget allowlist

planar模式默认行为：

| Widget               | Default                 | Explicit false | Explicit enable/config |
| -------------------- | ----------------------- | -------------- | ---------------------- |
| Planar Home          | create                  | suppress       | `true` create          |
| InfoBox              | create, camera disabled | suppress       | `true` create          |
| SelectionIndicator   | create                  | suppress       | `true` create          |
| Animation            | existing create         | suppress       | existing behavior      |
| Timeline             | existing create         | suppress       | existing behavior      |
| Fullscreen           | existing create         | suppress       | existing behavior      |
| BaseLayerPicker      | suppress                | suppress       | preflight error        |
| Geocoder             | suppress                | suppress       | preflight error        |
| SceneModePicker      | suppress                | suppress       | preflight error        |
| ProjectionPicker     | suppress                | suppress       | preflight error        |
| NavigationHelpButton | suppress                | suppress       | preflight error        |
| VRButton             | suppress                | suppress       | preflight error        |

P6不增加planar base-layer picker property、provider catalog、picker option或CSS。应用通过
`world.imageryLayers`显式管理图层。

### Selection、InfoBox 与 Entity navigation guard

planar Viewer继续安装left-click selection，保留Entity/Primitive selection、selectedEntity、
SelectionIndicator和InfoBox title/description。必须以真实planar Scene/Cartesian3对象验证
indicator与display，而不是只测试mock getter。

planar branch必须：

- 不安装默认left-double-click tracking action；
- 让InfoBox camera control始终disabled，`_onTick`不得因为selected Entity position重新启用；
- 对`trackedEntity = definedEntity`同步抛`DeveloperError`；
- 允许`trackedEntity = undefined`，便于Viewer clear/destroy通用路径；
- 对`zoomTo(...)`和`flyTo(...)`在建立Promise或camera/data-source mutation前同步抛
  `DeveloperError`。

没有定义world的Viewer保持原double-click、InfoBox camera、tracking、zoom和fly行为。P6不为
Entity position定义planar CRS metadata，不承诺clamp、bounding sphere或flight。

### Sandcastle 与公开文档

新增唯一高层案例：

```text
packages/sandcastle/gallery/scenegis-planar-viewer/
├── index.html
├── main.js
└── sandcastle.yaml
```

案例显式创建完整EPSG:3857正方形world，使用其canonical`tilingScheme`创建
`SceneGISPlanarUrlTemplateImageryProvider`和layer，再调用`new Viewer({ world })`。OSM endpoint、
maximum level、visible linked attribution和usage-policy边界沿用P5批准的设置。不得在Viewer
构造器中增加隐式provider，也不得添加picker。

`sandcastle.yaml`标记`development: false`。自动化测试使用本地fixture或request interception；
公开OSM只做人工best-effort验证，失败不能成为CI结果。P5低层案例继续保留并能构建。

更新`Architecture.md`、`DevelopmentGuide.md`和必要JSDoc，说明：

- high-level Viewer与low-level CesiumWidget两种组装方式；
- no generic planar provider picker；
- planar option/widget矩阵；
- controller与world ownership/destroy顺序；
- Entity navigation明确不支持；
- OSM案例不是默认online dependency。

## 影响路径

### 允许新增或修改的产品路径

```text
packages/widgets/Source/SceneGIS/SceneGISPlanarHomeButton.js
packages/widgets/Source/SceneGIS/SceneGISPlanarHomeButtonViewModel.js
packages/widgets/Source/Viewer/Viewer.js                 # upstream-owned, SGP-0002 only
```

如实现需要SceneGIS-owned小型private widget helper，可新增到
`packages/widgets/Source/SceneGIS/_private/**`并标记`@private`；先在本计划“偏差与结果”登记。
不得以helper规避Viewer public seam或复制Viewer/HomeButton主体。

### 允许新增或修改的 Specs

预计至少包含：

```text
packages/widgets/Specs/SceneGIS/SceneGISPlanarHomeButtonSpec.js
packages/widgets/Specs/SceneGIS/SceneGISPlanarHomeButtonViewModelSpec.js
packages/widgets/Specs/SceneGIS/SceneGISPlanarViewerSpec.js
Specs/e2e/scenegis-planar-viewer.spec.js                  # 若当前e2e入口适合该验证
```

Execution Agent应按当前runner和symbol basename调整精确文件划分，并在本计划记录source-to-spec
mapping。不能修改上游Specs来隐藏Globe regression；现有Viewer/CesiumWidget/Scene/Globe Specs
作为回归直接运行。

### 允许新增或修改的文档与治理路径

```text
.scenegis/upstream-patches.json                          # add SGP-0002 only
Documentation/SceneGIS/Architecture.md
Documentation/SceneGIS/DevelopmentGuide.md
Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md
AgentDocs/planar-world/**
packages/sandcastle/gallery/scenegis-planar-viewer/**
```

### 禁止路径

- `packages/engine/Source/**`、`packages/engine/Specs/SceneGIS/**` 的产品/契约修改；只允许运行回归。
- 除`Viewer.js`外任何existing `packages/widgets/Source/**`文件，包括`widgets.css`。
- P5 `scenegis-planar-imagery`案例的产品行为变更。
- generated `index.js`/`index.d.ts`、`Source/Cesium*`、`Build/**`、`SpecList.js`和API HTML。
- P7 plan、review、发布配置或性能优化。

## 执行步骤

1. **重新发现与所有权登记**
   - 使用code graph确认Viewer constructor/options/getters/methods/destroy、HomeButton、InfoBox、
     selection handlers、ControllerHost和Sandcastle发现入口。
   - 用upstream baseline确认`Viewer.js`所有权；在manifest创建`SGP-0002`，tests指向planar
     Viewer Specs，decision指向ADR-0006。
   - 在任何代码修改前把actual source-to-spec mapping写入本计划。
2. **实现SceneGIS-owned planar Home**
   - 先实现view model command及其validation/event Specs，再实现DOM widget/destroy Specs。
   - 验证public export/type/docs；不修改CSS或生成文件。
3. **建立Viewer preflight与world forwarding**
   - 在DOM mutation前识别并验证planar mode完整option matrix。
   - 只在planar branch向CesiumWidget传递world/SCENE3D/scene3DOnly；Globe branch保持原控制流。
   - 所有upstream hunk使用`SGP-0002`paired markers和英文说明。
4. **闭合controller与Home生命周期**
   - 关闭legacy inputs、创建/注册planar controller、公开readonly getter。
   - 创建planar Home并保留command hooks。
   - 在Viewer destroy中先remove controller；覆盖失败回滚和exactly-once disconnect。
5. **应用widget allowlist与Entity guard**
   - 默认抑制不兼容widgets，保留兼容widgets。
   - 保留left-click selection，跳过double-click tracking，固定InfoBox camera disabled。
   - guard trackedEntity/zoomTo/flyTo；证明Globe路径未变化。
6. **增加Viewer Sandcastle与开发文档**
   - 使用显式EPSG:3857 world/OSM provider/layer，不加入picker或implicit provider。
   - 更新Architecture/DevelopmentGuide和JSDoc，完成本地fixture自动化与人工best-effort说明。
7. **验证、审计与交回评审**
   - 运行下述最小充分矩阵，记录exact direct/aggregate case counts与命令结果。
   - 审计相对P5 checkpoint的upstream-owned files、SGP marker pairs、generated status和禁区。
   - 创建`AgentDocs/planar-world/reviews/2026-08-06-p6-planar-viewer-integration.md`，状态
     `pending`；P6/roadmap/index保持`active`，停止并通知Architecture Agent。

不得在Architecture review之前把P6标记`completed`、提交、push或进入P7。

## 验证

Execution Agent应先确认当前仓库真实script/runner名称。下面列出验收scope，不允许把不存在的
命令或`0 SUCCESS`写成通过。

### Planar Viewer constructor 与 fail-fast

- valid live world创建成功，`viewer.scene.world === world`且`scene.globe === undefined`；
- destroyed world、world:false、generic/structural world均抛`DeveloperError`；
- defined globe（含false）、非SCENE3D、scene3DOnly:false均在child DOM/WebGL/controller/request
  mutation前抛错；
- base/legacy imagery/view-model/terrain/map projection冲突逐项覆盖，尤其`baseLayer:false`按P1
  strict contract拒绝；
- unsupported widget option的undefined默认抑制、false允许、显式enable/config拒绝；
- `ellipsoid`不改变world coordinateSystem/tilingScheme identity；允许选项能透传并保持行为；
- preflight error后container child count、Context/controller/provider request counters无delta。

### Controller 与生命周期

- 每个planar Viewer恰好注册一个controller，legacy `enableInputs === false`，getter返回同一
  instance；Globe Viewer getter为undefined且legacy行为不变；
- first render/home在PerspectiveFrustum、PerspectiveOffCenterFrustum、OrthographicFrustum、
  OrthographicOffCenterFrustum代表fixture下有限且覆盖extent；
- controller.enabled false/true不重建controller或aggregator，且不会恢复legacy inputs；
- registration failure没有残留aggregator/ControllerHost entry；正常destroy先remove controller，
  disconnected exactly once，然后world/resource按P1-P5顺序销毁；
- 同一world传给第二个Context的误用保留现有fail-fast signal；文档不宣称constructor owner lock。

### Home、widgets 与 Entity

- Home ViewModel command调用`controller.viewHome(scene)`一次，从不调用`camera.flyHome`；
  `beforeExecute/afterExecute`各一次且可取消/观察标准command语义；
- Home Button container/viewModel/DOM/destroy遵循widgets模式，无新增CSS依赖；
- planar Viewer home默认创建、false不创建，getter union的runtime分支正确；Globe仍为原HomeButton；
- InfoBox/SelectionIndicator/Animation/Timeline/Fullscreen默认与显式false矩阵正确；被禁止widget不
  创建DOM实例或发起service初始化；
- left-click可选择planar Entity/Primitive并更新indicator/InfoBox；InfoBox camera始终disabled；
- left-double-click不设置trackedEntity；defined trackedEntity、zoomTo、flyTo同步抛错且无camera/
  promise/data-source mutation；trackedEntity=undefined可重复清理；
- 既有Globe Viewer double-click tracking、InfoBox camera、zoom/fly Specs全部保持通过。

### Imagery、render 与示例

- Viewer路径下显式P5 layer能渲染本地fixture像素、显示credit、完成depth pick，并在warm frame
  保持controller/command/request/texture/shader identity与零意外allocation delta；
- zero-layer planar Viewer仍走P3 lazy path，不因Viewer创建imagery container/provider request；
- Sandcastle discovery中唯一新增`SceneGIS Planar Viewer`，`development:false`，无generic picker；
- 自动化拦截OSM请求或使用本地fixture验证XYZ方向、controller交互、Home和attribution DOM；
  人工公网结果单独记录且不冒充CI。

### 回归、构建、类型与所有权

至少运行并记录：

- 新增Home/ViewModel/planar Viewer direct suites与适用WebGL/e2e suites；
- upstream Viewer、HomeButton、InfoBox、SelectionIndicator、CesiumWidget widgets回归；
- engine P1 world-CesiumWidget、P3 surface/world、P4 camera/controller/picking、P5 imagery/Widget，
  以及`Scene`、`Globe`、engine `CesiumWidget`代表性回归；
- `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run build-docs`和`npm run tsc`；
- Sandcastle gallery/build；若standard embedding因已知外网metadata失败，必须如实记录并使用仓库
  支持的no-embedding命令补充，不能把失败写成通过；
- scoped ESLint、JavaScript/Markdown Prettier、Markdownlint、`git diff --check`。

类型/API断言至少覆盖：

- `Viewer.ConstructorOptions.world?: SceneGISPlanarWorld`；
- readonly `Viewer.planarCameraController: SceneGISPlanarCameraController | undefined`；
- `Viewer.homeButton`包含`HomeButton | SceneGISPlanarHomeButton | undefined`；
- 两个planar Home public types出现在widgets root JS、declarations与API HTML；
- private helper（若有）不出现在declarations/API HTML；
- `SCENEGIS_PATCH` marker在generated declarations/API HTML命中0；
- 所有generated/Build/SpecList文件在Git status中命中0。

最终ownership audit相对
`ac56b9c6f79cf813e1c6b8208bfdf1138f2c4a4c`：

- upstream-owned product files必须恰好为`packages/widgets/Source/Viewer/Viewer.js`；
- `SGP-0002` manifest file list与真实diff一致，所有可注释hunk marker成对；
- `SGP-0001`内容、两个engine upstream files和marker不变；
- SceneGIS-owned源码不得出现`SCENEGIS_PATCH` marker；
- 禁止路径diff为0。

## 风险与依赖

- `Viewer.js`是高频上游文件，constructor和destroy均较长。所有planar判断必须局部化，避免把
  Globe branch重排或格式化；`SGP-0002`风险至少记为`high`并列出聚焦Specs。
- Viewer构造失败回滚复杂。参数冲突优先preflight；只有Context/controller阶段才可能发生的失败
  必须有确定性cleanup evidence。
- HomeButton DOM/Knockout实现可能依赖private convention。优先复用稳定public/tooling pattern，不
  复制整类；若必须修改CSS或构建导出，暂停并重新评审。
- SelectionIndicator虽然使用Cartesian3，仍可能在SceneTransforms或Entity position更新中暴露
  Globe假设；P6只承诺已测的selection/display，不得顺带扩展tracking/clamping。
- `Viewer.homeButton` getter的union会影响generated declaration。不能为了让类型通过而手改生成
  文件或降低为`any`。
- OSM网络/SLA和Sandcastle embedding metadata是外部依赖，只能作为人工best-effort信号；所有
  correctness证据必须有本地可控替代。
- 同一world跨Viewer误用没有constructor owner lock。文档必须清楚，P3 second-Context guard是
  failure signal，不是共享支持。

## 完成条件

- 目标中的public API、controller ownership、Home、widget allowlist、Entity guard、Sandcastle和
  文档全部实现，且没有扩大到非目标。
- 所有新增行为有SceneGIS-owned Specs；上述constructor/lifecycle/render/Globe回归和构建矩阵
  通过或对真实外部失败如实记录。
- public types/API docs准确，无private/marker泄漏，无generated diff。
- upstream-owned product diff只包含`Viewer.js`，`SGP-0002`有效、marker成对、ADR互相引用；
  `SGP-0001`与engine upstream files不变。
- Execution Agent回写source-to-spec mapping、实现偏差、exact command/case结果、ownership audit和
  剩余风险，创建pending review并停止。
- Architecture Agent完成code/architecture review，所有finding均被确认fixed、deferred到明确后续
  plan或接受；review转为`approved`。
- Architecture Agent把P6 plan/roadmap/index转为`completed`，使用中文提交信息创建独立本地
  checkpoint；不push。
- checkpoint完成后停下与项目负责人讨论P7，不自动创建或执行P7 plan。

## 偏差与结果

- 当前状态：focused Architecture re-review 已确认 P6-R001 至 P6-R004 全部为`fixed`；P6
  review 为`approved`，phase 为`completed`。
- 批准边界：不提供通用平面底图选择器；Viewer只接受live
  `SceneGISPlanarWorld`；automatic controller ownership无constructor opt-out；planar Home立即
  调用`viewHome`；InfoBox保留显示但关闭camera；Entity tracking/zoom/fly fail-fast；默认抑制
  Earth/unsupported widgets。
- implementation diff base：
  `ac56b9c6f79cf813e1c6b8208bfdf1138f2c4a4c`。
- 实际source-to-spec mapping：
  - `SceneGISPlanarHomeButton.js` -> `SceneGISPlanarHomeButtonSpec.js`；
  - `SceneGISPlanarHomeButtonViewModel.js` -> `SceneGISPlanarHomeButtonViewModelSpec.js`；
  - `Viewer.js`的P6 integration seam -> `SceneGISPlanarViewerSpec.js`。
- 实际产品路径与设计：
  - 新增两个 public SceneGIS planar Home 类型，复用现有 toolbar CSS；command 只调用
    `controller.viewHome(scene)`并保留标准 command hooks；
  - `Viewer.js`在 child DOM 之前完成planar option preflight，只接受live
    `SceneGISPlanarWorld`，转发同一world，自动关闭legacy inputs、注册一个planar controller，
    并在CesiumWidget/world destroy之前配对remove；
  - planar Viewer默认创建planar Home并应用widget allowlist；保留left-click selection与
    InfoBox展示，关闭InfoBox camera与double-click tracking，对defined trackedEntity、
    `zoomTo`和`flyTo`同步fail-fast；
  - 新增`scenegis-planar-viewer`案例，显式组装EPSG:3857 world与canonical OSM imagery；
    未增加private helper、CSS、engine product或E2E路径。
- Direct unique cases：`SceneGISPlanarHomeButtonSpec.js` 3、
  `SceneGISPlanarHomeButtonViewModelSpec.js` 4、`SceneGISPlanarViewerSpec.js` 18，合计
  `25`；substring aggregate只作为runner证据，不重复计数。
- 实际upstream-owned product files：仅`packages/widgets/Source/Viewer/Viewer.js`；
  `SGP-0002`已在修改该文件前以`active`/`high`登记。
- 验证结果：
  - finding fix后的P6 direct aggregate `25 SUCCESS`（3+4+18）；P1 world Widget 16、P3
    Surface 22、P3 World 14、
    P4 camera aggregate 33、P4 controller 25、P4 navigation Widget 4、P5 imagery Widget 9，
    均Exit 0；Scene 259、Globe 119、HomeButton 11、InfoBox 9、SelectionIndicator 12均Exit 0；
  - engine `Widget/CesiumWidget`完整aggregate在本机runner超时，随后两个代表用例
    `can create, render, and destroy`及`does not create a globe if option is false`分别
    `1 SUCCESS`；P1专项目录的16例提供world构造回归；
  - focused fix rerun的`Widgets/Viewer`命令命中Viewer 59例和mixin 23例，合计
    `82 SUCCESS`；Architecture已用clean P5/current P6的`59/59`确认早先两个超时为timing
    flakes；
  - focused fix rerun的`npm run build`、`build-ts`、`build-docs`、`tsc`均Exit 0；此前
    `build-release`也为Exit 0；
    `build-ts`只有既有repository-wide TSD-JSDoc warnings；public root/declaration/API HTML
    精确断言覆盖`world`、readonly controller、Home union和两个public类型，private/marker
    生成命中0；
  - scoped ESLint、JavaScript/JSON/Sandcastle Prettier均Exit 0；最终文档Prettier、
    Markdownlint与`git diff --check`在review request创建后复跑；
  - standard gallery embedding因Hugging Face tokenizer metadata访问失败而Exit 1；仓库支持的
    no-embedding gallery Exit 0并发现305个案例，no-embedding Sandcastle build Exit 0，只有
    plugin timing/chunk-size warnings；
  - 8090人工检查可发现唯一`SceneGIS Planar Viewer`，源码、metadata与控制台均正确；主页面和
    standalone预览均停留在Sandcastle Bucket loading placeholder，因此本轮不宣称OSM画面、
    导航与visible credit已完成目视验收。自动化本地WebGL fixture已覆盖imagery pixel、credit、
    depth、warm allocation和zero-layer lazy path。
- Ownership audit：相对P5 checkpoint，upstream-owned product file恰为`Viewer.js`；
  `SGP-0002` marker成对，`SGP-0001`与两个engine upstream files不变；P6 SceneGIS-owned源码
  marker为0；generated/Build/SpecList status为0；未commit、未push。
- Architecture independent review：首次review前P6 direct aggregate为`21 SUCCESS`；focused
  re-review独立复跑最终Viewer `18/18`与Home/ViewModel `7/7`，确认最终`25/25`。Architecture
  本轮`Widgets/Viewer`为`80/82`，仍是同两个未修改non-planar render-loop/error-panel timing
  failures；Execution同一fix state取得`82/82`，且此前clean P5/current P6对照均为`59/59`，因此
  继续作为runner flakes接受。Architecture独立复跑`build`、`build-ts`、`build-docs`和`tsc`
  均Exit 0；`build-ts`只有既有TSD-JSDoc warnings。Sandcastle placeholder继续作为外部/人工
  限制记录，不阻断本地确定性WebGL证据。
- 首轮finding：P6-R001要求controller constructor与registration共享原子rollback；P6-R002
  要求ControllerHost数量和disconnect-before-world-destroy证据；P6-R003补齐真实positioned
  Entity/Primitive、SelectionIndicator、InfoBox override、Home/兼容widget false和controller
  identity矩阵；P6-R004收窄首个SGP import marker。
- Finding修复结果：
  - P6-R001：constructor与registration已进入同一`try`，并用public host count区分实际插入；
    constructor-dead fixture证明原错误重抛、host/connect/disconnect为0、world与owned
    ClockViewModel各销毁一次、DOM为0；pre-host failure fixture证明已构造但未插入的controller
    不被remove/disconnect；
  - P6-R002：成功与registration-failure fixtures直接观察ControllerHost baseline/count delta、
    live-world disconnect、world destroy顺序和exactly-once cleanup；
  - P6-R003：新增positioned direct/primitive Entity selection、finite SelectionIndicator、
    InfoBox camera override、Home/兼容widget explicit-false、controller/aggregator identity及
    ellipsoid identity证据；
  - P6-R004：首个marker仅包住三个新增engine imports；marker pairing、generated marker 0 hit、
    build/format均通过。
- Architecture review：
  [P6 planar Viewer integration review request](../reviews/2026-08-06-p6-planar-viewer-integration.md)
  为`approved`；P6-R001 至 P6-R004 均经 reviewer 确认为`fixed`。Architecture Agent将本阶段
  代码、Specs、ADR/通用文档和AgentDocs形成独立本地checkpoint；不push、不创建P7 plan、
  不进入P7。
