# ADR-0018：公共平面 Primitive、Geometry 与标准 Primitive 后端

## 状态

- Status：`approved`
- Date：`2026-08-09`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主设计与派工权限）
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-09-phase-c6-public-planar-primitive-and-geometry.md`
- Related patch：无；C6 默认 upstream-owned files=`0`、SGP=`0`

## 上下文与源码事实

C1-C5 已经让 Point、Billboard、Label、Model、Polyline 与 Polygon 通过 private visualizer 自动进入
`CustomDataSource`/`Viewer`。其中 Polyline 与 Polygon 仍由每个 Entity 的 private
`BufferPolylineCollection`/`BufferPolygonCollection` owner 渲染，应用无法直接使用稳定的 planar
Primitive/Geometry API。两个 Buffer collection 均为 Cesium experimental API，公开其 capacity、flyweight、
dirty range 或 destroy 细节会把上游易变实现固化为 SceneGIS contract。

Cesium 1.144 当前标准 `Primitive` 路径具有可复用的坐标中立部分：

- `asynchronous:false` 时，`Primitive.loadSynchronous` 可以直接克隆已创建的 `Geometry`，不要求 Worker
  basename或pack/unpack协议；
- `frameState.scene3DOnly===true` 且只有一个 instance 时，`PrimitivePipeline` 保留局部顶点，并把 instance
  `modelMatrix` 合入 primitive `modelMatrix`，不会执行2D投影、IDL split或Cartographic转换；
- `Primitive` 已提供 Appearance、GeometryInstance attributes、picking、world bounding sphere、command复用、
  mutable model matrix与deterministic GPU destroy；
- `PolylineGeometry.createGeometry` 只有在`ArcType.GEODESIC`或`RHUMB`时才进入Ellipsoid/
  `PolylinePipeline`细分。固定`ArcType.NONE`时可以把局部planar Cartesian3生成标准宽线Geometry；
- `PolygonPipeline.triangulate`仍可作为纯二维XY earcut入口，其他ellipsoid subdivision与ground path不可复用。

因此，公共契约可以建立在SceneGIS-owned geometry descriptor与wrapper之上，内部复用Cesium标准同步
`Primitive`，而不复制renderer，也不把experimental Buffer暴露为公共API。

## 决策

### 公共类型与封闭Geometry集合

C6新增三个public类型：

```text
SceneGISPlanarPrimitive
SceneGISPlanarPolylineGeometry
SceneGISPlanarPolygonGeometry
```

`SceneGISPlanarPrimitive`在C6只接受上述两个SceneGIS planar geometry类型。任意raw Cesium `Geometry`、
`GeometryInstance`、Globe geometry factory或伪造的structural object均不属于C6 supported input；必须在scene、
command或GPU mutation前拒绝。C7/C8可以按同一私有brand/adapter contract增加新的SceneGIS geometry类型，
但不得放宽为“所有Cesium Geometry自动具有planar语义”。

两个Geometry构造器接收已经位于planar World米制CRS中的finite `Cartesian3`，复制输入，并允许可选finite
`origin`；未提供时，以确定性的首个normalized vertex作为完整XYZ local origin。创建的GPU geometry只保存
相对origin的DOUBLE坐标，origin通过只读local-to-world translation恢复；不得把EPSG:3857尺度的完整世界坐标
降为Float32顶点。

- `SceneGISPlanarPolylineGeometry`接受至少两个不同位置与finite positive pixel width；内部固定
  `ArcType.NONE`并生成适配`PolylineMaterialAppearance`的标准triangle geometry。它不接受ellipsoid、arc、
  granularity或terrain参数。
- `SceneGISPlanarPolygonGeometry`接受一个simple outer ring、direct holes、可选bottom ring/cap/side配置，执行
  C3已批准的closure normalization、topology validation和XY triangulation，生成适配flat
  `PerInstanceColorAppearance`的triangle geometry。Outline使用独立的
  `SceneGISPlanarPolylineGeometry`，不在一个Geometry中隐式混合primitive type。
- Geometry是CPU-only、immutable snapshot，不拥有World、terrain、Appearance、Scene、Context或GPU资源；
  `HeightReference`解析继续属于Entity adapter/C1 resolver，低层Geometry不查询terrain。

### SceneGISPlanarPrimitive契约

`SceneGISPlanarPrimitive`作为可直接加入`scene.primitives`或任意caller-owned `PrimitiveCollection`的Scene
primitive，构造profile固定为：

- 必需`geometry`；必需且与geometry kind匹配的`appearance`；可选`id`、`attributes`、finite affine
  `modelMatrix`、`show`与`allowPicking`；
- C6 Appearance allowlist为使用`Material.ColorType`的`PolylineMaterialAppearance`，以及Polygon的flat
  `PerInstanceColorAppearance`和finite color attribute。Material/texture扩展必须在后续phase形成明确
  vertex-format与ownership profile，未知组合不得推迟到不可解释的shader错误后才静默失败；
- `asynchronous`固定为`false`且不作为public option，不新增Worker、pack/unpack或build seam；
- 一个wrapper只拥有一个GeometryInstance/一个内部standard Primitive。Polygon fill与outline、或多个Entity，
  使用多个wrapper，而不是让不同local origin在PrimitivePipeline中被烘焙回完整world vertices；
- `geometry`、`appearance`、`modelMatrix`和`show`可按文档更新；`id`与`allowPicking`在构造后只读。
  Public `modelMatrix`表示围绕Geometry local origin的附加local transform；最终world matrix固定为
  `translation(geometry.origin) * modelMatrix`，并在任一部分变化后重新计算world bounds；
- `getGeometryInstanceAttributes`与`getBoundingSphere(result)`提供受支持的attributes/bounds入口；`ready`只读，
  `isDestroyed`/`destroy`遵守Cesium lifecycle习惯；
- pick result的`primitive`必须是public wrapper，`id`必须是调用方传入对象。Entity adapter传入original Entity，
  不暴露内部standard Primitive或private owner。

Appearance、Material、Geometry、id与输入attributes为caller-owned；wrapper只拥有由其创建的内部
`GeometryInstance` snapshot、standard Primitive、DrawCommand、VA、shader/pick资源。Wrapper不拥有Scene、
PrimitiveCollection、Context或World。

### 动态替换、Context与原子性

标准Primitive在首次render后不能替换`geometryInstances`。Wrapper因此使用candidate/current协议：

1. setter先完成geometry/appearance/model matrix/attributes与derived bounds的全部CPU preflight；
2. geometry或需要新shader/translucency class的变化只在normal render pass初始化candidate；pick/depth pass只提交
   last successful current；
3. candidate同步初始化成功后，在同一normal frame原子成为current并释放old；失败时回滚该candidate新增的
   command与GPU资源，保留old和原始异常；
4. 同geometry的show、model matrix、Material uniform或per-instance attribute更新优先复用current，不得每帧重建；
5. 第一个Context成功绑定后，任何第二Context都必须在command、candidate或resource mutation前fail-fast；
6. replacement、collection removal与destroy必须exactly once，destroy后的更新、setter或bounds访问遵循
   Cesium destroyed-object规则。

未变化warm frame保持wrapper、internal Primitive、GeometryInstance、DrawCommand、VA、shader、PickId和attributes
identity，不增加持久CPU/GPU资源。

### Entity adapter迁移与C3兼容性

C6把`_SceneGISPlanarPolylineVisualizer`和`_SceneGISPlanarPolygonVisualizer`迁移为上述public geometry与
primitive的adapter。Topology、HeightReference、resident-terrain vertex sampling、original Entity picking、
per-DataSource target、bounds与automatic gate继续遵守ADR-0013/0015/0016；visualizer不得保留第二套Buffer
geometry实现。

迁移完成后，SceneGIS product runtime不再依赖`_SceneGISPlanarBufferOwner`、
`BufferPolylineCollection`、`BufferPolygonCollection`或它们的private `_boundingVolume`/dirty字段。若没有其他
SceneGIS引用，应删除private owner；上游experimental实现本身不修改。

标准Polyline geometry使用Float width，不再受Buffer Uint8 layout限制。因此ADR-0015中Polyline `width`和
Polygon `outlineWidth`必须是`[0,255]` integer的规定由本ADR替代：Entity profile接受finite nonnegative
number，`0`表示当前隐藏，positive fractional和大于255的值必须精确传入standard geometry。其他C3 property
allowlist和vertex-only terrain语义保持不变。

### 阶段边界

C6只交付public Primitive基础、代表性Polyline/Polygon Geometry和现有Entity adapter迁移。Box、Cylinder、
Ellipse、Rectangle等普通graphics属于C7；Corridor、Wall、PolylineVolume与Path属于C8；continuous terrain
drape与planar ground属于C9。C6不得用本次Primitive重构提前实现这些阶段。

## 不采用的方案

### 直接公开experimental Buffer collection

拒绝。它会公开固定capacity、flyweight、Uint8 width、dirty range与非标准destroy语义，并把上游实验API变成
长期兼容面。

### 继续保留Entity Buffer路径，另建一套public Primitive

拒绝。这会直接违反Entity adapter必须复用public低层实现的整体验收条件，并让picking、bounds、dynamic update
和ground未来出现两套语义。

### 宣布raw Cesium Primitive/Geometry全部可用于planar World

拒绝。Primitive本身坐标中立，但许多Geometry factory会调用Ellipsoid、Cartographic、geodesic或ground
pipeline。C6只能承诺明确审计过的SceneGIS geometry集合。

### 复制Primitive renderer或新增Worker pipeline

拒绝。标准同步Primitive已经满足C6的command、appearance、pick、bounds和GPU lifecycle需求；复制renderer
或新增Worker只会扩大升级与构建面。若后续profile证明同步CPU构建是可重复热点，再单独设计Worker协议。

## 兼容性、所有权与升级检查

C6默认只修改`packages/engine/Source/SceneGIS/**`、对应Specs、SceneGIS文档和AgentDocs；upstream-owned
files=`0`、SGP=`0`，不得改变历史`SGP-0001/0002` hunk或manifest语义。Public类型必须进入engine/Cesium root
runtime、declarations与API HTML；新的private helper不得进入declarations/API。

每次Cesium升级至少复核：

- `Primitive.loadSynchronous`对direct Geometry的clone、single-instance model matrix合并、bounds与ready时序；
- `PrimitivePipeline`的`scene3DOnly`、position high/low encoding和GeometryInstance pickPrimitive/attributes；
- `PolylineGeometry`在`ArcType.NONE`下不读取Ellipsoid/Cartographic的事实，以及
  `PolylineMaterialAppearance` vertex attributes；
- `PerInstanceColorAppearance` flat vertex format、translucency、attribute mutation与pick behavior；
- `PrimitiveCollection` insertion/removal/destroyPrimitives和post-insertion event failure；
- C3 visualizer不再引用experimental Buffer API，C4 per-DataSource target/order/remove与C5 moderate warm
  qualification保持通过。
