# C3 平面 Polyline、Polygon 与地表关系

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`C3-polyline-polygon`
- 状态（Status）：`completed`
- 父计划（Parent plan）：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人：Architecture Agent（依据项目负责人授予的后续阶段自主设计权限）
- 创建日期（Created）：`2026-08-09`
- 更新日期（Updated）：`2026-08-09`
- Planning base：`3bdd638661c14bfbf127b12dec3bd8c5e8e3f3ba`
- 分支（Branch）：`feature/planar-content`
- 相关讨论（Related discussions）：None；C3 完整设计直接提升为 ADR-0015
- 相关评审（Related reviews）：实现 ready 后创建
  `AgentDocs/planar-content/reviews/2026-08-09-c3-polyline-polygon.md`
- ADR：
  [ADR-0013](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)、
  [ADR-0015](../../../Documentation/SceneGIS/Decisions/ADR-0015-planar-polyline-polygon-and-vertex-drape.md)
- SGP：None planned；C3 默认禁止修改 upstream-owned files

## 阶段目标

在不进入默认 Globe GeometryUpdater/GroundPrimitive、不修改 Viewer/DataSourceDisplay 的前提下，新增
两个 private planar visualizer：

1. 让 `PolylineGraphics` 以 planar straight segments 渲染 absolute 或 supplied-vertex clamp lines；
2. 让 `PolygonGraphics` 支持 outer/direct holes、scalar/per-position height、vertex-sampled terrain、
   extrusion、caps、side walls、fill 和 outline；
3. 以 local geometry + `modelMatrix` 保持 EPSG:3857-scale 精度，并保留 original Entity picking；
4. 固定 dynamic Property、terrain replacement/LOD、topology replacement、warm reuse 和 exactly-once
   resource lifecycle；
5. 通过 focused unit Specs 与一个 real WebGL closure证明像素、hole、extrusion、depth、pick、大坐标和
   resource balance。

C3 交付的是 C4 自动 display integration 所需的 private building blocks；完成 C3 仍不能宣称
`viewer.entities` 自动渲染 Polyline/Polygon。

## 非目标

- 不修改 `DataSourceDisplay`、Viewer、CesiumWidget、默认 visualizer list 或 Globe Entity行为。
- 不支持 geodesic/rhumb、Globe GroundPrimitive、classification、shadows、texture material、
  depth-fail material、distance display condition、zIndex 或 arbitrary MaterialProperty。
- 不支持 nested hole/island、self-intersecting rings、extent clipping 或跨 extent 局部绘制。
- 不实现连续 terrain drape、自适应 subdivision、terrain request/sampling、content readiness 或地形订阅。
- 不为 `PolylineGraphics` 发明 relative-height Property。
- 不实现跨 Entity batching、对象数量性能资格、Sandcastle或自动 Viewer selection；分别留给 C5/C4。
- 不新增 public API、Worker、Shader、build/release seam、SGP 或 upstream-owned 修改。
- 不开始 C4 设计或实现。

## 进入条件

- C2 已通过 Architecture/code review并形成 checkpoint
  `3bdd638661c14bfbf127b12dec3bd8c5e8e3f3ba`。
- ADR-0015 已 approved，C3 phase plan由Architecture Agent形成独立planning checkpoint。
- Execution留在`feature/planar-content`，从干净planning checkpoint开始，不创建额外阶段分支。
- 开始前完整阅读根、`packages/engine`、`AgentDocs` 的 `AGENTS.md`，以及
  `Documentation/SceneGIS/Architecture.md`、`DevelopmentGuide.md`、`PlanarContentGuide.md`、父计划、
  ADR-0013、ADR-0015和C1/C2 completed plans。
- 使用codebase knowledge graph重新确认 Buffer collection、Graphics Property、triangulation、Spec discovery
  与生成边界；源码事实实质变化时暂停回报，不按计划猜测实现。

## 当前源码事实

1. C1 resolver是无请求、无持有、同步的 point resolver；outside extent返回`undefined`，resident height
   缺失时回退Z=0。C3必须逐supplied vertex调用它，不能绕过其HeightReference/finite contract。
2. 默认Polyline/Polygon updater与ground path依赖Ellipsoid、Cartographic、geodesic/rhumb、classification
   或Globe terrain，不是coordinate-system-neutral seam。
3. `PolygonPipeline.triangulate` 本身只打包Cartesian2并调用earcut，可以安全限定为XY triangulation；
   同模块其他subdivision/height方法不能复用。
4. `BufferPolylineCollection`/`BufferPolygonCollection`在SCENE3D支持DOUBLE positions、modelMatrix、显式
   bounds、pick objects与render/pick command；当前planar World固定SCENE3D。
5. Buffer collection是experimental，容量和非末尾primitive topology不可resize；`destroy()`释放renderer/
   PickId但`isDestroyed()`保持false。C3必须通过private owner封装candidate replacement和exactly-once状态。
6. Buffer polygon renderer只消费fill color与explicit triangles；outline需独立BufferPolylineCollection。
7. C2 private visualizer已固定EntityCollection subscription、normal update、getBoundingSphere、original Entity
   picking、candidate/current ownership和atomic cleanup范式，可复用范式但不能复制其无关实现。
8. C4尚未建立instance-owned`DataSourceDisplay.visualizersCallback`；C3只能显式构造。

## 固定设计

### 角色与构造

必需新增：

- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js`

允许在同一 private 目录新增至多一个真正被两者复用的 buffer owner/geometry helper；若没有实质共享，
保持file-local helper，不为形式拆文件。两个visualizer构造均接收live `SceneGISPlanarWorld`、Scene和
caller-owned `EntityCollection`，并在完整validation后订阅collection。

Visualizer拥有自己加入`scene.primitives`的private owner/Buffer collections和subscription；不拥有
World、Scene、EntityCollection、Entity、Property或terrain provider。

### Polyline Property profile

| Property        | C3 语义                                                |
| --------------- | ------------------------------------------------------ |
| `show`          | 默认true；与Entity showing/availability合取            |
| `positions`     | 至少2个finite Cartesian3；任一outside使当前graphic隐藏 |
| `width`         | 默认1；`[0,255]`内integer；0隐藏但保留owner            |
| `material`      | undefined=>white；仅ColorMaterialProperty              |
| `arcType`       | undefined=>planar NONE；显式仅ArcType.NONE             |
| `clampToGround` | false=>保留absolute Z；true=>每supplied vertex clamp   |

显式拒绝`granularity`、`depthFailMaterial`、非disabled shadows、
`distanceDisplayCondition`、`classificationType`和`zIndex`。Clamp不隐式细分；两点之间保持straight
segment。Graphic/positions移除才释放owner，临时隐藏保留资源。

### Polygon topology 与 Property profile

- 接受一个outer和direct holes；nested holes拒绝。
- 规范化唯一一个重复闭合终点；之后每ring至少3个不同XY点、finite、非零area、simple且互不相交/
  相切。Holes必须严格位于outer内并互不包含/重叠。
- `PolygonPipeline.triangulate`只接收规范化XY与hole offsets；返回indices必须完整、范围内、非退化。
- `arcType` undefined解释为planar NONE；显式仅接受NONE。
- 任一合法vertex outside extent时整个graphic隐藏；不裁剪、不clamp XY。

Top高度：

- `perPositionHeight=false`：每点XY + scalar `height`（默认0）按`heightReference`解析；输入position Z忽略。
- `perPositionHeight=true`：使用position absolute Z；`heightReference`必须NONE；已定义height只做finite
  preflight，不参与计算。

Extrusion：

- `extrudedHeight`未定义时仅top；定义时每点按`extrudedHeightReference`解析bottom；
- 每点bottom<=top；outer/holes均有side walls；`closeTop`/`closeBottom`默认true控制caps；
- `fill`默认true，material仅undefined/ColorMaterialProperty；
- `outline`默认false，支持outlineColor和`[0,255]`内integer outlineWidth；非extrusion画top rings，extrusion画
  top/bottom rings和垂直edges。

显式拒绝`stRotation`、`granularity`、`textureCoordinates`、非disabled shadows、
`distanceDisplayCondition`、`classificationType`、`zIndex`和非color material。

### Geometry、precision 与 render owner

- 每个active Polyline graphic拥有一个独立Polyline owner；每个active Polygon graphic拥有一个独立
  Polygon owner，内部按需要包含fill collection与outline collection。C3不跨Entity batch。
- Positions以graphic稳定local origin为基准写入DOUBLE buffer，modelMatrix只做world translation；
  world-space BoundingSphere由visualizer显式维护。
- Buffer capacity按本次topology精确/保守一次分配；topology、capacity、blend class或local origin改变时先
  构造完整candidate，再原子替换current。相同topology的positions/style在全量preflight后原位更新。
- Fill geometry使用显式triangle indices：top、反向bottom和outer/hole side walls。Outline用闭合ring
  polylines与独立vertical segments。
- Pick object固定为`{ id: entity, primitive: owner }`；collection/flyweight不可泄漏为pick结果。
- Alpha决定OPAQUE/TRANSLUCENT collection；alpha跨class必须candidate replacement。
- `getBoundingSphere`：active同步geometry返回DONE；hidden、outside、missing graphic或无fill/outline返回
  FAILED；C3无异步PENDING。
- 未变化warm update保持owner、collections、buffer/command/PickId/subscription identity；不得调用会标脏的
  geometry/material/show setter或触发buffer copy。Terrain height真实变化只在normal update修改positions/
  bounds。

### Atomicity 与 lifecycle

每次update按以下顺序：

1. 在scratch中读取并验证Entity/Graphic Property、topology、style与supported profile；
2. 逐vertex调用C1 resolver，形成完整top/bottom/local geometry、indices和world bounds；
3. 若不可见，仅在preflight完成后切换show，不修改geometry；
4. 若可原位更新，先证明count/capacity/blend/local origin一致，再统一写入；
5. 否则构造未插入Scene的candidate，完成全部CPU validation后插入，再替换current；
6. add/apply失败时只清理已插入candidate，保留current和原始异常；
7. Entity/graphic移除、replacement和destroy执行exactly-once remove/destroy/disconnect。

不能依赖Buffer collection的`isDestroyed()`判断所有权；SceneGIS owner必须有自己的destroy flag。异步
callback、terrain request和second Context复用都不属于C3。

## 影响路径

### 允许新增/修改

- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js`
- 可选的一个同目录private shared helper（必须在phase结果说明为何共享）
- `packages/engine/Specs/SceneGIS/DataSources/_SceneGISPlanarPolylineVisualizerSpec.js`
- `packages/engine/Specs/SceneGIS/DataSources/_SceneGISPlanarPolygonVisualizerSpec.js`
- 一个C3 real Context integration Spec，放在`packages/engine/Specs/SceneGIS/DataSources/`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarContentGuide.md`
- 本phase plan、父计划、扩展/plan/review索引和新review request
- ADR-0015仅在实现事实需澄清时修改，不得悄然改变approved contract

### 禁止范围

- 所有upstream-owned product/Spec/build文件
- `packages/widgets/**`、Viewer、CesiumWidget、DataSourceDisplay和默认visualizers/updaters
- C1 resolver与C2 visualizer行为修正；若发现blocking defect先暂停并回报Architecture
- public export、World API、Shader、Worker、Sandcastle、E2E、release/package配置
- generated `index.js`/`.d.ts`、SpecList、API HTML与`Build/**`

## 执行步骤

1. 重新发现Graphics、Buffer collections、triangulate、Scene primitive ownership和现有C1/C2测试范式；
   将任何与计划冲突的源码事实写入phase偏差并暂停。
2. 先实现纯CPU的Property/topology/height/triangulation/capacity preflight，使无效输入在资源mutation前失败。
3. 实现private owner与Polyline visualizer，固定local origin、bounds、pick和candidate/current lifecycle。
4. 实现Polygon top/bottom/sides/outline geometry与visualizer，并固定holes/extrusion/dynamic terrain语义。
5. 补focused unit Specs；只覆盖代表性普通/非法边界，不扩张为数值极限矩阵。
6. 补一个real Context closure，确认本机实际执行line/fill/hole/extrusion/pick/depth分支；capability不足时如实
   回报，不用错误module identity制造skip。
7. 更新Architecture/DevelopmentGuide/PlanarContentGuide的durable C3 matrix、terrain vertex-sampling和
   experimental adapter升级规则。
8. 运行最小充分验证、ownership/generated audit，创建pending review request并停在C3。

## Specs 与验收

### Focused behavior

- Polyline：straight/default NONE、absolute/clamp、dynamic positions/terrain/style、extent/show、非法profile、
  bounding sphere、original Entity pick、warm identity、replacement与destroy。
- Polygon：outer+direct holes、closure normalization、simple topology rejection、scalar NONE/clamp/relative、
  per-position Z、extrusion/caps/sides/outline、dynamic terrain/topology/style、alpha replacement、atomic failure、
  bounds/pick/lifecycle。
- Real Context：EPSG:3857-scale local/modelMatrix、可见line/fill、hole背景像素、extruded侧面、至少一个
  translucent或opaque代表、original Entity `scene.pick`、finite depth/`scene.pickPosition`、warm owner/
  command/resource identity与destroy balance。

测试不要求穷举坐标极值、自交组合或所有硬件。一个可重复普通大坐标fixture和代表性invalid topology足够。

### 最小命令矩阵

```powershell
npm run test -- --includeName "SceneGISPlanarPolylineVisualizer"
npm run test -- --includeName "SceneGISPlanarPolygonVisualizer"
npm run test -- --includeName "SceneGISPlanarGeometry" # 按最终integration basename调整
npm run test -- --includeName "SceneGISPlanarPositionResolver"
npm run build
npm run build-ts
npm run build-docs
npx eslint <C3 changed JS files>
npx prettier --check <C3 changed JS/Markdown files>
npx markdownlint "AgentDocs/planar-content/**/*.md" "Documentation/SceneGIS/**/*.md"
git diff --check
node scripts/scenegis/audit-upstream-patches.mjs
```

只有实际越过公共API、release或Widgets边界时才扩大验证；C3默认不运行全量upstream、`build-release`、
`tsc`、Sandcastle、E2E或性能矩阵。

### Generated/ownership gate

- 两个visualizer及可选private helper在engine/Cesium `.d.ts`和API HTML中命中`0`；
- generated files不进入git status；
- upstream-owned files=`0`、C3 SGP=`0`、manifest/SGP-0001/0002 unchanged、new markers=`0`；
- 若任何一项不成立，C3不得标ready。

## 完成条件

- ADR-0015的Polyline/Polygon/topology/height/extrusion/profile全部有实现和representative Specs；
- clamp/drape是明确的supplied-vertex sampling，不发请求且terrain变化eventually更新；
- 大坐标像素、hole、extrusion、picking、depth和resource lifecycle在real Context闭环；
- warm update无owned geometry/GPU churn，replacement与destroy exactly once；
- durable docs、phase结果、review request、ownership/generated证据完整；
- Architecture/code review批准并由Architecture Agent形成独立中文本地commit后，才能进入C4。

## 风险与升级点

- Buffer collection是experimental；API变化风险被限制在private owner，ADR-0015公共Graphics语义不能随之
  漂移。
- Vertex-only terrain drape在长边/大三角形上可能穿越terrain；这是已批准精度边界，不得用名称暗示连续
  贴地。
- Earcut对近退化/复杂invalid rings不提供完整几何合法性证明；C3做代表性simple-ring validation，不追求
  数值计算几何库级穷举。
- Per-Entity owner增加draw calls；C5以真实对象规模和profiling决定batch，不在C3提前优化。
- Polygon extrusion的hole wall、cap winding和translucency容易出现视觉/深度问题，必须以real Context像素/
  pick/depth证据而非仅CPU indices验收。

## 当前交接

### 实际影响路径与source-to-Spec mapping

- Product source：
  - `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarBufferOwner.js`
  - `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js`
  - `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js`
- Specs：
  - `packages/engine/Specs/SceneGIS/DataSources/_private/SceneGISPlanarPolylineVisualizerSpec.js`
    对应Polyline contract，direct cases=`7`；
  - `packages/engine/Specs/SceneGIS/DataSources/_private/SceneGISPlanarPolygonVisualizerSpec.js`
    对应Polygon contract，direct cases=`9`；
  - `packages/engine/Specs/SceneGIS/DataSources/SceneGISPlanarGeometrySpec.js`
    对应real Context closure，direct cases=`1`。
- Durable docs与AgentDocs：Architecture、DevelopmentGuide、PlanarContentGuide、本phase/review/index。
- C3新增direct unique cases=`17`；C1 resolver regression=`11`个aggregate cases，不计入C3 direct total。

### 实际设计与偏差

- 新增一个有明确共享必要性的private Buffer owner，集中collection insertion rollback、show、pick id、
  explicit bounds和exactly-once destroy；未增加第二个共享helper。
- Focused review修复后，owner rollback按Scene真实membership逐collection移除；无论
  `destroyPrimitives=true/false`均exactly-once destroy，并在cleanup异常时保留原始insertion error。
- Polyline/Polygon都以首个resolved XY作为local origin、Z origin固定为0，保存DOUBLE local positions并以
  translation model matrix恢复world coordinates。拓扑与blend signature不变时原位更新positions/material/
  bounds，变化时先完整构造并插入candidate，再释放current。
- Polygon把outer、direct holes、caps、side walls与outline显式展开为triangle/segment buffers；因为Buffer
  polygon renderer直接消费explicit triangles，所以不依赖其hole metadata。这是计划允许的private实现
  选择，未改变ADR-0015 topology或pick语义。
- Clamp/relative只逐supplied vertex调用C1 resolver；没有terrain request、沿边细分或continuous drape。
- Polyline width与Polygon outlineWidth只接受`[0,255]`内integer；last-applied state比较避免静态warm
  update重复调用Buffer setter，真实Property/terrain/style/bounds/show变化仍在normal update生效。
- 实际Spec basename按constructor symbol命名，不带源码private module basename的前导下划线；测试仍位于
  `_private/`目录并且不进入public discovery surface。

### 验证结果

| 命令                                                                     | 结果                                                                                                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGISPlanarPolylineVisualizer"`       | Exit 0，`7/7`                                                                                                                     |
| `npm run test -- --includeName "SceneGISPlanarPolygonVisualizer"`        | Exit 0，`9/9`                                                                                                                     |
| `npm run test -- --includeName "SceneGISPlanarGeometry"`                 | Exit 0，`1/1`；三个original Entity pick fixture、finite depth、静态dirty/copy零增量、dynamic copy、warm identity与destroy balance |
| `npm run test -- --includeName "SceneGISPlanarPositionResolver"`         | Exit 0，`11/11` aggregate regression                                                                                              |
| `npm run build`                                                          | Exit 0                                                                                                                            |
| `npm run build-ts`                                                       | Exit 0；仅现有TSD-JSDoc warnings                                                                                                  |
| `npm run build-docs`                                                     | Exit 0                                                                                                                            |
| scoped ESLint/Prettier、Markdownlint、`git diff --check`、upstream audit | Exit 0；详见pending review evidence                                                                                               |

### Ownership、generated与剩余风险

- Upstream-owned files=`0`；C3 SGP=`0`；manifest、SGP-0001/0002 unchanged；new patch markers=`0`。
- 三个private symbols在engine/Cesium declarations与API HTML命中`0`；generated files in status=`0`。
- Buffer collections仍是experimental/private升级面；per-Entity draw-call cost留给C5 profiling。
- Vertex-only terrain drape不保证长边/大三角形连续贴地；simple topology validation不替代完整计算几何库。
- Real Context是一个代表性GPU fixture，不是跨硬件或全属性矩阵；C4前`viewer.entities`仍不可用。

### Current handoff

- Architecture focused re-review确认C3-R001～C3-R003全部关闭；Polyline `7/7`、Polygon `9/9`、real
  Context `1/1`、build、scoped ESLint与upstream audit由Architecture独立复跑并通过。
- Direct unique case count仍为`17`：三个finding扩展既有7/9/1 cases，没有以aggregate overlap或新增断言
  虚增case数。C1 resolver未改，复用首轮`11/11`证据。
- C3状态为`completed`；Architecture Agent形成独立C3本地checkpoint后，才从该checkpoint重新发现C4
  源码事实并创建C4 phase plan。C3未push，未把C4设计或实现混入本阶段。
