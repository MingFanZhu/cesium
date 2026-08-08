# ADR-0015：平面 Polyline、Polygon 与顶点采样地表

## 状态

- Status：`approved`
- Date：`2026-08-09`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主设计权限）
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-09-phase-c3-polyline-polygon.md`
- Related patch：无；C3 计划保持 upstream-owned files=`0`、SGP=`0`

## 上下文与源码事实

ADR-0013 已确定平面内容使用米制 `Cartesian3`、固定 X east/Y north/Z up 轴，以及
`HeightReference.NONE`、`CLAMP_TO_GROUND`、`RELATIVE_TO_GROUND` 三值子集。C1 的
`_SceneGISPlanarPositionResolver` 提供同步、无请求、无持有的 resident terrain/Z=0 解析；C2 已证明
private visualizer 可以复用 Cesium `Entity`、Property、低层 primitive 和 original Entity picking，而不
进入默认 Globe visualizer。

Cesium 1.144 当前线面实现具有以下约束：

- `PolylineGraphics` 和 `PolygonGraphics` 的公开 Property 模型可以继续复用，但它们的默认
  `arcType`、`granularity`、ground、classification 和高度说明均以 Globe/ellipsoid 为前提。
- 默认 `PolylineVisualizer`、`PolylineGeometryUpdater`、`PolygonGeometryUpdater`、
  `GroundPolylinePrimitive` 和 `GroundPrimitive` 会进入 geodesic/rhumb、Cartographic、Ellipsoid、
  terrain classification 或 Globe ground pipeline，不能作为 planar geometry runtime。
- `PolygonPipeline.triangulate` 只是基于二维坐标和 hole offsets 的 earcut 封装，可以单独用于平面 XY
  triangulation；同文件的 subdivision、rhumb 与 geodetic-height 方法仍是 ellipsoid-oriented，不能调用。
- `BufferPolylineCollection` 与 `BufferPolygonCollection` 接受任意 `Cartesian3`、显式 triangle indices、
  `ComponentDatatype.DOUBLE`、`modelMatrix`、world-space bounding volume 和 pick object，并只在
  `SCENE3D` 渲染，适合当前不可切换的 planar scene。
- 这些 Buffer collection 标记为 `@experimental`，容量和 topology 在创建后受限，任意对象删除与
  `isDestroyed` 语义也不适合作为公共内容 API。它们必须隔离在 SceneGIS private adapter 内，并形成
  Cesium 升级检查点。

因此，C3 可以复用 Graphics/Property、二维 triangulation 和低层 buffer renderer，但不能复用默认
Globe updater，也不能直接把 experimental collection 暴露给调用方。

## 决策

### 私有 Visualizer 与阶段边界

C3 新增两个 SceneGIS-owned private visualizer：

```text
_SceneGISPlanarPolylineVisualizer
_SceneGISPlanarPolygonVisualizer
```

实现可以增加一个仅供二者复用的 private geometry/primitive helper，但不得建立第二套公开 Graphic、
Property 或 scene graph。Visualizer 遵循 Cesium 的 `update(time)`、`getBoundingSphere`、
`isDestroyed`、`destroy` 习惯，使用 `@private`，不得进入 `.d.ts` 或 API HTML。

C3 仍只验证显式构造的 visualizer，不修改 Viewer、`DataSourceDisplay` 或默认 visualizer list。C4 才把
C2/C3 visualizer 作为一个 instance-owned planar display profile 自动安装，并在 mutation 前执行完整
graphics allowlist。

### 统一的平面几何规则

- 所有输入位置已位于 World 的米制 CRS；边使用 XY 平面中的直线连接，不进行 geodesic、rhumb、
  Cartographic 或 CRS 转换。
- `arcType` 未定义时，planar profile 将其解释为 `ArcType.NONE`；显式值只接受
  `ArcType.NONE`。这是 planar profile 的明确默认值，不沿用 Globe 的 `GEODESIC` 默认值。
- 每个 supplied vertex 通过 C1 resolver 独立解析。合法但 extent 外的任一顶点使整个 graphic 当前隐藏；
  C3 不裁剪几何，也不把顶点夹到 extent 边界。
- Clamp/drape 只采样调用方提供的顶点，并在相邻顶点或 triangle 内线性插值。C3 不隐式细分、不发起
  terrain request、不承诺贴合两顶点之间的全部 terrain 细节。调用方通过增加顶点控制精度。
- Resident terrain 尚未可用、terminal failure、provider detach/replacement 或 LOD/revision 变化时，
  每次 normal `update(time)` 重新应用 ADR-0013 的当前 resident height/Z=0 fallback；不订阅 terrain，
  不取得 provider/cache 所有权，也不改变 `world.tilesLoaded`。
- 非有限输入、非法 enum、非法 topology 或 derived overflow 在任何 scene/resource/current-geometry
  mutation 前抛英文 `DeveloperError`。合法但不可见状态只隐藏，不抛错。

### Polyline compatibility profile

`_SceneGISPlanarPolylineVisualizer` 支持：

- Entity `isShowing`、availability 与 `PolylineGraphics.show`；
- `positions`，至少两个 finite `Cartesian3`；
- `width`，默认 `1.0`，必须 finite 且大于或等于零；零宽度等价于当前不可见；
- 未定义 material 时的 `Color.WHITE`，以及 `ColorMaterialProperty` 的 finite `Color`；
- `clampToGround=false`：保留每个输入位置的 absolute Z；
- `clampToGround=true`：忽略输入 Z，对每个 supplied vertex 使用
  `HeightReference.CLAMP_TO_GROUND`；
- `arcType` 的 planar `NONE` 规则，以及 original Entity picking。

`PolylineGraphics` 没有 relative-height Property，C3 不发明隐式 relative polyline 模式。需要 relative
terrain 的调用方应提供已经解析的动态 positions，或等待后续明确的公共 API。

下列 Polyline 配置在 mutation 前显式拒绝：非 `ColorMaterialProperty`、已定义
`depthFailMaterial`、已定义 `granularity`、非 `NONE` arc、非 `ShadowMode.DISABLED` shadows、已定义
`distanceDisplayCondition`、`classificationType` 或 `zIndex`。C3 不静默忽略这些 Globe/未批准语义。

### Polygon hierarchy、height 与 extrusion

`_SceneGISPlanarPolygonVisualizer` 支持一个 outer ring 和任意 direct holes；nested hole/island 留到后续
扩展。每个 ring：

- 可以省略闭合终点；若末点与首点在 XY 相同，则先执行唯一一次闭合点规范化；
- 规范化后至少有三个不同 XY 顶点、finite coordinates 和非零 signed area；
- 必须是 simple ring。Self-intersection、hole 与 outer/hole 的相交、相切、hole 不在 outer 内或 holes
  互相包含/重叠均不属于 C3 supported topology，并在 mutation 前拒绝；
- 使用 `PolygonPipeline.triangulate` 处理规范化后的 XY 与 direct-hole offsets；只接受 finite、范围内、
  非退化的完整 triangle result。

Top surface 的高度规则为：

1. `perPositionHeight=false`（默认）：忽略 hierarchy position Z；对每个顶点把 scalar `height`
   （默认 `0.0`）与 `heightReference`（默认 `NONE`）交给 C1 resolver。因此 `CLAMP_TO_GROUND` 是顶点
   drape，`RELATIVE_TO_GROUND` 是每顶点 resident height 加 scalar offset。
2. `perPositionHeight=true`：直接使用每个 hierarchy position 的 absolute Z；`heightReference` 必须为
   `NONE`。`height` 与 Cesium 既有语义一样不参与 top 计算，但已定义值仍必须 finite。

`extrudedHeight` 未定义时只生成 top surface。定义后，它是每个顶点的 scalar bottom height，并使用
`extrudedHeightReference`（默认 `NONE`）通过同一个 resolver 解析。每个 bottom Z 必须小于或等于对应
top Z；否则在 mutation 前拒绝。Extrusion 对 outer 和 holes 生成 side walls，`closeTop`、
`closeBottom`（均默认 `true`）控制 top/bottom cap；side walls 在 extrusion 存在时始终生成。相等高度
允许出现零高度边，但不得产生非有限 geometry。

Polygon style 支持：

- `fill`（默认 `true`）和未定义 material/`ColorMaterialProperty`；
- `outline`（默认 `false`）、`outlineColor`（默认 `Color.BLACK`）与 finite、非负
  `outlineWidth`（默认 `1.0`）；
- 非 extrusion 时 outline 包含所有 top rings；extrusion 时包含 top/bottom rings 和 outer/hole 的垂直
  边，始终使用同一个 original Entity pick object；
- `show`、planar `arcType=NONE`、`perPositionHeight`、`closeTop` 与 `closeBottom`。

下列 Polygon 配置在 mutation 前显式拒绝：非 color material、已定义 `stRotation`、`granularity`、
`textureCoordinates`、非 `NONE` arc、非 `ShadowMode.DISABLED` shadows、已定义
`distanceDisplayCondition`、`classificationType` 或 `zIndex`。C3 不进入 Globe ground/classification、
texture coordinate 或 shadow pipeline。

### Buffer geometry、精度与 picking

- 每个 active Entity/graphic 在 C3 correctness phase 拥有独立 private render owner。Polyline owner 包含
  一个 `BufferPolylineCollection`；Polygon owner可以包含一个 fill `BufferPolygonCollection` 和一个
  outline `BufferPolylineCollection`。C5 再依据 profiling 设计跨 Entity batching。
- Collection 使用 `ComponentDatatype.DOUBLE`，但几何仍以每个 graphic 的稳定 local origin 存储，
  `modelMatrix` 只恢复 planar world translation。不得把 EPSG:3857-scale 完整世界坐标写入 Float32
  vertex。
- 每个 collection 使用 visualizer 维护的 world-space `BoundingSphere`；`getBoundingSphere` 返回当前
  resolved top/bottom/outline 的联合 sphere。隐藏或无有效 geometry 返回 `FAILED`，同步 ready geometry
  返回 `DONE`，C3 不引入异步 `PENDING`。
- Pick object 是稳定的 `{ id: entity, primitive: owner }`，保证 `scene.pick` 和后续 Viewer selection 得到
  original Entity，而不是 Entity id string 或 Buffer flyweight。
- Color alpha 决定 collection 的 opaque/translucent blend class。Blend class、topology、vertex/index
  capacity或 local origin需要改变时，先完整构造和验证 candidate owner，再原子替换 current owner；
  同 topology 的位置和 style 更新在完整 preflight 后原地更新 buffer。
- `show=false`、availability false 或 extent outside 时隐藏并保留 current owner；graphic/Entity 移除、
  candidate replacement 和 visualizer destroy 时才释放。
- Visualizer 显式跟踪 owner 状态，不依赖 experimental collection 始终返回 false 的
  `isDestroyed()`。Scene removal、renderer/pick resource destroy、subscription disconnect 必须 exactly
  once；失败的 candidate 不能留在 `scene.primitives`。
- 未变化 warm update 保持 owner、collection、buffer、DrawCommand/PickId 和 subscription identity，不得
  产生新的 owned GPU resource。

### 原子性、上下文与集成

Visualizer 构造接收 live `SceneGISPlanarWorld`、Scene 和 caller-owned `EntityCollection`。它拥有自己
加入 `scene.primitives` 的 private owner 与 collection，也拥有 EntityCollection subscription；不拥有
Scene、World、EntityCollection、Entity、Property 或 terrain provider。

所有 Property value、topology、height result、local transform、bounds、material 与 capacity 先在 scratch/
candidate 中验证，再修改 current owner。若 candidate 已插入 Scene 后后续步骤失败，cleanup 只移除并
销毁该 candidate，保留原始异常和 current owner。

C3 不新增 public API、World method、content readiness、Shader、Worker、build seam 或 upstream patch。
若实现证明 Buffer collection 无法满足 depth/pick/precision/lifecycle contract，Execution 必须暂停回报，
不得擅自复制 renderer或转入大范围上游修改。

## 不采用的方案

### 直接复用默认 GeometryUpdater/GroundPrimitive

拒绝。它们把 positions、height、arc 和 ground 解释为 ellipsoid/Cartographic 语义；即使预先改写 Z，
仍可能在 topology、subdivision 或 classification 阶段重新进入 Globe path。

### 把 clamp/drape 解释为连续 terrain 贴合

拒绝。C1 只有同步 resident point height，C3 没有采样请求、误差预算或自适应 subdivision。将线段/三角形
内部宣称为连续贴地会形成无法兑现的精度和 readiness 契约。

### C3 直接建立跨 Entity batch

拒绝。Experimental buffer collection 的 append-only topology、删除与容量策略需要真实对象规模和
profiling。C3先固定 correctness、atomic replacement 与 lifecycle；C5 再决定静态/动态批次。

### 暴露 Buffer collection 或 private visualizer 为公共 API

拒绝。Buffer API 处于 experimental 状态，且 C4 尚未形成自动 display profile。公共化会把上游易变
capacity、flyweight 和 destroy 细节固化为 SceneGIS contract。

### 隐式生成 relative polyline 或自动 terrain subdivision

拒绝。`PolylineGraphics` 没有对应 Property，自动扩展会改变调用方 topology、性能与采样语义。需要时
应在后续阶段建立显式 API 和误差预算。

## 兼容性、所有权与构建

C3 预计只新增 `packages/engine/Source/SceneGIS/DataSources/_private/**`、对应 SceneGIS Specs、必要的
SceneGIS durable docs 和 AgentDocs。Upstream-owned files=`0`、C3 SGP=`0`，不修改既有
SGP-0001/SGP-0002 或 manifest。

Private source basename可以被 runtime barrel发现，但不得形成 supported declaration/API。不得手工编辑
generated root exports、`.d.ts`、SpecList、API HTML 或 `Build/**`。

## 测试与升级检查点

C3 focused Specs 至少覆盖：

- Polyline straight/default NONE、absolute/clamp、dynamic terrain/positions/style、extent、非法 profile、
  original Entity pick、bounds、warm reuse 与 destroy；
- Polygon outer/direct holes、closure normalization、simple topology、三种 top height语义、per-position
  height、extrusion/caps/sides/outline、dynamic terrain/topology/style、atomic failure 与 lifecycle；
- 一个 local-fixture real WebGL closure验证大坐标 local/modelMatrix、line/fill/hole/extrusion像素、opaque/
  translucent、original Entity picking、depth、warm identity与resource balance。

每次 Cesium 升级复核：

- `BufferPrimitiveCollection`、Polyline/Polygon collection和flyweight的constructor、capacity、dirty range、
  blend、pick、bounding volume、Context与destroy语义；
- `renderBufferPolylineCollection`、`renderBufferPolygonCollection` 的 high/low position、modelMatrix、
  SceneMode、depth/pick pass与command lifecycle；
- `PolygonPipeline.triangulate`/earcut输入输出、hole offsets和degenerate行为；
- `PolylineGraphics`、`PolygonGraphics` Property/default变化，以及默认 Globe updater是否提供了真正的
  coordinate-system-neutral adapter seam；
- private declaration/API filtering、Spec discovery和C4 visualizer injection边界。

若上游 experimental buffer API被移除或发生破坏性变化，只替换 SceneGIS private render owner，不改变
本 ADR 的 planar Graphics contract。
