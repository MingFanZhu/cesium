# C9 Continuous Ground 与 Planar Ground Primitive

## 元数据

- Extension：`planar-content`
- 阶段（Phase）：`C9-continuous-ground-and-ground-primitive`
- Status：`completed`
- Date：`2026-08-10`
- Branch：`feature/planar-content`
- Implementation base/checkpoint：`884831a2641e370d1b104a7cf2bd7e5ca14a1fbc`
- Planning owner：Architecture Agent
- Execution owner：Execution Agent（task `019fcff7-3313-7d03-b970-57b3d08e3a32`）
- Related extension plan：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- Related ADR：
  [ADR-0021：平面连续贴地与 Ground Primitive 晚阶段渲染协议](../../../Documentation/SceneGIS/Decisions/ADR-0021-planar-continuous-ground-and-ground-primitive.md)
- Previous checkpoint：C8 commit `884831a2641e370d1b104a7cf2bd7e5ca14a1fbc`
- Review request：实施完成后创建
  `AgentDocs/planar-content/reviews/2026-08-10-c9-continuous-ground-and-ground-primitive.md`
- Ownership：预期 upstream-owned files=`0`、C9 SGP=`0`

## 阶段目标

在不进入C10统一交付和3D Tiles classification的前提下：

1. 新增应用可直接使用的public `SceneGISPlanarGroundPrimitive`，复用现有public Polyline/Polygon Geometry。
2. 让ground line/fill按当前实际渲染terrain triangles连续贴合，而不是只采样supplied/generated vertices。
3. 建立World/Surface与caller-owned Primitive之间的same-pass late-registration协议，使drape使用当帧parent/child
   actual cover并随LOD、revision、provider replacement收敛。
4. 把Polyline、Polygon、Ellipse、Rectangle与Corridor的已批准ground配置迁移到同一public runtime。
5. 保持ordinary content、terrain request/readiness/cache、depth replay、original Entity pick、per-DataSource ordering和
   lifecycle边界不回退。

## 非目标

- 不复用或修改Cesium `GroundPrimitive`、`GroundPolylinePrimitive`、`ClassificationPrimitive`或Globe shadow volume。
- 不支持3D Tiles classification、`ClassificationType`、zIndex、ordered ground layers、arbitrary Material或shadows。
- 不改变Point/Billboard/Label/Model/Box/Cylinder/Ellipsoid/Plane/Wall/PolylineVolume/Path现有height profile。
- 不发terrain request，不建立第二套LOD/cache/readiness，不改变terrain selection/SSE/promotion budget。
- 不增加Worker、Shader、build protocol、Sandcastle、E2E、package smoke或C10 compatibility/release qualification。
- 不修改upstream-owned file或历史SGP hunk；若真实源码障碍迫使大量Cesium改动，必须停止并回报Architecture。

## 已确认源码事实

### Cesium ground pipeline不适用于平面World

- `GroundPrimitive`与`GroundPolylinePrimitive`进入ellipsoid rectangle、`ApproximateTerrainHeights`、shadow volume、
  classification/stencil和Globe/3D Tiles pass；它们不是可选择实现的coordinate-neutral接口。
- Raw planar Cartesian3不能消除这些路径的Cartographic/Ellipsoid语义。C9只借鉴其“overlay必须与surface depth一致”
  的问题定义，不复制实现。

### 当前Scene顺序要求late phase

- `Scene.updateAndRenderPrimitives`先更新ground/root primitives，再通过SGP-0001调用primary World `render`。
- C4 automatic content位于per-DataSource PrimitiveCollection，最终同样在World render前执行。
- `_SceneGISPlanarSurface.render`此后才完成当帧quadtree selection、terrain promotion、actual render tile命令和query
  snapshot。因此在visualizer或public Primitive普通update中读取terrain会得到上一帧或不完整覆盖。

### Query snapshot不能直接承担ground renderer协议

- 现有terrain query snapshot只描述last-successful normal-render的actual Float32 surface mesh，供resident query/ray
  picking使用；它不包含no-provider与active `FLAT` fallback。
- Snapshot entry持有tile/content/mesh引用并有严格provider/hidden/no-cover/destroy失效规则。C9必须保留该公共行为，
  新建独立ground-render snapshot而不是扩写query语义。
- Terrain mesh的`surfaceIndexCount`排除skirts；selection bounds可以包含skirts，但ground生成不得使用skirts。

### 现有public runtime可复用

- `SceneGISPlanarPolylineGeometry`和`SceneGISPlanarPolygonGeometry`已保存immutable world-position snapshot、origin、
  width、outer/direct holes、bottom和cap flags；允许增加最小private read-only drape seam，但不得改变public语义。
- `SceneGISPlanarPrimitive`已证明synchronous standard Primitive、single GeometryInstance、local DOUBLE、
  candidate/current、attributes、pick/depth、single Context和exact cleanup。C9新wrapper应复用该契约模式，而不是复制
  Globe ground renderer。
- Existing visualizer/`_SceneGISPlanarPrimitiveOwner`已提供original Entity id与per-DataSource collection ownership；
  C9应让owner接受新的public wrapper，不建立另一套DataSource集成。

## 架构与Public API契约

### SceneGISPlanarGroundPrimitive

新增`packages/engine/Source/SceneGIS/Scene/SceneGISPlanarGroundPrimitive.js`。Constructor至少包含：

```js
new SceneGISPlanarGroundPrimitive({
  world,
  geometry,
  appearance,
  id,
  attributes,
  heightReference,
  extrudedHeightReference,
  show,
  allowPicking,
});
```

强制契约：

- `world`必须是live `SceneGISPlanarWorld`，caller-owned；`geometry`只允许existing Polyline/Polygon，kind在construction
  固定，replacement只允许same-kind。
- `appearance`与`attributes`沿用C6 Color pairing和representability；`id` required non-null；boolean options严格验证。
- `heightReference` required并且只接受`NONE`、`CLAMP_TO_GROUND`、`RELATIVE_TO_GROUND`。
- `extrudedHeightReference` iff Polygon具有bottom positions时required；其他情况必须undefined。
- 至少一个effective reference非`NONE`；全absolute geometry必须使用`SceneGISPlanarPrimitive`。
- 不提供`modelMatrix`。Geometry中的world X/Y是terrain addressing；应用需要变换时创建新的Geometry snapshot。
- `NONE`保留source Z，`CLAMP`忽略source Z，`RELATIVE`为surface Z + source Z。Polygon top/bottom分别使用两个
  references并在derived vertices复核bottom <= top。
- Public surface保持`geometry`、`appearance`、`show`、`id`、`allowPicking`、`ready`、
  `getGeometryInstanceAttributes`、`getBoundingSphere`、`isDestroyed`、`destroy`。不公开tile entry、drape mesh、
  registration或snapshot。

Public class必须进入engine/Cesium root runtime、`.d.ts`与API HTML；所有private role不得进入declarations/API。

### 一个logical current，而不是per-tile public facade

Private draper可以产生多个tile/triangle pieces，但在candidate完成前必须把compatible pieces合并成一个
local-DOUBLE raw Geometry和single GeometryInstance：

- original `id`直接用于pick，不暴露internal tile id；
- `getGeometryInstanceAttributes`继续返回一个logical current attribute set；
- bounds联合所有pieces；
- snapshot变化可以整体candidate replacement，warm signature相同则复用一个standard Primitive及其commands/VA。

如果Cesium Geometry合并路径不能在不复制大段upstream code的情况下保持Polyline appearance attributes，允许private
draper自行拼接兼容attribute/index arrays；不允许为此退化为多个public instance id或改变pick contract。

## Private same-pass协议

### World pass queue

允许在`SceneGISPlanarWorld`增加private registration/dispatch方法和instance-owned reusable queue：

1. Ground wrapper的普通`update(frameState)`只验证liveness/Context/pass并向required World注册自身。
2. World拒绝duplicate registration，并只接收当前SceneGISPlanarWorld frame的wrapper。
3. `SceneGISPlanarWorld.render(frameState)`先调用Surface，再按注册顺序调用wrapper private late update。
4. Normal render允许drape/candidate/promotion；pick/depth只能提交last-successful current。
5. Queue在每次World render `finally`、beginFrame defensive reset和destroy时清空，不跨pass保留strong reference。

不增加全局registry，World不拥有wrapper。Wrapper未被caller PrimitiveCollection更新时不得自动显示；从collection移除
后下一pass自然消失。

### Ground-render snapshot

允许在`_SceneGISPlanarSurface`增加与query snapshot分离的private snapshot：

- normal render确定actual render cover后填充；entry包含tile identity/rectangle、active source、source level/revision/
  key、tile-local transform以及只读surface mesh信息；
- `DIRECT`/`UPSAMPLED`只暴露`surfaceIndexCount`范围；no-provider/`FLAT`明确表现为Z=0 rectangle的两个triangles；
- actual parent cover必须记录parent，四子全部active并替换parent后才记录children；不得用desired leaf冒充render tile；
- provider attach/replacement/detach、hidden、zero-buffer/no-cover、stale revision和destroy失效；清理removed range全部
  tile/content/mesh引用，但保留reusable container identity；
- Ground wrapper同步消费后只复制signature和generated geometry，不持有entry、tile、content或mesh。

Query snapshot、`getTerrainHeight`、`pickTerrain`、terrain request/cache/LRU、`tilesLoaded`和depth command replay契约
不得因C9改变。

## Continuous drape算法与误差预算

新增private `_SceneGISPlanarGroundDraper`（如确有共享需要可拆一个同目录topology helper）：

### Polyline

- 以source segment顺序与实际cover做XY clipping；在tile boundary和surface triangle edge处建立breakpoint。
- 每个breakpoint从拥有它的active triangle plane得到surface Z，再应用segment-linear source offset。
- 分离的visible pieces保持分离并安全合并，不能跨no-cover间隙创建假线段。
- exact shared edge/corner使用统一half-open ownership；World outer boundary inclusive；重复/零长piece清除。

### Polygon

- 复用existing simple outer/direct-hole topology与top triangulation；允许在Polygon Geometry增加一个private read-only
  source seam，禁止复制或改变public snapshot。
- Source top triangle与actual surface triangle在XY做convex clipping，分别求top/bottom HeightReference并生成caps。
- Outer/hole boundary在相同terrain crossings处分段，生成连续side wall；尊重`closeTop`、`closeBottom`与hole exclusion。
- Shared edge只拥有一份cap/side；bottom高于top、non-finite、index overflow、degenerate final mesh在resource mutation前
  fail-fast。

### 精度与fallback

- Ground相对当前rendered Float32 surface triangle的新增垂直误差只允许numeric tolerance；RELATIVE再叠加source
  segment/triangle-linear offset。
- 相对真实terrain的absolute error使用active source level的provider geometric error；UPSAMPLED不得使用child level
  虚报更小误差。
- No-provider与active FLAT走相同algorithm但surface Z=0，不声明terrain accuracy；后续DIRECT/UPSAMPLED promotion
  通过signature触发原子replacement。
- Drape不发request、不保护tile、不改变selection/SSE/LRU/readiness。

## Rendering、depth与lifecycle

- Ground wrapper只使用synchronous standard `Primitive`和single GeometryInstance。
- Internal Appearance从caller-ownedcompatible Color appearance派生并设置depth test `LESS_OR_EQUAL`；不得修改caller
  appearance，不依赖polygonOffset。
- Candidate先在isolated command list完整update，成功后才提交commands并替换current；失败保留旧current/resources/
  attributes/bounds，但若current surface generation不匹配本pass则不得显示旧结果。
- Warm signature不变时Primitive/DrawCommand/VA/shader/pick/attribute identity稳定；terrain signature或geometry/style/
  reference变化才rebuild。
- Pick/depth pass只更新current，不读取snapshot、不生成mesh、不promote。`scene.pick`返回original id，
  `scene.pickPosition`与submitted ground triangle一致。
- 第二Context、non-SCENE3D、destroyed World/wrapper在mutation前拒绝。Destroy current/candidate exactly once；不销毁
  World、Surface、provider、source Geometry、Appearance或caller collection。
- 若代表性real Context在线性或log depth下出现无法消除的terrain/ground闪烁、穿透或depth mismatch，立即暂停并回写
  blocker；不得自行增加Shader/classification/upstream patch。

## Entity迁移范围

不新增callback child，继续使用现有Polyline、Polygon、Area、Route visualizer和
`_SceneGISPlanarPrimitiveOwner`：

| Graphics          | C9 ground条件                             | Runtime                                 |
| ----------------- | ----------------------------------------- | --------------------------------------- |
| Polyline          | `clampToGround === true`                  | Ground Polyline；source Z忽略           |
| Polygon           | top/bottom任一effective reference非`NONE` | Ground Polygon；top/bottom独立reference |
| Ellipse/Rectangle | top/bottom任一effective reference非`NONE` | Area lowering后Ground Polygon/Polyline  |
| Corridor          | top/bottom任一effective reference非`NONE` | Route lowering后Ground Polygon/Polyline |

Polygon/Area/Corridor outline按top/bottom effective reference选择ground或ordinary Polyline；vertical outline只连接已
生成的端点。`perPositionHeight`与ground的现有invalid组合保持fail-fast。

Entity Property不变时owner identity保持；Ground wrapper依据surface signature自行收敛。Visualizer不得订阅terrain、
发request或每帧重建owner。Ordinary `NONE`路径继续使用`SceneGISPlanarPrimitive`，不得产生ground snapshot/runtime
allocation。Original Entity id、distance condition、Color updates、show/availability、per-DataSource target、bounds与
remove/destroy顺序保持。

## 允许修改范围

### Product source

- 新增`packages/engine/Source/SceneGIS/Scene/SceneGISPlanarGroundPrimitive.js`。
- 新增`packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundDraper.js`及至多一个真实共享的private
  topology helper。
- 修改`SceneGISPlanarWorld.js`与`_SceneGISPlanarSurface.js`，仅增加上述late queue和ground snapshot seam。
- 如需要，给现有Polyline/Polygon Geometry增加最小private read-only drape seam；public API/普通createGeometry行为不变。
- 修改`_SceneGISPlanarPrimitiveOwner.js`，仅使其以相同ownership处理normal/ground public wrapper。
- 修改Polyline、Polygon、Area、Route visualizer以选择ground runtime；不修改Anchor/Model/Solid/Path行为。
- 不修改callback child数量/顺序，除非测试暴露现有gate对ground字段的真实遗漏；任何调整必须保持现有graphic profile。

### Specs

- 新增public Ground Primitive focused Spec。
- 新增private GroundDraper focused Spec。
- 扩展World/Surface/Quadtree中的最小actual-cover/snapshot evidence，优先在现有SceneGIS suites中增加断言。
- 扩展Polyline/Polygon/Area/Route visualizer focused Specs和一个existing real Context content fixture。
- 不新建宽泛全库矩阵，不把扩展断言冒充新增direct case。

### Docs与AgentDocs

- 实现结果回写ADR-0021相关事实、Architecture、DevelopmentGuide、PlanarContentGuide和UpgradeChecklist。
- 回写本phase的source-to-spec mapping、case count、验证命令、偏差、ownership与风险。
- 创建pending review：
  `AgentDocs/planar-content/reviews/2026-08-10-c9-continuous-ground-and-ground-primitive.md`。

## 禁止范围

- 禁止修改`Scene.js`、`CesiumWidget.js`、`Viewer.js`、upstream Ground/Classification files或历史SGP manifest/hunks。
- 禁止prototype patch、frameState临时全局属性、module-global registry、加载顺序技巧或复制大段Cesium ground代码。
- 禁止手工编辑generated barrels、`.d.ts`、SpecList、API HTML或Build产物。
- 禁止新增Shader、Worker、classification、zIndex、arbitrary Material、3D Tiles或C10 delivery内容。
- 禁止进入C10、commit、push或扩大到无关回归；出现重大架构阻碍时停止并通知Architecture。

## 执行步骤

### C9-A：Public contract与CPU draper

1. 实现Ground Primitive完整preflight和private Geometry source seam。
2. 实现flat/terrain triangle representation、Polyline split、Polygon clip/caps/sides和deterministic boundary ownership。
3. 先用CPU Specs锁定hill、hole、mixed refs、skirt exclusion、precision和invalid atomicity。

### C9-B：Surface snapshot与World late pass

1. 建立独立ground-render snapshot及所有invalid/strong-reference cleanup路径。
2. 建立per-pass registration/dispatch/cleanup，证明surface selection先于ground normal candidate。
3. 验证query snapshot、terrain counters、tilesLoaded和ordinary flat path不回退。

### C9-C：Renderer与Entity迁移

1. 完成single-instance standard Primitive candidate/current、derived depth state、attributes/pick/bounds/lifecycle。
2. 迁移Polyline/Polygon/Area/Corridor ground配置，保持ordinary路径与owner identity。
3. 建立real Context连续地形、depth/pixel/pick、LOD/revision和warm/resource closure。

### C9-D：Public generation与阶段交接

1. 运行最小充分focused/build/types/docs/static/ownership矩阵。
2. 更新durable docs、phase结果和pending review request。
3. 停止等待Architecture/code review；不commit、不push、不进入C10。

## 验收矩阵

### 必须通过

1. GroundDraper CPU suite：至少覆盖supplied vertices间terrain peak、tile/triangle split、shared edge、hole、mixed
   top/bottom、FLAT、skirt exclusion与EPSG:3857量级local precision。
2. GroundPrimitive suite：constructor/property fail-fast、single logical instance/attributes、candidate/current、empty cover、
   second Context、normal/pick/depth、bounds、warm与destroy。
3. Surface/World suite：same-frame snapshot、parent/children cover、DIRECT/UPSAMPLED/FLAT/no-provider、provider lifecycle、
   hidden/zero/no-cover、strong-reference cleanup、queue finally cleanup和zero terrain mutation。
4. Affected visualizer suites：Polyline、Polygon、Area、Route的ground/ordinary、dynamic style/reference、original Entity、
   per-DataSource owner和remove/re-add。
5. 一个真实Context fixture：terrain峰值位于input vertices之间，line/fill/hole/extrusion实际连续覆盖；验证linear/log
   depth代表路径、pixel、`scene.pick`、`scene.pickPosition`、LOD/revision replacement、warm identity和resource balance。
6. `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`。
7. Changed-scope ESLint、JS/Markdown Prettier、Markdownlint、`git diff --check`。
8. `node scripts/scenegis/audit-upstream-patches.mjs`确认current delivery upstream-owned=`0`、C9 SGP=`0`、
   manifest/SGP-0001/0002 unchanged、generated status=`0`。
9. Root JS/types/API包含`SceneGISPlanarGroundPrimitive`；private draper/snapshot/registration declarations/API hits=`0`。

### 不要求

- 不要求全库Specs、Sandcastle/E2E/package/release build或性能soak；这些属于C10。
- 不要求公网terrain或人工视觉验收；使用deterministic local terrain fixture。
- 不要求为不可重复单机timing引入Worker或batching。

## Ownership与阶段门禁

- 预期upstream-owned product/test/build files=`0`、C9 SGP=`0`。
- 如果实现确需少量非SceneGIS-owned修改，Execution必须先记录原因和拟议SGP并通知Architecture；不得先改后报。
- 如果需要大量Cesium代码、改变已批准public contract、classification/Shader/Worker protocol或terrain核心selection，
  立即停止，由Architecture重新裁决。
- Execution完成implementation、最小充分验证与AgentDocs后创建pending review并停止；不commit、不push、不进入C10。
- Architecture review通过后，由Architecture Agent形成C9独立中文本地提交检查点，再自动规划并派发C10。

## 当前交接

- C8已在checkpoint `884831a2641e370d1b104a7cf2bd7e5ca14a1fbc`完成并提交。
- ADR-0021保持`approved`；C9-R001～C9-R006已在SceneGIS-owned边界内完成修复并经Architecture focused
  re-review关闭。
- C9 phase=`completed`、review=`approved`，保持zero-upstream、zero-SGP、zero-Shader/Worker变更。
- 下一步：Architecture形成C9独立中文本地提交检查点，再依据当前源码规划并激活C10。

## 偏差与结果

### 实际设计

- 新增public `SceneGISPlanarGroundPrimitive`和private `SceneGISPlanarGroundDraper`。Ground Primitive
  只接受live planar world与既有Polyline/Polygon Geometry；normal render基于当帧actual cover构造candidate，
  同kind current成功后原子替换，pick/depth只复用current standard `Primitive`。
- Polyline按actual surface triangle逐段裁剪；互不连通的cover piece在同一logical Geometry中保留独立indices，
  不跨空洞连线。Polygon以source triangles和surface triangles做XY clipping，并生成top/bottom caps、boundary sides；
  `surfaceIndexCount`明确排除skirts。
- `SceneGISPlanarWorld`采用每pass late-registration queue，Surface仅在存在ground registration时lazy发布独立
  ground snapshot。Surface normal render先完成selection/command，再执行ground；queue由`finally`清理。
  Query snapshot、terrain LOD/request/readiness/LRU均未修改。
- Polyline、Polygon、Ellipse、Rectangle与Corridor的ground分支改用同一public wrapper；ordinary `NONE`
  分支仍使用`SceneGISPlanarPrimitive`，不会创建ground queue/snapshot/runtime。
- 为保持zero-ground allocation，ground snapshot与registration collection均为lazy。这是phase允许的实现细化，
  public contract、pass顺序和ownership无偏差。

### 最终影响路径与source-to-spec mapping

- Public/runtime：
  `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarGroundPrimitive.js`、
  `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundDraper.js`、
  `SceneGISPlanarWorld.js`、`_SceneGISPlanarSurface.js`。
- Geometry read seams：`SceneGISPlanarPolylineGeometry.js`、`SceneGISPlanarPolygonGeometry.js`；只暴露private
  immutable drape source，不改变public Geometry API。
- Entity adapters：`_SceneGISPlanarPolylineVisualizer.js`、`_SceneGISPlanarPolygonVisualizer.js`、
  `_SceneGISPlanarAreaVisualizer.js`、`_SceneGISPlanarRouteVisualizer.js`。
- Direct Specs：`SceneGISPlanarGroundPrimitiveSpec.js`=`3`、
  `SceneGISPlanarGroundDraperSpec.js`=`8`、World新增=`1`、Surface新增=`2`、Polyline bounds新增=`1`；
  C9新增direct `it` cases=`15`。Visualizer其余focused suites修改既有cases，不重复计入direct unique。
  Visualizer focused suites修改既有cases，不重复计入direct unique。
- Durable docs：ADR-0021、Architecture、DevelopmentGuide、PlanarContentGuide、UpgradeChecklist以及本extension
  的plan/index/review handoff。

### 验证结果

- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarGroundDraper"`：`8/8`，Exit `0`。
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarGroundPrimitive"`：`3/3`，Exit `0`。
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`：`20/20`，Exit `0`。
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`：Surface/Shader aggregate
  `30/30`，Exit `0`。Real Context覆盖input端点间terrain peak、original Entity pick、pixel、
  `scene.pickPosition`、linear/log depth与warm identity。
- `npm run test -- --includeName "SceneGIS/DataSources/SceneGISPlanarPolylineVisualizer"`：`7/7`；
  `SceneGISPlanarPolygonVisualizer`：`7/7`；`SceneGISPlanarAreaVisualizer`：`6/6`；
  `SceneGISPlanarRouteVisualizer`：`6/6`；均Exit `0`。
- `npm run test -- --includeName "SceneGIS/DataSources/SceneGISPlanarGeometry"`：`1/1`，Exit `0`。
- `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`：Exit `0`；types/docs仅有
  已知upstream TSD-JSDoc warnings。
- Scoped ESLint/Prettier、Markdown Prettier/Markdownlint、`git diff --check`、official upstream audit：
  最终结果见pending review request；均须Exit `0`后交审。
- Generated assertions：root JS/types/API可见`SceneGISPlanarGroundPrimitive`；private draper在declarations/API
  命中`0`；generated files不进入status。

### Ownership与剩余风险

- Implementation base=`884831a2641e370d1b104a7cf2bd7e5ca14a1fbc`；upstream-owned files=`0`；
  C9 SGP=`0`；manifest与SGP-0001/0002 unchanged；new patch markers=`0`。
- Ground geometry仍由normal render同步CPU裁剪和standard Primitive promotion；高复杂度Geometry的生产预算与
  ordered ground layers不属于C9。代表性linear/log-depth已通过，但不同GPU/driver仍需后续交付阶段复核。

### Architecture首轮review

- Review状态：`changes-requested`；finding为C9-R001～C9-R006，详见
  [C9 review](../reviews/2026-08-10-c9-continuous-ground-and-ground-primitive.md)。
- 阻断项集中在：257×257常规瓦片的全量triangle展开/扫描、Polygon shared-edge与derived bottom/top正确性、
  ground extrusion vertical outline、Entity current bounds、same-frame/stale pick-depth协议，以及public attribute
  preflight一致性。
- Architecture只读复现验证这些是当前实现的确定性行为，不是要求扩大边界测试；修复仍不得新增upstream-owned
  file、SGP、Shader或Worker。C9保持`active`，不进入C10。

### Focused fix结果

- R001改为geometry/tile bounds broad-phase与regular-grid bounded-cell streaming；`257 x 257` fixture只纳入一个
  relevant entry，`visitedTriangles < 100`，signature排除不相交tile。
- R002规范化clipped ring，精确去重cap/side，所有derived pairs执行finite与`bottom <= top`检查；Ground Polygon
  preflight明确要求bottom/top对应XY一致。
- R003以private per-endpoint reference让vertical outline使用同一actual-cover snapshot，derived或source零长piece均省略。
- R004新增共享private actual-current bounds聚合：未ready为`PENDING`，hidden/no owner为`FAILED`，revision后读取新current。
- R005只在World registration seam校验`world.update`绑定的reusable `frameState` identity；non-render replay还须匹配
  current geometry相关的有效surface generation/signature。
- R006与C6对齐attribute CPU preflight；same-kind candidate失败保持current、attributes和bounds。
- 串行focused结果：Draper `8/8`、GroundPrimitive `3/3`、World `20/20`、Surface/Shader `30/30`、Polyline `7/7`、
  Polygon `7/7`、Area `6/6`、Route `6/6`，均Exit `0`。`npm run build` Exit `0`。一次并行gulp尝试因共享
  Build目录发生Windows `EPERM`，未计为产品结果；最终矩阵全部串行。

### Architecture focused re-review结果

- C9-R001～C9-R006全部关闭，review状态更新为`approved`，phase状态更新为`completed`。
- Architecture独立代表性复跑：GroundDraper与GroundPrimitive合计`11/11`、Polygon Visualizer `7/7`、
  Surface/Shader `30/30`、World与planar Widget合计`21/21`，均Exit `0`。
- C9保持upstream-owned files=`0`、SGP=`0`、Shader/Worker变更=`0`、generated status=`0`；剩余风险仅为
  已接受的同步normal-render CPU drape、standard Primitive升级面与后续GPU交付验证。
