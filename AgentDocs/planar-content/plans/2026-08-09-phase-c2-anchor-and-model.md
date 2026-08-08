# C2 平面锚点内容与普通 Model

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`C2-anchor-and-model`
- 状态（Status）：`completed`
- 父计划（Parent plan）：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-09`
- 更新日期（Updated）：`2026-08-09`
- Planning base：`9ebd11dd12d03d28243ca77db2c0f10d438659d6`
- 分支（Branch）：`feature/planar-content`
- 相关讨论（Related discussions）：项目负责人与 Architecture Agent 已一次性确认 C2 完整设计；未创建
  独立 discussion
- 相关评审（Related reviews）：
  [C2 anchor and model review](../reviews/2026-08-09-c2-anchor-and-model.md)（`approved`）
- ADR：
  [ADR-0013：平面内容坐标、高度、朝向与兼容性基线](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)、
  [ADR-0014：平面锚点内容与普通 Model Visualizer](../../../Documentation/SceneGIS/Decisions/ADR-0014-planar-anchor-and-model-visualizers.md)
- SGP：None；C2 禁止修改 upstream-owned files

## 阶段目标

在不修改 Cesium 上游文件、不接入 Viewer/DataSourceDisplay 的前提下，实现两个可被后续 C4
instance-owned display integration组合的 private planar visualizer：

1. 使用 Cesium 低层 collection/pool 渲染 Point、Billboard 和 Label；
2. 使用 `Model.fromGltfAsync` 与 `scene.primitives` 渲染普通 glTF Model；
3. 让四类内容统一遵守 ADR-0013 的米制 Cartesian3、fixed planar axes、HeightReference resolver、
   extent、eventual resident-height 与 original Entity picking contract；
4. 固定异步 generation、slot/Model ownership、bounding sphere、warm reuse 与 exactly-once destroy行为；
5. 通过 focused unit Specs 和一个 local-fixture real WebGL Spec证明可见性、picking、大坐标与资源收敛。

C2 的交付是 private runtime building block，不是自动 Entity/DataSource 产品入口。只有 C4 完成后才可以
宣称 `viewer.entities` 在 planar Viewer 中自动渲染这些 graphics。

## 非目标

- 不修改 `DataSourceDisplay`、`CesiumWidget`、Viewer 或默认 visualizer list。
- 不使用 private global `DataSourceDisplay.registerVisualizer`，不通过 prototype patch或加载顺序安装
  visualizer。
- 不实现 `CustomDataSource`/Viewer 自动集成、aggregate compatibility validator或 unsupported Entity
  graphics 的全局检查；这些属于 C4。
- 不实现 Polyline、Polygon、GeometryUpdater、terrain drape/extrusion；这些属于 C3。
- 不支持 Entity clustering；`EntityCluster.enabled === true` 明确 fail-fast。
- 不支持 Model shadows、vertical exaggeration、dynamic environment map、clipping planes、custom shader、
  classification、project-to-2D或 PBR customization。
- 不实现 3D Tiles、GeoJSON/CZML/KML转换、tracking、`flyTo`、`zoomTo`、地下模式或碰撞。
- 不增加 public API、World method、terrain subscription/request、content readiness或新的 Entity/Property
  system。
- 不新增 Sandcastle、Widget/E2E/performance测试，不开始 C3 设计或实现。

## 进入条件

- C1 已通过 Architecture/code review，并形成 checkpoint
  `9ebd11dd12d03d28243ca77db2c0f10d438659d6`。
- 项目负责人已批准 ADR-0014 中的 private visualizer、EntityCluster disabled、Model profile、async
  generation、ownership 与 C4 integration boundary。
- 本 phase plan和 ADR-0014 由 Architecture Agent形成独立 planning checkpoint后，Execution Agent
  才能开始实现。
- Execution Agent留在 `feature/planar-content`，从干净 planning checkpoint开始，不创建额外阶段分支。
- 开始前完整阅读根、`packages/engine`、`AgentDocs` 的 `AGENTS.md`，以及
  `Documentation/SceneGIS/Architecture.md`、`DevelopmentGuide.md`、`PlanarContentGuide.md`、父计划、
  ADR-0013、ADR-0014和 C1 completed plan。
- 先用 codebase knowledge graph重新确认当时的 collection/visualizer、EntityCluster、Model、
  DataSourceDisplay、Spec discovery与生成边界；源码事实有实质变化时暂停回报，不按本计划猜测兼容层。

## 当前源码事实

1. C1 `_SceneGISPlanarPositionResolver` 已提供无请求、无持有、同步的 absolute/clamp/relative位置解析；
   outside extent返回`undefined`，resident terrain缺失时稳定回退Z=0。
2. 默认 Billboard/Label/clamped Point visualizer会进入 ellipsoid clamping；默认 Model visualizer在缺省
   orientation时创建ECEF ENU frame，均不能直接复用。
3. `EntityCluster` disabled状态不会进入 camera cartographic/ellipsoid occlusion path，并提供现有
   Point/Billboard/Label get/remove pool；enabled clustering不满足 planar contract。
4. PointPrimitive、Billboard和Label低层对象接受绝对Cartesian3与Entity `id`，可复用既有 collection
   update、GPU batching和picking。
5. `Model.fromGltfAsync`可以不传height-clamping `scene`，Model可以由visualizer加入
   `scene.primitives`；dynamic environment map可显式disabled。
6. `Entity.computeModelMatrix`的undefined orientation依赖ENU；defined Quaternion最终可以转为Matrix3。
   C2必须自建窄小planar matrix helper逻辑，不能调用该方法。
7. `DataSourceDisplay` constructor有`visualizersCallback`，但当前planar Viewer未注入。C2没有充分理由
   修改upstream；C4才处理instance-owned integration。
8. Scene normal update与resident terrain promotion存在一帧eventual consistency；C2每次update重新调用
   resolver即可，不建立terrain事件或第二套generation。

源码行号不是契约。若图谱未索引先运行项目规定的 index；图谱不足时才使用 `rg` 或定点读取。

## 详细设计

### 运行时角色

预期新增：

```text
packages/engine/Source/SceneGIS/DataSources/_private/
  _SceneGISPlanarAnchorVisualizer.js
  _SceneGISPlanarModelVisualizer.js
```

二者为 default-exported constructor/class，使用英文 JSDoc/注释并标记 `@private`。允许在同一 `_private`
目录新增一个真正被两者共享、职责单一的 helper，但 Execution必须在结果中说明必要性、source-to-spec
mapping和升级边界；不得复制上游完整 visualizer。

构造器全部 validation必须发生在 subscription、slot、request、Model或scene primitive mutation之前。
二者遵循当前 Cesium Visualizer interface习惯：

- `update(time)`；
- `getBoundingSphere(entity, result)`；
- `isDestroyed()`；
- `destroy()`。

具体 constructor参数顺序依据源码风格决定，但只能显式接收所需的 live World、Scene、
EntityCollection和 Anchor所需caller-owned EntityCluster，不能从全局状态发现对象。

### `_SceneGISPlanarAnchorVisualizer`

#### Ownership 与 slot

- 构造要求 live `SceneGISPlanarWorld`、有效 Scene、`EntityCollection`和
  `entityCluster.enabled === false`。
- EntityCluster、collection、Scene、World和Entity均由caller拥有；visualizer只拥有collection event
  subscription与为Entity graphic取得的pool slot。
- Point使用PointPrimitive slot；三个approved HeightReference都不切换为Billboard。
- Billboard和Label使用对应slot。原始Entity始终写入slot `id`。
- Entity可以同时有三个graphic，每个graphic独立取得/隐藏/释放slot。
- `show=false`、availability false、position暂时undefined或outside extent只隐藏已有slot并保留identity。
- Entity从collection移除、graphic或position Property被移除时归还对应slot；destroy归还全部slot并
  exactly-once断开subscription。重复destroy遵循仓库既有destroyObject约定。

#### 更新与原子失败

每次normal `update(time)`：

1. 读取Entity show/availability、position、graphic show和支持属性；
2. 在取得或修改slot前验证position、HeightReference及会写入低层对象的derived values；
3. 为每个存在且可显示的graphic调用C1 resolver，得到绝对Cartesian3或outside `undefined`；
4. `undefined`只隐藏，不修改camera/property；成功才取得/更新slot；
5. 低层Billboard/Label `heightReference`始终写`NONE`，Point保持PointPrimitive；
6. 对动态Property每帧重新求值并更新必要字段，未变化值不造成slot/resource churn。

非法position、unsupported HeightReference或非法映射值必须在该graphic首次slot acquisition/mutation前
抛英文`DeveloperError`。一个Entity同时有多个graphic时，以当前graphic为原子边界；不得留下本轮新建
但未初始化的slot。

#### 支持属性

C2支持当前 `PointGraphics`、`BillboardGraphics`、`LabelGraphics` 中可一对一映射到对应低层对象且
不触发ellipsoid/Globe路径的全部属性。Execution必须：

- 基于当前源码列出source property到low-level property的映射；
- 为三类graphic的representative static和dynamic属性提供系统化Spec；
- 对涉及distance、pixel offset、origins、scale、color、outline、font/style、eyeOffset、disableDepth、
  translucency/scale/pixelOffset distance和split direction等当前存在的direct fields保持Cesium语义；
- 将Billboard `alignedAxis`解释为固定planar world axis，不进行ellipsoid local-frame转换；
- 若发现某个现有property实际触发Globe-only或无法安全直映，停止并请求Architecture裁决，不能静默
  忽略或擅自缩小“全部direct equivalents”的批准范围。

Anchor visualizer不读C3 graphics，也不对未安装的默认visualizer负责。C4将集中执行Entity-level
allowlist并保证不同时运行消费相同graphic的Globe visualizer。

### `_SceneGISPlanarModelVisualizer`

#### Planar transform

- Position由C1 resolver解析；outside返回`undefined`时隐藏existing Model。
- Orientation undefined：以position构造translation-only `Matrix4`，rotation identity。
- Orientation defined：要求finite、norm非零Quaternion，采用能避免平方溢出/下溢的稳健归一化，再
  生成fixed planar XYZ rotation与translation。
- Derived quaternion、rotation和最终matrix所有元素finite后才修改Model；failure保持existing model和
  matrix不变。
- Uniform scale只写`Model.scale`；不得折入modelMatrix或调用
  `Entity.computeModelMatrix`/`Transforms.eastNorthUpToFixedFrame`。
- 大坐标translation保持JavaScript double matrix；局部glTF geometry与Cesium Model pipeline负责GPU
  relative-to-eye/encoding。

#### ModelGraphics compatibility profile

支持：

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

在任何新generation resource mutation前拒绝：

- `enableVerticalExaggeration === true`；
- defined且非`ShadowMode.DISABLED`的`shadows`；
- defined `environmentMapOptions`、`clippingPlanes`、`customShader`。

Undefined `enableVerticalExaggeration`/`shadows`合法，但低层Model仍分别固定为false/DISABLED。创建参数
固定为：`heightReference=NONE`、`enableVerticalExaggeration=false`、`shadows=DISABLED`、
`environmentMapOptions.enabled=false`、picking enabled，且不传用于clamping的Scene。普通Scene light和
Model material pipeline仍可工作；C2不扩展其视觉能力。

Execution必须依据当前 `ModelVisualizer`/`Model` 源码区分 load-time option和existing-model dynamic
style。若实际 option不能无reload安全修改，应归入generation key并回写实现偏差；不得留下旧配置继续
渲染却声称已更新。

#### Generation 与 lifecycle

每个Entity model slot至少具有：generation identity、load state、Promise/candidate、active Model和stable
failure状态。具体枚举私有。

- URI或任一load-time配置变化：invalidate generation，remove+destroy旧active Model，启动新load；无
  old-model fallback。
- 同generation每次update最多启动一次load；failure后不自动重试。
- Promise resolve只在visualizer尚live、Entity/graphic/position仍存在且generation匹配时保留candidate；
  否则立即exactly-once destroy candidate。
- Promise resolve/reject调用`scene.requestRender()`，但不在callback中add primitive或修改Entity。
- 下一次`update(time)`才把candidate加入`scene.primitives`并应用validated transform/style。
- Promise reject记录stable failure；URI/load-time变化后新generation可再次加载。
- Position、terrain height、orientation和non-load-time style改变只更新active Model，不reload。
- show/availability false、position undefined或outside只隐藏active Model并保留资源。
- Entity/model/position移除、URI替换和destroy均remove+destroy owned active/candidate exactly once；late
  completion不能复活。

Input Resource/URI对象、Entity、Collection、Scene与World均caller-owned。Visualizer只拥有自己创建的
Model和event subscription。

#### Bounding sphere、picking 与 readiness

- Original Entity作为Model `id`；real `scene.pick`必须返回该identity。
- Load pending或candidate尚未在normal update安装时，`getBoundingSphere`返回`PENDING`。
- 没有graphic/position、outside/hidden尚无ready Model或stable load failure时按当前Visualizer convention
  返回`FAILED`；ready visible/retained Model使用Model有效world bounding sphere并返回`DONE`。执行时必须
  对照upstream enum/行为固定exact boundary。
- Async success必须`scene.requestRender()`，使requestRenderMode下有后续update机会。
- C2不改变`world.tilesLoaded`；Model load/failure不构成World terrain/imagery readiness。

### C2 与 C4 的隔离

C2 Specs显式构造private visualizer并驱动update。不得新增临时公共factory、World getter、Viewer option或
global registry让测试方便。C4将在C2/C3完成后：

- 通过`DataSourceDisplay.visualizersCallback`或经Architecture批准的最小instance seam构造这些角色；
- 替换而非叠加默认消费者；
- 在automatic mutation前验证完整Entity compatibility allowlist；
- 协调CustomDataSource、Viewer selection与销毁顺序。

C2 文档必须继续明确 `viewer.entities` 尚不可用于automatic planar content。

## 影响路径

### 允许新增或修改的 SceneGIS-owned files

- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarAnchorVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarModelVisualizer.js`
- 同目录一个有明确共享理由的窄小private helper（可选，必须回写偏差）
- 对应的 `packages/engine/Specs/SceneGIS/DataSources/_private/**Spec.js`
- 一个位于 `packages/engine/Specs/SceneGIS/DataSources/**` 的C2 real WebGL integration Spec；若现有
  SceneGIS Spec组织要求放在Widget子目录，Execution先记录理由再使用最窄位置
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarContentGuide.md`
- `Documentation/SceneGIS/Decisions/ADR-0014-planar-anchor-and-model-visualizers.md`（仅实现事实有必要澄清时）
- `AgentDocs/planar-content/**`

### 复用但原则上不修改

- C1 `_SceneGISPlanarPositionResolver.js`

只有发现C1真实缺陷且修复严格属于既有contract时，Execution才可修改resolver及其现有Spec，并必须在
C2 review request中列为C1 correction；若会改变ADR-0013则暂停请求Architecture裁决。

### 禁止修改

- 所有 upstream-owned files，包括默认 Visualizer、`EntityCluster.js`、`DataSourceDisplay.js`、
  `Entity.js`、`ModelGraphics.js`、`Model.js`、`Scene.js`、`CesiumWidget.js`和`Viewer.js`
- `.scenegis/upstream-patches.json`、SGP-0001、SGP-0002或任何patch marker
- `SceneGISPlanarWorld.js`、planar terrain/surface/query/runtime、Renderer、Shader、Worker
- Widgets、Sandcastle、E2E、build/release scripts
- generated root exports、`.d.ts`、SpecList、API HTML和`Build/**`
- C3-C5产品、Spec、plan或review文件

若任何禁区被证明为实现C2所必需，Execution必须立即停止，保存只读源码事实与最小候选seam，交回
Architecture Agent；不得越权实现或登记SGP。

## 实施步骤

1. 从Architecture planning checkpoint读取全部约束、ADR和phase plan，确认工作树没有其他阶段变更。
2. 用codebase graph复核Point/Billboard/Label visualizer、EntityCluster pool、ModelVisualizer、
   `Model.fromGltfAsync`、bounding sphere、Scene primitive与Spec helper调用链。
3. 先实现Anchor visualizer的constructor/preflight、slot state、collection subscription和destroy，再完成
   三graphic property mapping与resolver update。
4. 完成Anchor focused Specs，固定clustering拒绝、三个HeightReference、dynamic/show/outside和slot
   lifecycle。
5. 实现Model planar transform validation、compatibility preflight与generation state，确保Promise callback
   不直接mutate scene collection。
6. 完成Model focused Specs，固定load/update/failure/stale/destroy、bounding sphere、requestRender和no-
   reload boundaries。
7. 增加唯一local-fixture real WebGL integration Spec，闭环四类content、pick、大坐标、warm identity和
   destroy balance；不得访问网络。
8. 将稳定且已实现的C2能力精简更新到Architecture、DevelopmentGuide和PlanarContentGuide；不要复制
   整个phase plan，也不要宣称C4已完成。
9. 运行最小充分验证，确认private symbols不进入declarations/API，generated files不在status。
10. 审计base diff、allowed paths、upstream ownership、SGP、patch markers和resource lifecycle。
11. 回写本plan的实际source-to-spec mapping、case count、命令结果、偏差、ownership与剩余风险；创建
    `AgentDocs/planar-content/reviews/2026-08-09-c2-anchor-and-model.md`，状态`pending`，同步索引/handoff。
12. 停止，不提交、不push、不进入或设计C3，等待Architecture/code review。

## 验证要求

### Anchor focused Specs

至少覆盖：

- Point、Billboard、Label各自static创建、original Entity id和remove/destroy；
- 一个Entity同时持有三graphic，slot互不覆盖；
- `Entity.isShowing`、availability、graphic show、dynamic position/property更新；
- `NONE`、`CLAMP_TO_GROUND`、`RELATIVE_TO_GROUND`与低层NONE/PointPrimitive证据；
- exact extent edge/corner、outside隐藏且不camera home；
- temporary hidden/undefined/outside保留slot identity，graphic/position/entity removal归还slot；
- caller-owned EntityCluster不被destroy；enabled clustering在subscription/slot mutation前失败；
- representative/systematic direct property mapping，尤其Billboard alignedAxis固定world axis；
- invalid position、HeightReference及derived property preflight atomicity；
- repeated warm update不新增slot、不改变稳定identity。

不需要为每个数值property生成大量组合边界；按用户要求保持验证有边界，用系统化代表fixture证明完整
mapping即可。

### Model focused Specs

至少覆盖：

- undefined orientation得到translation-only identity rotation；defined非单位Quaternion稳健归一化；
- invalid/zero Quaternion与non-finite derived matrix在mutation前失败；
- identity与non-identity transform下fixed planar matrix语义；
- 三个HeightReference、resident terrain更新、outside/hidden保留active Model；
- supported profile的load-time/dynamic代表映射与fixed Model options；
- position/orientation/style更新不reload；URI或load-time generation变化destroy旧Model并只load一次；
- success只缓存candidate/requestRender，下一update才add；failure stable/no infinite retry；
- stale resolve、entity/graphic/position removal、destroy、late settlement exactly-once cleanup；
- `getBoundingSphere`的PENDING/FAILED/DONE和original Entity pick id；
- unsupported vertical exaggeration/shadows/environment/clipping/custom shader在resource mutation前失败。

使用local glTF/Model fixture或现有Cesium test helper，禁止网络。可以对`Model.fromGltfAsync`做instance/
module-level最窄spy，但不得修改产品源码暴露测试hook或使用prototype monkey patch。

### Real WebGL integration Spec

一个受控场景至少证明：

- Point、Billboard、Label、普通Model同时产生可见像素；
- 对四类对象的代表性screen position执行`scene.pick`，返回各自原始Entity；
- 使用EPSG:3857量级world offset时pose、bounds、pixels均finite/可见，Model保持局部geometry+double
  modelMatrix路径；
- 一个terrain-relative anchor与Model使用同一C1 resolver结果；不需要重复terrain request状态矩阵；
- warm normal frames保持slot/Model/primitive/command或可观测资源identity稳定，无重复load；
- visualizer destroy后slot、Model、subscription与GPU/primitive ownership平衡，caller-owned world/scene/
  EntityCluster保持live。

### 必须运行

使用实际Spec basename执行最窄等价命令：

```text
npm run test -- --includeName "SceneGISPlanarAnchorVisualizer"
npm run test -- --includeName "SceneGISPlanarModelVisualizer"
npm run test -- --includeName "<C2 real WebGL integration basename>"
npm run test -- --includeName "SceneGISPlanarPositionResolver"
npm run build
npm run build-ts
npm run build-docs
```

另运行：

- 仅覆盖新增/修改JS的scoped ESLint与Prettier；
- 仅覆盖SceneGIS/planar-content文档的Prettier与Markdownlint；
- `git diff --check`；
- `node scripts/scenegis/audit-upstream-patches.mjs`；
- 对生成结果做精确查询：两个private visualizer/helper在engine/Cesium `.d.ts`与API HTML中命中`0`，
  generated files在`git status`中为`0`。

默认不运行full upstream Entity/Model/DataSourceDisplay/Viewer suites、`build-release`、`tsc`、Sandcastle、
E2E或性能矩阵。只有实际改动越过对应边界并先获Architecture裁决后才扩大。

## 验收条件

- 两个private visualizer实现ADR-0014批准的constructor、update、bounding sphere与destroy contract。
- Point/Billboard/Label低层对象只接收absolute planar position；三个HeightReference都不进入ellipsoid
  clamping，Point始终为PointPrimitive。
- EntityCluster disabled pool被安全复用且caller ownership不变；enabled clustering原子拒绝。
- Model不调用Entity ENU transform或Model height clamp，undefined/defined orientation均满足fixed planar
  axes与finite atomicity。
- Model supported/rejected property profile、generation、failure/retry、late settlement和exactly-once resource
  lifecycle由focused Specs固定。
- Real WebGL证明四类内容可见、可pick、大坐标finite、warm reuse与destroy balance。
- C2不修改`world.tilesLoaded`，不建立terrain request/subscription，不自动接入Viewer/DataSourceDisplay。
- Durable docs明确当前能力和C4之前的使用限制；没有把private visualizer描述为public API。
- Focused Specs、build/types/docs和scoped checks通过；不要求无边界的全量验证。
- Upstream-owned files=`0`、C2 SGP=`0`、manifest/SGP-0001/0002 unchanged、new patch markers=`0`、
  generated status=`0`。
- Execution已回写plan/review/handoff，未commit、未push、未进入C3，并停在Architecture/code review gate。

## 预期 source-to-spec mapping

| Source/contract                          | Direct evidence                                   |
| ---------------------------------------- | ------------------------------------------------- |
| `_SceneGISPlanarAnchorVisualizer.js`     | Anchor focused Spec                               |
| `_SceneGISPlanarModelVisualizer.js`      | Model focused Spec                                |
| C1 resolver integration                  | 两个visualizer focused Spec + C1 resolver回归     |
| 四类content pixels/picking/large-offset  | 唯一C2 real WebGL integration Spec                |
| slot/Model/subscription/GPU ownership    | focused lifecycle + real Context destroy evidence |
| private declaration/API boundary         | exact generated declarations/API query            |
| Viewer/C4阶段隔离与compatibility profile | `PlanarContentGuide`和durable docs                |
| upstream/SGP/generated boundary          | audit + base diff + marker/status checks          |

## 风险与后续边界

- `EntityCluster` get/remove pool和Model load lifecycle是Cesium private/high-change surface；ADR-0014列出的
  upgrade checkpoints必须长期复核。
- Billboard/Label属性较多；实现必须系统化映射direct equivalents，但不应为每个枚举值扩张成无边界矩阵。
- Model Promise、scene primitive add和destroy存在跨frame interleave风险；generation identity与
  exactly-once candidate cleanup是review重点。
- `getBoundingSphere`在Model未ready、hidden和failure时需与Cesium Visualizer convention精确一致；实现
  期间以源码和focused evidence为准。
- C2 private visualizer尚不能由应用通过supported public path构造；这是刻意的阶段边界，不是遗漏。
- C3将独立处理Polyline/Polygon geometry与terrain关系，不能复用单点resolver冒充完整drape。
- C4仍可能发现Viewer/CesiumWidget/DataSourceDisplay需要最小upstream seam；若发生必须先登记SGP并由
  Architecture裁决。

## 执行结果

### 实际设计与路径

- 新增`_SceneGISPlanarAnchorVisualizer.js`：显式接收live World/Scene、caller-owned disabled
  `EntityCluster`和`EntityCollection`；一个item分别持有Point/Billboard/Label slot，采用C1 resolver，
  hidden/undefined/outside保留slot，graphic/position/entity removal与destroy归还。Point始终是
  `PointPrimitive`，Billboard/Label固定low-level `HeightReference.NONE`。
- 新增`_SceneGISPlanarModelVisualizer.js`：URI URL与`incrementallyLoadTextures`组成generation key；
  Promise completion只缓存candidate并`requestRender`，下一normal update才add。Transform采用fixed
  translation与overflow-safe Quaternion normalization；未增加共享helper或C1 correction。
- 新增两个private focused Specs与一个`SceneGISPlanarContentVisualizerSpec.js` real Context fixture；
  durable docs更新Architecture、DevelopmentGuide与PlanarContentGuide。C2 focused修复增加运行期disabled
  cluster门禁、Billboard image cache清理、联合Anchor bounds、property-aware preflight与Model candidate原子清理，
  没有修改ADR-0014批准契约。

最终source-to-spec mapping：

| Source/contract                      | Direct Spec                              | Direct cases |
| ------------------------------------ | ---------------------------------------- | -----------: |
| `_SceneGISPlanarAnchorVisualizer.js` | `SceneGISPlanarAnchorVisualizerSpec.js`  |           11 |
| `_SceneGISPlanarModelVisualizer.js`  | `SceneGISPlanarModelVisualizerSpec.js`   |            9 |
| 四类content real Context closure     | `SceneGISPlanarContentVisualizerSpec.js` |            1 |
| C1 resolver regression               | `_SceneGISPlanarPositionResolverSpec.js` |       既有11 |

C2新增direct unique cases=`21`。其中focused修复新增Anchor `4`、Model `2`；real Context仍为一个综合
case。该case现在从与`createScene`相同的engine module identity导入runtime，并从实际`scene.context`
判断Anchor能力；本机进入capable branch，实际执行Point/Billboard/Label/Model四类pick，Model normal-render
pixel region、大坐标、warm identity与slot/listener/caller-owned cluster/Model destroy闭环。Model路径不再因
Anchor capability被跳过。

### 验证结果

| Command/evidence                                                                       | Result                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/DataSources/SceneGISPlanarAnchorVisualizer"`  | Exit 0，`11/11`                                               |
| `npm run test -- --includeName "SceneGIS/DataSources/SceneGISPlanarModelVisualizer"`   | Exit 0，`9/9`                                                 |
| `npm run test -- --includeName "SceneGIS/DataSources/SceneGISPlanarContentVisualizer"` | Exit 0，`1/1`；本机capable，四类branch实际执行                |
| `npm run test -- --includeName "SceneGISPlanarPositionResolver"`                       | 首轮Exit 0，既有`11/11`；focused fix未触及C1 resolver，未重跑 |
| `npm run build`                                                                        | Exit 0                                                        |
| `npm run build-ts`                                                                     | 首轮Exit 0；focused fix无public API变化，按review要求未重跑   |
| `npm run build-docs`                                                                   | 首轮Exit 0；focused fix无public API变化，按review要求未重跑   |
| scoped ESLint/JS Prettier                                                              | Exit 0                                                        |
| scoped Markdown Prettier/Markdownlint                                                  | Exit 0                                                        |
| `git diff --check`                                                                     | Exit 0                                                        |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                     | Exit 0                                                        |

生成检查：两个private symbol在`packages/engine/index.d.ts`、`Source/Cesium.d.ts`及API HTML中合计命中
`0`；生成文件status=`0`。JS soft-private barrel自动发现保持仓库既有行为，不视为supported API。

### 偏差、ownership与风险

- 未增加可选shared helper；两个visualizer只共同复用C1 resolver。
- 首轮real Context capability check读取错误module identity的问题已修复。修复后的case使用同一engine
  module identity与实际`scene.context`，Model closure无条件执行，Anchor只在真实能力不足时分支；本机
  capable并实际执行四类content。未增加第二套GPU矩阵。
- 相对`aa2aba25778497b8d9fc3ffa2a9d483939968aa5`的产品/Spec diff全部位于SceneGIS-owned paths；
  upstream-owned files=`0`、C2 SGP=`0`、manifest/SGP-0001/0002 unchanged、new markers=`0`。
- C2仍是explicit private runtime；`viewer.entities`必须等待C4，未进入或创建C3实现/plan。

## 当前交接

- C2 Architecture/code focused re-review结论为`approved`；C2-R001～C2-R006全部关闭，phase状态为
  `completed`。
- Reviewer独立复跑Anchor`11/11`、Model`9/9`、Content real Context`1/1`与`npm run build`，均
  Exit 0；upstream audit确认upstream-owned files=`0`、C2 SGP=`0`、generated status=`0`。
- Current handoff：Architecture Agent形成独立C2本地checkpoint；后续从该checkpoint重新发现C3源码
  事实并创建C3 phase plan，不把C3实现混入本阶段。
