# C6 Public Planar Primitive/Geometry 基础

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`C6-public-planar-primitive-and-geometry`
- 状态（Status）：`active`
- 父计划（Parent plan）：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人：Architecture Agent（依据项目负责人授予的后续阶段自主设计与派工权限）
- 创建日期（Created）：`2026-08-09`
- 更新日期（Updated）：`2026-08-09`
- Planning base：`40b5e56f2d8358de25804a3a458aa9a044f8b82a`
- 分支（Branch）：`feature/planar-content`
- 相关讨论（Related discussions）：None；项目负责人已批准继续五项工作，C6源码审计与设计直接提升为
  ADR-0018
- 相关评审（Related reviews）：实现ready后创建
  `AgentDocs/planar-content/reviews/2026-08-09-c6-public-planar-primitive-and-geometry.md`
- ADR：
  [ADR-0013](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)、
  [ADR-0015](../../../Documentation/SceneGIS/Decisions/ADR-0015-planar-polyline-polygon-and-vertex-drape.md)、
  [ADR-0016](../../../Documentation/SceneGIS/Decisions/ADR-0016-planar-datasource-display-integration.md)、
  [ADR-0017](../../../Documentation/SceneGIS/Decisions/ADR-0017-planar-content-qualification-and-batching-boundary.md)、
  [ADR-0018](../../../Documentation/SceneGIS/Decisions/ADR-0018-planar-public-primitive-and-geometry.md)
- SGP：C6预期`0`；不得修改历史`SGP-0001/0002` hunk或manifest语义

## 阶段目标

在不进入C7普通graphics或C9 continuous ground的前提下：

1. 新增应用可直接加入`scene.primitives`/caller-owned `PrimitiveCollection`的public
   `SceneGISPlanarPrimitive`；
2. 新增public `SceneGISPlanarPolylineGeometry`和`SceneGISPlanarPolygonGeometry`，固定米制Cartesian3、
   planar straight、local origin/model matrix和simple polygon topology；
3. 复用Cesium标准同步`Primitive`、GeometryInstance与批准的Appearance，建立构造、动态替换、picking、bounds、
   Context和destroy契约；
4. 把现有Polyline/Polygon Entity visualizer迁移到同一public低层实现，清除SceneGIS对experimental Buffer
   runtime的依赖；
5. 用代表性direct与automatic real WebGL证据锁定大坐标精度、warm reuse、失败原子性和资源收敛。

## 非目标

- 不实现Box、Cylinder、Ellipsoid、Plane、Ellipse、Rectangle、Corridor、Wall、PolylineVolume或Path。
- 不实现continuous terrain drape、planar ground、3D Tiles classification或terrain请求。
- 不宣布raw Cesium `Geometry`、`GeometryInstance`或任意Appearance自动具有planar兼容性。
- 不支持多geometry batching、跨Entity merge、空间索引、百万对象profile或公开batch API。
- 不新增Worker、pack/unpack、Shader builtin、Renderer hook、build seam或异步geometry pipeline。
- 不修改`CesiumWidget.js`、`Scene.js`、`Viewer.js`、`DataSourceDisplay.js`或其他upstream-owned file。
- 不修改Point/Billboard/Label/Model runtime、Viewer tracking、`flyTo`、`zoomTo`或格式加载器。

## 当前源码事实与架构裁决

### 标准Primitive可复用部分

- `Primitive.loadSynchronous`识别已有`attributes`/`primitiveType`的Geometry并clone；C6无需Worker入口。
- `PrimitivePipeline.transformToWorldCoordinates`在`scene3DOnly`且single instance时不烘焙world vertices，而把
  instance matrix合入primitive matrix；当前planar World固定SCENE3D并满足此条件。
- 标准Primitive已经拥有Appearance shader/render state、GeometryInstance attributes、pick id、world bounds、
  model matrix update、command reuse和GPU destroy。
- `PolylineGeometry.createGeometry`在`ArcType.NONE`时跳过Ellipsoid subdivision，能够生成标准pixel-width
  triangle geometry；`PolygonPipeline.triangulate`可以继续只用于二维XY earcut。

### 现有SceneGIS缺口

- C3 Polyline/Polygon依赖per-Entity `_SceneGISPlanarBufferOwner`和experimental Buffer collections；该路径不是
  public API，并使用private `_boundingVolume`/dirty行为。
- Buffer的fixed capacity、flyweight和Uint8 width不能成为长期SceneGIS contract；C3的`[0,255]` integer宽度
  限制只是该storage实现的副作用。
- Standard Primitive geometry在首次render后不可替换，C6 wrapper必须提供candidate/current协议；不能让Entity
  visualizer再保留另一套mutable Buffer geometry。
- C4已经提供正确的per-DataSource primitive target和automatic gate。C6只替换children内部owner，不需要新的
  upstream seam。

ADR-0018裁决：采用SceneGIS-owned public geometry descriptor + public wrapper，内部只用Cesium标准同步
Primitive；不公开experimental Buffer，不允许dual runtime。

## 公共API与语义

### SceneGISPlanarPolylineGeometry

- 构造接收finite planar `Cartesian3[]`、finite positive pixel `width`与可选finite `origin`；至少两个相邻
  规范化后不同的位置。
- 复制输入；未传`origin`时以第一个normalized vertex为完整XYZ local origin。公开只读positions/width/
  local-to-world信息时必须返回clone或immutable snapshot，不能暴露可修改内部array。
- 内部固定`ArcType.NONE`，不接受arc、granularity、ellipsoid、heightReference或terrain参数。
- 创建标准Geometry时只生成`PolylineMaterialAppearance`要求的attributes、finite local bounds与triangle indices；
  不进入Worker。

### SceneGISPlanarPolygonGeometry

- 构造接收一个outer ring、direct holes，以及已解析的top positions、可选bottom/cap/side配置和finite
  `origin`；不读取World、Property或terrain。
- 复用C3已批准的closure normalization、simple-ring/intersection/hole validation和
  `PolygonPipeline.triangulate`；nested holes、touching/overlap和degenerate triangle继续fail-fast。
- 未传`origin`时，以第一个normalized top vertex为完整XYZ local origin；生成fill/extrusion triangle
  Geometry，outline由调用方构造独立PolylineGeometry。
- Geometry满足flat `PerInstanceColorAppearance` vertex format并提供finite local bounds；不混合line primitive
  type、不拥有Appearance。

### SceneGISPlanarPrimitive

构造options：

- required `geometry`：只能是C6两个public SceneGIS geometry类型；
- required `appearance`：Polyline只接受使用`Material.ColorType`的`PolylineMaterialAppearance`，Polygon只接受
  flat `PerInstanceColorAppearance`和finite color attribute；
- optional `id`、GeometryInstance `attributes`、finite affine `modelMatrix`、`show=true`、
  `allowPicking=true`。

稳定接口至少包括：mutable `geometry`/`appearance`/`modelMatrix`/`show`，readonly `id`/`allowPicking`/
`ready`，`getGeometryInstanceAttributes()`、`getBoundingSphere(result)`、`isDestroyed()`和`destroy()`。
具体JSDoc必须标明异常、ownership和destroyed-object行为；不得把内部standard Primitive作为public property。

- Wrapper只创建一个GeometryInstance和一个internal standard Primitive，固定`asynchronous:false`、
  `releaseGeometryInstances`由wrapper控制。
- Public modelMatrix是围绕geometry local origin的附加local transform；最终world matrix固定为
  `translation(geometry.origin) * modelMatrix`。Setter必须clone并验证finite affine matrix。
- GeometryInstance使用`pickPrimitive`或等价标准seam，使pick result的primitive为wrapper、id为调用方id；Entity
  adapter传original Entity。
- Appearance/Material/Geometry/id/input attributes caller-owned；内部snapshot、Primitive和GPU/pick资源由wrapper
  exactly-once拥有。

## 允许影响路径

### 新增public runtime与Specs

- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarPolylineGeometry.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarPolygonGeometry.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarPrimitive.js`
- `packages/engine/Source/SceneGIS/**/_private/**`中仅为上述三类服务的窄helper
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarPolylineGeometrySpec.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarPolygonGeometrySpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarPrimitiveSpec.js`

### 迁移existing Entity adapter

- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarBufferOwner.js`（迁移后无引用则删除）
- 对应C3/C4/C5 SceneGIS Specs，仅更新由runtime迁移或width contract直接影响的断言

### 文档与交接

- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarContentGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0015-*.md`（只追加被ADR-0018替代说明）
- `Documentation/SceneGIS/Decisions/ADR-0018-*.md`
- `AgentDocs/planar-content/**`

任何超出上述产品路径的需要必须先在phase plan记录源码事实和理由；若触及upstream-owned file，Execution暂停并
回报，不得自行扩大到Renderer/Worker/build。

## 实现步骤

### C6-A：纯CPU Geometry

1. 把C3中与Entity/Property/terrain无关的ring normalization、topology、triangulation、extrusion mesh和local
   rebasing提炼到SceneGIS Core helper；public构造器完整clone/preflight后才保存snapshot。
2. 实现Polyline geometry，内部调用或等价复用`PolylineGeometry.createGeometry`的`ArcType.NONE`路径；禁止复制
   整个上游实现，若薄adapter无法保持local origin/vertex format，先回报Architecture。
3. 实现Polygon geometry，输出standard `Geometry`、DOUBLE local position、indices、primitive type与local
   bounding sphere；outline仍组合public Polyline geometry。
4. Specs锁定finite/alias safety、duplicate normalization、holes/topology、extrusion/caps、fractional和大width、
   exact origin/rebase、input immutability与derived overflow。

### C6-B：Public Primitive wrapper

1. 对geometry brand、appearance pair、attributes、id、matrix/show/picking options做mutation前preflight；构造不访问
   Context或Scene。
2. 创建一个standard GeometryInstance，使用geometry local origin matrix、caller id/attributes和wrapper pick
   identity；内部Primitive固定synchronous。
3. normal render首次初始化和geometry replacement使用candidate/current。记录command list起点；失败时只回滚
   candidate command/resource并保留current与原始错误。Pick/depth pass不得promote geometry。
4. show/modelMatrix/compatible Material uniform或per-instance attribute变化复用current；translucency/appearance pair或
   geometry变化按完整candidate替换。
5. first-Context binding在所有mutation前验证；第二Context、destroyed use、invalid result或non-finite bounds
   fail-fast。
6. 直接real Context Spec验证render/pick/depth、wrapper/id identity、大坐标像素、world bounds、warm command/VA/
   shader/PickId identity、candidate failure、PrimitiveCollection两种destroyPrimitives与exactly-once cleanup。

### C6-C：Polyline/Polygon Entity迁移

1. 保留现有Property、HeightReference、extent、topology和candidate state计算；只把render owner替换为一个或多个
   public SceneGISPlanarPrimitive。
2. Polyline和Polygon outline width改为finite nonnegative number；0保持hidden，fractional与大于255的值必须
   精确进入geometry。更新ADR-0015 supersession与focused Specs。
3. Fill/outline分别使用public Polygon/Polyline Geometry；original Entity作为id，per-DataSource
   `PrimitiveCollection`作为caller owner，`getBoundingSphere`继续返回解析后联合world sphere。
4. 未变化warm update不创建Geometry/Primitive或改写attributes；同geometry style更新优先复用Material/attribute，
   topology、origin或blend class变化使用public wrapper candidate协议。
5. 删除无引用private Buffer owner和SceneGIS Buffer imports；不得修改上游experimental classes。

### C6-D：文档、生成与review

1. 更新Architecture、DevelopmentGuide与PlanarContentGuide，明确public direct使用、Appearance matrix、Entity复用、
   raw Cesium Geometry边界和C7/C9 defer。
2. 更新升级清单：standard Primitive同步路径、GeometryInstance pick/model matrix、Appearance vertex format、
   PrimitiveCollection lifecycle；移除SceneGIS Buffer owner升级依赖。
3. 验证engine/Cesium root runtime、`.d.ts`与API HTML包含三个public类型；任何private helper和removed Buffer owner
   不进入supported declarations/API。
4. 创建pending C6 review，回写实际source-to-spec mapping、API差异、migration结果、计数、commands、ownership与
   remaining risks；Execution停止，不commit、不push、不进入C7。

## 测试与验收

### Hard behavior/resource gates

- 两个public Geometry在无World/Scene/Context下可确定创建；输入mutation不改变snapshot，invalid/overflow原子失败。
- 应用直接把public Primitive加入`scene.primitives`，line、fill、hole、extrusion可见，depth finite，可pick到wrapper与
  caller id，world bounds包含实际geometry。
- EPSG:3857-scale输入仍使用小local vertices+translation matrix，代表性pixel/pick正确；不把world coordinates降为
  Float32。
- geometry replacement只在normal render生效；pick/depth只复用last current。失败保留旧画面，成功后old resource
  exactly once释放。
- unchanged warm frames保持Primitive/command/VA/shader/PickId/attribute identity和persistent resource count；
  modelMatrix/show/color的批准更新不重建geometry。
- automatic Polyline/Polygon使用public wrapper，保留C3/C4 terrain/selection/order/remove行为；SceneGIS runtime中
  experimental Buffer owner/import命中0。
- default Globe、Point/Billboard/Label/Model与planar world/terrain runtime不被修改。

### 最小充分命令

Execution记录实际runner语法，至少包括：

1. 新的两个Core Geometry suites和public Primitive real Context suite；
2. C3 Polyline、Polygon与`SceneGISPlanarGeometry` real Context suites；
3. C4 automatic Widget focused suite和C5 qualification suite，证明public wrapper迁移后的automatic/warm/lifecycle；
4. `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`；public API变化要求四项，除非首次
   `build`已明确失败，否则不扩大到无关build-release或全库Specs；
5. scoped ESLint、JS/Markdown Prettier、Markdownlint、`git diff --check`；
6. `node scripts/scenegis/audit-upstream-patches.mjs`，确认current delivery upstream-owned=`0`、C6 SGP=`0`、
   generated status=`0`；
7. root JS/types/API精确断言三个public类型存在，private helper/removed owner在declarations/API命中0。

不运行无关Cesium全库Specs、不重复Sandcastle/E2E/package smoke、不做极端numeric matrix或长时间soak。C6不改变
Sandcastle或installed package交付边界，相关整体验收留给C10。

## Ownership与阶段门禁

- 预期upstream-owned product/test/build files=`0`，C6 SGP=`0`。
- 历史`Scene.js`、`CesiumWidget.js`、`Viewer.js`、manifest与`SGP-0001/0002` hunks必须unchanged。
- 生成文件、WebGL artifacts、临时bundle与profile输出不得进入status。
- Execution完成implementation、最小充分验证与AgentDocs后创建`pending` review并停止；不commit、不push、不进入
  C7。
- Architecture/code review通过后，由Architecture Agent形成C6独立中文本地提交检查点，再自动设计并派发C7。

## 当前交接

- C1-C5首批profile和人工验收checkpoint之后，extension已在`40b5e56f2d`重新激活。
- ADR-0018与本phase plan已confirmed；C6状态为`active`。
- 下一步：Execution从planning base实现C6-A～C6-D，创建pending review后回报Architecture Agent。

## 偏差与结果

待Execution回写。任何API名称、Appearance pair、Geometry input、dynamic replacement或ownership偏差都必须先记录
原因；若会形成不同长期contract，应暂停并交由Architecture复核。
