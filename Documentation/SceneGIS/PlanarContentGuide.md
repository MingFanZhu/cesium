# SceneGIS 平面内容使用指南

本文档描述 `planar-content` 的稳定坐标、高度和兼容性边界。C1 已完成 position contract，C2/C3 提供
private Anchor/Model/Polyline/Polygon/Solid/Area visualizer，C4 已把这些角色以 instance-owned callback 接入
`CesiumWidget`、`Viewer` 和 `CustomDataSource`。

长期设计依据见
[ADR-0013](Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)。平面 World、terrain
query 与独立 sampling 的使用方式分别见 [PlanarWorldGuide](PlanarWorldGuide.md) 和 ADR-0010。

## 坐标与 anchor domain

平面内容 position 是米制 `Cartesian3`：X 向东、Y 向北、Z 向上。World 的 opaque `crs` 只作为
标识，不触发转换；应用必须在写入 Property 前完成 CRS 转换。

自动 planar content 的 anchor X/Y 必须位于 `world.coordinateSystem.extent`，四条 outer boundary
inclusive。Finite extent 外 anchor 不显示，不会被 clamp 到边界；non-finite component 是
`DeveloperError`。该限制只作用于 anchor，合法 anchor 所属 geometry 是否可以延伸到 extent 外由
后续 graphic profile决定。

## HeightReference 与逻辑地表

C1 固定以下 subset：

| `HeightReference`    | 最终绝对 Z                |
| -------------------- | ------------------------- |
| `NONE`               | `input.z`                 |
| `CLAMP_TO_GROUND`    | `surfaceHeight`           |
| `RELATIVE_TO_GROUND` | `surfaceHeight + input.z` |

`CLAMP_TO_TERRAIN`、`RELATIVE_TO_TERRAIN`、两种 3D Tiles reference 和未知值不属于首版 profile。
未来 adapter 必须在创建或修改低层资源前拒绝它们。

`surfaceHeight` 来自同步、无请求的 `world.getTerrainHeight(position)`。当当前位置没有 resident
`DIRECT`/`UPSAMPLED` terrain 时，逻辑地表回退到 Z=0；已有 resident ancestor 时沿用该 ancestor，
不能用 flat fallback 覆盖已知 terrain。Resolver 不发请求、不保留 tile，也不改变
`world.tilesLoaded`。Terrain promotion 可以在下一次 content update 才反映到 graphic，这是明确的
eventual consistency。

需要离屏或指定 level 的确定高度时，应用应显式调用
`SceneGISPlanarTerrainSampler.sampleAtLevel`，不能假定 HeightReference 会隐式启动请求。

## 固定平面朝向

- orientation undefined 表示 translation-only，world rotation 为 identity。
- defined Quaternion 表示从 Cesium-normalized object/model local frame 到固定 planar X/Y/Z axes 的
  rotation。
- Planar content 不调用 `Transforms.eastNorthUpToFixedFrame`。
- glTF 自身的 up/forward axis normalization 仍由 Model pipeline负责。

C2 的 private Model visualizer与C7 Solid/Area visualizer共享private fixed-axis transform helper；没有增加public
transform API。

## C2 Anchor 与 Model profile

C2 的 private Anchor visualizer 复用 caller-owned、`enabled === false` 的 `EntityCluster` pool，一个实例
处理 Point、Billboard 与 Label。三类 graphic 都先经 position resolver 得到 absolute planar
`Cartesian3`；Point 始终使用 `PointPrimitive`，低层 Billboard/Label 的 `heightReference` 固定为
`NONE`。临时 hidden、position undefined 或 outside 只隐藏并保留 slot；graphic、position 或 Entity
移除才归还 slot。原始 Entity 保留为低层 `id`。

Anchor 支持当前 Point/Billboard/Label 中不进入 Globe path 的 direct properties，包括 color、size/
scale、outline、font/style、pixel/eye offset、origin、distance/translucency scaling、distance display、
disable-depth、split direction，以及 Billboard 的 size/image/subregion/rotation/aligned-axis。`alignedAxis`
按固定 planar world axis 解释。

C2 的 private Model visualizer 直接使用 `Model.fromGltfAsync` 与 `scene.primitives`。URI 和
`incrementallyLoadTextures` 定义 load generation；position、terrain height、orientation 和 style 更新
不 reload。Async completion 只保存 generation-matched candidate 并 `requestRender`，下一次 normal
`update` 才加入 primitive collection。Stale/removal/destroy completion、candidate 与 active Model 均有
exactly-once cleanup；同 generation failure 不自动重试。

Model 固定 `heightReference=NONE`、`enableVerticalExaggeration=false`、dynamic
environment map disabled，并启用 picking。C2 拒绝 vertical exaggeration、environment map、
clipping planes 与 custom shader 配置；支持的普通 style/animation/property profile以 ADR-0014 为准。
C2 private visualizer 不拥有 World、Scene、EntityCollection、EntityCluster 或输入 Resource。

## C3 Polyline 与 Polygon profile

Polyline 使用 planar straight segments；`arcType` undefined等价于`ArcType.NONE`，显式值也只接受
`NONE`。Ordinary absolute路径保留 supplied vertices；`clampToGround:true`统一使用C11 GPU ground-line backend，
不发请求、不读取terrain triangle，也不随LOD/revision重建footprint。支持solid
`ColorMaterialProperty`、finite nonnegative width、show、availability、dynamic positions、extent、
original Entity picking与world bounds。

Polygon接受一个simple outer ring和direct holes；不接受nested hierarchy、自交、ring touch或hole overlap。
Scalar top支持`NONE`、`CLAMP_TO_GROUND`和`RELATIVE_TO_GROUND`，per-position height保留各顶点absolute Z。
Extrusion显式生成top/bottom caps、outer/hole side walls，outline单独渲染且`outlineWidth`接受finite
nonnegative number。宽度`0`隐藏对应线条；positive fractional与大于255的宽度由standard geometry精确保留。
Ordinary路径按source geometry插值；批准的non-extruded CLAMP组合使用C11 GPU area backend。C3 vertex-only与C9
actual-cover CPU drape均是历史实现。

两类visualizer都是public `SceneGISPlanarPrimitive`与对应Geometry的per-Entity adapter：顶点以local
DOUBLE geometry保存，world origin通过translation恢复，bounds显式保留world坐标，pick id保留original
Entity。拓扑变化使用candidate/current原子替换；warm更新复用wrapper、standard Primitive、DrawCommand与
VertexArray；replacement、removal与destroy成对释放。它们不跨Entity batch，也不拥有World、Scene或
EntityCollection。

## C6 public Primitive 与 Geometry

应用可以直接把`SceneGISPlanarPrimitive`加入`scene.primitives`或caller-owned
`PrimitiveCollection`。C6-C8接受七种已批准的`SceneGISPlanar*Geometry`，包括Polyline、Polygon、三个C7
volume、Wall与PolylineVolume，不接受raw Cesium `Geometry`。Geometry构造器复制米制Cartesian3输入，默认以
第一个规范化顶点的完整XYZ作为origin，并生成local DOUBLE geometry；可选origin同样必须finite。

Polyline Geometry固定`ArcType.NONE`并配对使用`PolylineMaterialAppearance`的Color material 或 `PolylineColorAppearance`。Polygon
Geometry只接受simple outer/direct holes，可选bottom/caps/sides，并配对使用flat
`PerInstanceColorAppearance`与finite color instance attribute；outline是独立Polyline Geometry。Wrapper固定
single synchronous standard `Primitive`，pick结果的primitive为public wrapper、required non-null id为
调用方对象。Wrapper在构造时固定geometry kind；只允许同kind geometry/appearance
replacement，跨kind需新建wrapper。GeometryInstance attributes在首次Context mutation前验证完整shape，
通过`getGeometryInstanceAttributes()`发布的值会在同kind replacement中保留。Desired geometry与
last-successful current分离；在normal render成功前，bounds、model matrix、pick/depth继续对应旧current。
Geometry、Appearance、Material、id与输入attributes由调用方拥有；wrapper只拥有其内部snapshot与
GPU资源。

## 静态业务图形合批

大量静态图形使用 `SceneGISPlanarPrimitive({ geometryInstances, appearance })`。
实例采用与原生 `GeometryInstance` 相同的字段形状，直接传普通对象；不需要创建每对象 Primitive，
也不需要调用私有 geometry factory。球面仍可使用原生 `Primitive({ geometryInstances })`。

```js
const instances = records.map((record) => ({
  geometry: new Cesium.SceneGISPlanarPolygonGeometry({
    positions: record.positions, // Already in the planar world's meter-based CRS.
  }),
  id: record,
  attributes: {
    color: Cesium.ColorGeometryInstanceAttribute.fromColor(record.color),
    show: new Cesium.ShowGeometryInstanceAttribute(true),
  },
}));
const batch = scene.primitives.add(
  new Cesium.SceneGISPlanarPrimitive({
    geometryInstances: instances,
    appearance: new Cesium.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    }),
  }),
);
// After batch.ready becomes true:
batch.getGeometryInstanceAttributes(records[0]).color =
  Cesium.ColorGeometryInstanceAttribute.toValue(Cesium.Color.YELLOW);
batch.getGeometryInstanceAttributes(records[1]).show =
  Cesium.ShowGeometryInstanceAttribute.toValue(false);
const sphere = batch.getBoundingSphere(new Cesium.BoundingSphere(), records[0]);
// scene.pick returns { primitive: batch, id: originalRecord }.
// Removing from an owning PrimitiveCollection destroys the batch's GPU resources.
scene.primitives.remove(batch);
```

- 非空数组内每项有唯一、非空 `id`；所有实例必须具有相同 attributes 名称、类型、维度和 normalize。
  在需要独立显隐时，为每项预先提供 `show`。共享一个 Appearance，按线、flat 面、open wall、closed 体分组；
  Box/Cylinder/Ellipsoid/PolylineVolume 可以共用 closed non-flat `PerInstanceColorAppearance` 批次。
- 普通线可用 `PolylineColorAppearance` 和每项 `color`，或共享 Color `PolylineMaterialAppearance`。
  不透明 Color material 请显式设置 `translucent: false`，与 deferred opaque depth 状态保持一致；
  半透明图形使用对应 translucent Appearance，并接受原生批次粒度的透明排序。
- 每项 `modelMatrix` 在 geometry origin 周围应用；批次 `modelMatrix` 在世界坐标外层应用。
  最终为 `batchMatrix * translation(origin) * instanceMatrix * localVertex`。坐标中间值为 DOUBLE，
  由原生 Primitive 合并和 high/low 编码；完整大坐标不会先降成 Float32。
- 输入列表、矩阵和 attributes 是构造快照；增删对象、改变几何或实例矩阵时重建该批次。
  颜色、显隐等现有 instance attributes、整体 `modelMatrix` 和 `show` 更新复用 GPU 几何。
  `geometry`/`id` 单实例快捷入口与数组互斥；数组模式不能通过 `.geometry` setter 改变拓扑。
- `getBoundingSphere(result)` 返回整批包围球；传 id 返回对应实例包围球；未知 id 抛出 DeveloperError。
  `getGeometryInstanceAttributes(id)` 的 id 在数组模式必需，未知 id 返回 undefined。
- 按空间区域、Appearance、透明性及更新频率组织批次，不要把全部城市图形塞进一个批次。
  原生索引拆分与透明 pass 可能产生多个 VA/command；目标是资源随批次增长，而非随业务对象增长。
  初次构建仍同步，当前没有新增 Worker 或自动 Entity 合批。
- 原生 Point/Billboard/Label collection 已有共享渲染路径，Model 不属于此几何合批入口。

贴地线和非拉伸面使用相同的描述数组，但传给 `SceneGISPlanarGroundPrimitive`，并提供 live `world`：

```js
const groundBatch = scene.primitives.add(
  new Cesium.SceneGISPlanarGroundPrimitive({
    world,
    geometryInstances: instances,
    appearance: new Cesium.PerInstanceColorAppearance({ flat: true }),
  }),
);
// The same per-id color/show, picking and bounding-sphere APIs apply.
```

- 一批仅包含 Polygon 或仅包含 Polyline。贴地线使用 `PolylineColorAppearance` 支持独立颜色，
  或用 Color `PolylineMaterialAppearance` 共享颜色；每条线可有不同 width。
- 坐标只消费 XY，Z 自动贴合当前平面地形；不接受实例或批次 modelMatrix。Provider/LOD 变化不重建几何。
- 一批共享 Primitive、VA 和 BatchTable。贴地线读取地表深度并按线段范围逐片元裁剪；不同颜色、宽度和
  透明度可共用每 VA 一条颜色命令，拾取使用相同裁剪与独立 ID，无逐实例 stencil 命令。
  线的 width 在实际地表位置计算，provider 改变只更新 envelope；线和面均要求 Context 支持 depth texture。
- 贴地面按 XY 范围与实际轮廓的冲突先后关系分层，在原生合并前重排内部实例；输入不连续但互不冲突的面也可合批。
  包围框交叠区域在双方填充轮廓中都为空时，也允许同组。兼容的面无论颜色和透明度，都共用一对
  stencil/fill 命令；拾取也共用这对命令，每个对象保留独立 ID。颜色/显隐仍通过实例属性更新。
  相交区域保留覆盖与透明叠加顺序；同色不透明的相交面仍可在最多 15 个闭体的容量内合并 render。
  仅实际轮廓不交仍不足以合组：例如孔洞内另有独立面，仍须分开；完全重叠的异色/透明面仍需逐对象命令。
  轮廓判断只在静态构建时执行，改色/显隐不重复查询；高顶点、密集相交输入仍可能增加同步构建开销。
- 超过 65535 顶点的贴地面批次要求 uint element indices；不支持该能力的 Context 会在 GPU 分配前拒绝，
  SDK 可按空间区域构建较小批次。线沿用原生索引拆分。每 VA 命令可在多个 frustum 中执行，
  command 数不包含场景共用的深度复制、合成等开销。

可运行对照见 [平面图形合批](../../Test/平面图形合批.html)：同一组 1024 对象可切换普通面、贴地面、
贴地线，比较实际 Primitive/VA/颜色与模板命令数，并验证独立改色、显隐和拾取。
“交错双层叠面”展示 512 个独立双层栈：按下层、上层交错输入，合批后 render/pick 各两对命令，
可隐藏上层并拾取下层。分层包括暂时隐藏或透明的实例，后续按 ID 更新属性不破坏覆盖顺序。
“凹面共同空区”展示 512 对包围框交叠、共同区域均为空的透明凹面，render/pick 各一对命令，可独立改色和隐藏青色面。

完整决定见 [ADR-0168](Decisions/ADR-0168-planar-static-batching.md)。

## C7 普通体与面 Graphics

Public `SceneGISPlanarBoxGeometry`、`SceneGISPlanarCylinderGeometry`与
`SceneGISPlanarEllipsoidGeometry`接收finite meter-based center和各自positive dimensions，并生成以center为
origin的local DOUBLE volume mesh。Color 路径与closed、non-flat `PerInstanceColorAppearance`配对，材质路径使用 `MaterialAppearance`；wrapper仍在
construction时固定geometry kind。

Automatic Solid profile支持Box、Cylinder与full Ellipsoid。Entity.position表示center；`NONE`保留center Z，
clamp/relative先按C1 resolver解析anchor，再分别增加`dimensions.z / 2`、`length / 2`或`radii.z`。Entity
orientation是fixed planar quaternion，倾斜后不重新求terrain接触。Partial/inner Ellipsoid 仍会fail-fast；面材质扩展见下文 ADR-0178。

Plane、Ellipse与Rectangle由private Area adapter降级到public Polygon/Polyline。Plane使用完整Entity position、
orientation和local Plane equation，不支持HeightReference。Ellipse position只提供center X/Y，height/ref决定Z，
rotation从+Y逆时针；Rectangle coordinates按meters严格有序，rotation从+Y顺时针，defined granularity拒绝。
Ellipse/Rectangle的ordinary路径保留generated geometry：`NONE`允许合法anchor geometry延伸extent外；approved
ground CLAMP组合已迁移到C11 GPU area backend；不支持的RELATIVE、mixed或ground-relative extrusion在mutation前拒绝。

## C8 路径衍生 Geometry 与动态 Path

Public `SceneGISPlanarWallGeometry`以米制XY route、top/bottom heights生成open non-flat mesh；
`SceneGISPlanarPolylineVolumeGeometry`把居中的Cartesian2 shape沿route扫掠，shape +X表示route-left、+Y表示
world-up，并支持planar MITERED/BEVELED/ROUNDED corner。二者都使用local DOUBLE positions、finite normals与
standard synchronous Primitive。Wall配对open non-flat `PerInstanceColorAppearance`，PolylineVolume配对closed
non-flat appearance。

Corridor不新增public Geometry：centerline width/corner/end-cap确定生成simple Polygon，outline使用Polyline。
Positions Z不参与height；Corridor的批准CLAMP组合使用C11 GPU area backend。Wall top默认positions.z、bottom默认Z=0，
不读取terrain；defined Wall granularity拒绝。
PolylineVolume route position.z是center elevation，shape可以延伸extent外，也不隐式clamp。

Path复用Entity position与Cesium Property sampling，但只支持effective `ReferenceFrame.FIXED`、undefined或
`"FIXED"` relativeTo、`PathMode.WHOLE`。Resolution是positive seconds；availability与lead/trail决定当前采样窗口。
INERTIAL、entity-relative/VVLH和PORTIONS material fail-fast。Sample结果降级为public Polyline，任一sample outside
extent时当前Path隐藏，不clip。

## C11 GPU Surface Clamp 契约

Public `SceneGISPlanarGroundPrimitive`复用existing public Polyline或non-extruded Polygon Geometry，并要求live planar
World与compatible Color appearance；面另支持 MaterialAppearance。Clamp是implicit；不再接受public `heightReference`或
`extrudedHeightReference`，也不接受arbitrary modelMatrix、classification或zIndex。Ordinary NONE
内容继续使用`SceneGISPlanarPrimitive`。

Planar Surface先在existing `Pass.GLOBE`写入color/depth，ground随后在existing
`Pass.TERRAIN_CLASSIFICATION`执行。Area使用stable planar shadow volume与z-fail stencil-depth/color/pick；Polyline使用
stable segment volume和dedicated SceneGIS ground-line Shader。两者都不读取actual terrain triangles，不创建C9 snapshot，
也不随tile、LOD或revision重建Geometry/GPU resources。

Height envelope来自caller-owned World当前provider的同步global minimum/maximum；无provider使用围绕Z=0的非退化padding。
Provider attach/replace/detach只更新transform/bounds，不替换footprint VA/index/DrawCommand/Shader。该runtime不发terrain
request、不改变`tilesLoaded`，也不拥有World/provider。

Polyline `clampToGround:true`以及non-extruded Polygon、Ellipse、Rectangle、Corridor的批准CLAMP组合使用该runtime。
Surface RELATIVE、mixed top/bottom和任何ground-relative extrusion在child低层mutation前fail-fast。C9 actual-cover draper、
Surface ground snapshot与World late queue已删除，不存在fallback。完整决定见ADR-0023。

## C4 Entity 与 DataSource 自动集成

`CesiumWidget({ world })` 和 `Viewer({ world })` 只在 `world` 是 live `SceneGISPlanarWorld` 时安装
instance-local planar visualizer callback；其他 World、`globe:false` 与默认 Globe 继续使用 Cesium 默认
callback。`widget.entities`、`viewer.entities` 和显式加入 `dataSources` 的 `CustomDataSource` 属于
supported path；ADR-0172 另接纳显式绑定当前 World 的 `GeoJsonDataSource`。CZML/KML 不在支持范围。

第一次合法 update 先完整验证 World/Scene identity、`EntityCluster.enabled === false` 与所有 Entity 的
top-level Property profile，再原子追加 Anchor、Model、Polyline、Polygon、Solid、Area、Route、Path children；
children 从下一次 update开始执行。后续每帧 gate 仍先验证动态新增的内建属性。内建 Property 支持 `point`、
`billboard`、`label`、`model`、`polyline`、`polygon`、`box`、`cylinder`、`ellipsoid`、`plane`、`ellipse`、
`rectangle`、`corridor`、`wall`、`polylineVolume`、`path`、`position`、`orientation`、`description`、
`properties` 与 `viewFrom`；业务字段可使用
`Entity.properties` 或原生 `Entity.addProperty`。其他已定义的标准 Property 会在 child normal update 和低层资源 mutation 前抛
`DeveloperError`；同步 collection listener 可以先更新 CPU tracking。

Model、Polyline 与 Polygon 自动路径加入各 DataSource 的 caller-owned `_primitives` container，使
DataSource ordering、remove 与 destroy 沿用 `DataSourceDisplay` lifecycle；显式 private visualizer 构造仍
默认使用 `scene.primitives`。SceneGIS 只拥有自己加入的 primitive，不拥有 DataSource container、
EntityCluster、EntityCollection、Scene 或 World。Pick id 保持 original Entity，Viewer selection、InfoBox 与
`DataSourceDisplay.getBoundingSphere` 复用现有流程。

## GeoJSON / TopoJSON 加载

保留原生 `GeoJsonDataSource` 及 `load/process`，显式提供目标 World 和坐标转换：

```js
const projection = new Cesium.WebMercatorProjection();
const source = await Cesium.GeoJsonDataSource.load("data.geojson", {
  planar: {
    world: viewer.scene.world,
    projectCoordinates(coordinates, crs) {
      if (crs !== undefined) {
        throw new Error("Expected WGS84 GeoJSON without a CRS override.");
      }
      return projection.project(
        Cesium.Cartographic.fromDegrees(
          coordinates[0],
          coordinates[1],
          coordinates[2] ?? 0,
        ),
      );
    },
  },
  clampToGround: true,
});
await viewer.dataSources.add(source);
await viewer.zoomTo(source);
```

- 示例 World 必须使用相同 Web Mercator 米制坐标；引擎不根据 `world.coordinateSystem.crs` 猜测投影。
  对本地 XY GeoJSON，可显式用 `new Cartesian3(c[0], c[1], c[2] ?? 0)`。
  自定义 CRS metadata 会作为第二参数传入，由应用解释或拒绝；`crs:null` 保持 native no-op。
- 支持原生 Point / LineString / Polygon、multi、GeometryCollection、FeatureCollection、TopoJSON、
  simplestyle、属性和描述；返回值是原生 Entity，可继续修改 graphics、显隐和拾取。
- callback 返回有限 `Cartesian3`，可复用 scratch。转换只在加载时执行，不会逐帧重投影。
- 首次 `load/process` 确定坐标模式，后续省略 `planar` 自动继承 World 与 callback；不同 World、
  callback 或从 Globe 改为 planar 需要新建数据源，避免已有 Entity 混用坐标。
  样式和 `clampToGround` 仍是每次加载选项，不自动继承。
- 二维点/面在 clamp 开启时贴地；三维点/面保留绝对高度。线的 `clampToGround` 为 true 时忽略
  顶点 Z 贴合地表。线面均采用平面直线边；原有 hole、extent、graphics profile 限制继续有效。
- 未配置 `planar` 的原生数据源继续输出 ECEF，只用于 Globe；配置后的数据源只供绑定 World 使用。
  `show`、loading/error、credits、DataSource add/remove 与资源销毁复用 Cesium，不拥有 World。

本地可运行示例：[平面 GeoJSON](../../Test/平面GeoJSON.html)。
长期决定及上游集成边界见 [ADR-0172](Decisions/ADR-0172-planar-geojson-loading.md)。

## Compatibility matrix

完整、绑定Cesium `1.144`交付基线的逐类型与package inventory见
[PlanarContentCompatibility](PlanarContentCompatibility.md)。下表只保留高层导航。

| 数据或 graphics                                        | 当前决定                                             | 可用阶段/边界          |
| ------------------------------------------------------ | ---------------------------------------------------- | ---------------------- |
| `Entity`、Property/event、availability、show、metadata | 复用数据模型                                         | C4 automatic           |
| `EntityCollection`、`CustomDataSource`                 | 复用数据模型                                         | C4 automatic           |
| Point、Billboard、Label                                | private runtime                                      | C4 automatic           |
| 普通 glTF Model                                        | private runtime                                      | C4 automatic           |
| planar straight Polyline、Polygon                      | public Geometry/Primitive + private adapter          | C6 direct/C4 automatic |
| Box、Cylinder、Ellipsoid、Plane、Ellipse、Rectangle    | public volume/lowered area + private adapter         | C7 direct/C4 automatic |
| Corridor、Wall、PolylineVolume、Path                   | public lowering/Geometry + private adapter           | C8 direct/C4 automatic |
| `Cesium3DTilesetGraphics`                              | unsupported                                          | 独立扩展               |
| GeoJSON / TopoJSON 显式 planar 转换                    | 原生 loader + instance projection                    | ADR-0172               |
| CZML、KML 自动 planar 转换                             | unsupported                                          | 独立扩展               |
| Globe ground、geodesic/rhumb                           | 禁止隐式进入                                         | 不复用                 |
| tracking、`flyTo`、`zoomTo`                            | 复用原入口；支持明确的平面 Entity/DataSource profile | API integration I2/I3  |

C2/C3 使用 Anchor/Model/Polyline/Polygon graphic property allowlist，C4 的 gate 检查 Entity 内建 Property
allowlist；自定义业务属性不参与渲染校验。Planar path 替换而不是追加默认 Globe visualizers。

Polyline/Polygon 支持原生 `distanceDisplayCondition` 和动态 Property，在 ordinary/ground 下同时控制填充、
边线和 picking。条件缺省表示无限制；ready 后修改 near/far 不重建 geometry，添加或清除条件会重建属性布局。
距离依据 Cesium GeometryInstance 包围体近似判定，不是逐像素到相机的地形距离。

上述 tracking/framing 的当前边界见 [PlanarWorldGuide](PlanarWorldGuide.md)。原生 Entity 辅助方法不能仅因
Graphics 已能绘制而视为全部兼容：例如缺省 orientation 的 `Entity.computeModelMatrix` 仍构造球面 ENU，
而平面 visualizer 使用固定 world axes；显式指定固定轴 Quaternion 可避免该缺省朝向差异。

## C5 资格、性能与交付边界

首版以固定 moderate profile 验证 automatic path：256 Point、128 Billboard、128 Label、64 Polyline、
32 Polygon，以及独立的两个 repository-local glTF Model。资格协议包含20个 identical warm frames、五轮约
10%局部更新和三个 Widget/DataSource lifecycle cycles；它用于发现 O(N²)、重复GPU重建和ownership泄漏，
不是公开最大容量承诺。

Moderate-profile warm gate要求slot、Model、per-Entity owner、render context、DrawCommand和VertexArray
identity稳定。C6迁移后Polyline/Polygon由standard Primitive提供command/VA复用，不再依赖experimental Buffer
dirty range。C5另用小型三轮Point+Polyline fixture直接验证
DataSource remove后的listener/per-DataSource primitive container，以及Widget destroy后的ControllerHost/DOM
恢复baseline；它不把六类内容全部重建成lifecycle soak。show/availability、remove/re-add和async Model stale/
late settlement继续由已批准的C2 Anchor/Model与C4 automatic integration Specs提供契约证据，本轮product runtime
未修改且没有把这些既有cases冒充为C5 direct cases。单机 `DataSourceDisplay.update` 和 Scene render 的
median/P95只是调查证据，不是跨机器CI阈值。
当前qualification没有定位到可重复的SceneGIS private热点，因此C5不修改product runtime，也不引入跨Entity
batching、Worker或public batch API。

稳定人工示例位于`scenegis-planar-content` Sandcastle：它展示全部16类automatic Graphics、direct ordinary/
Ground Primitive、absolute/anchor-level/continuous-ground高度、original Entity selection、有限动态更新和代表性
`CustomDataSource`批量增删。公开imagery/terrain仅用于best-effort人工展示；自动E2E使用local deterministic
terrain并阻断公网。Installed-package smoke确认private content
runtime文件随engine tarball交付。自动生成的JS barrel按仓库soft-private规则可导出underscore symbol；该export是
不受支持的构建产物，不构成public API。对应non-underscore spelling不得成为runtime入口，underscore exact symbol
不得进入`.d.ts`或API HTML。

## Enforcement 与 ownership

### 原生 CZML

```js
const source = await Cesium.CzmlDataSource.load("vehicles.czml", {
  planar: { world: viewer.scene.world },
});
await viewer.dataSources.add(source);
await viewer.zoomTo(source);
viewer.trackedEntity = source.entities.getById("vehicle");
await source.process(nextPackets);
```

`cartesian` / `cartesianVelocity` 使用当前 World 米制 XYZ，无自动投影；`referenceFrame`
省略或 `"FIXED"`。采样插值、availability、document clock、load 替换、process 合并和删除
沿用 Cesium；显式 quaternion 按固定平面坐标轴解释。Path 复用既有 FIXED 采样和 lead/trail 窗口。
调用方用原生 `viewer.clock`、`clockTrackedDataSource`、timeline 控制播放。

第一次 load/process 固定实例坐标域；后续省略 `planar` 复用绑定，不能更换 World。
`load` 会替换 Entity 实例；若要继续跟随，应重新取得新 Entity 并设置 `trackedEntity`。
数据源不能用于其他 World 或 Globe；World 必须保持存活。经纬度位置、INERTIAL 系、
`orientation.velocityReference` 拒绝；后者的原生实现依赖椭球法线。
图形材质与字段继续遵守当前平面兼容性矩阵，不承诺任意 CZML 都可无修改用于平面。
本地示例为 `Test/平面CZML.html`，决策见 [ADR-0173](Decisions/ADR-0173-planar-czml-loading.md)。

### 通用边界

Automatic planar adapter 采用 instance-owned allowlist，不同时运行会消费相同 graphics 的默认 Globe
visualizer。已知 unsupported graphic 或 approved graphic 中未支持的配置必须在该 Entity 的资源
mutation 前抛 `DeveloperError`；不得 silent ignore、warning 后继续或 fallback 到 Globe path。

手工加入 `scene.primitives` 的 raw Cesium primitive 不属于 automatic Entity compatibility
enforcement，由应用负责其坐标、资源和销毁。C1 resolver 与 C2 visualizer 都是 private implementation
roles，不是 supported public API。C4 接入点由 `SGP-0001` 追踪；升级 Cesium 时必须复核
`DataSourceDisplay` callback、update snapshot、per-DataSource container 与 destroy ordering。

## 当前使用建议

- 在 live planar World 的 `widget.entities`、`viewer.entities` 或 `CustomDataSource.entities` 中使用已批准的
  Point/Billboard/Label/Model/Polyline/Polygon/Box/Cylinder/Ellipsoid/Plane/Ellipse/Rectangle/Corridor/Wall/
  PolylineVolume/Path profile。
- 业务 metadata 可放入 `Entity.properties`，也可沿用 `Entity.addProperty` 注册顶层业务属性。
- 平面 `RectangleGraphics.coordinates` 的四个 Rectangle 字段表示场景米制范围：使用
  `new Rectangle(minimumX, minimumY, maximumX, maximumY)`，不要使用 `Rectangle.fromDegrees` 或球面矩形运算。
  这是平面 adapter 的局部解释，不改原生 Rectangle 类，也不扩展 Camera 的 Rectangle 入口。
- 在应用边界保留 finite meter-based Cartesian3，并显式记录所使用的 planar CRS。
- 对需要确定 terrain 高度的离线或批处理流程，先使用显式 sampler，再写入 absolute position。
- 大量普通或贴地静态线面/体优先使用上面的公开 `geometryInstances` 入口。`CustomDataSource` 只组织生命周期，
  不会自动把现有逐 Entity 的线面/体合批；不要依赖 private visualizer、Buffer owner 或 underscore root export。
- 动态更新只修改实际变化的Property；需要百万级专题数据、跨Entity geometry merge或空间索引时，应建立独立
  扩展，而不是继续扩大首版Entity compatibility adapter。
- 不要使用 `Scene.getHeight/updateHeight`、`scene.pickPosition` 或 `world.pickTerrain` 替代 Entity
  HeightReference；它们的数据来源和生命周期不同。

## 几何阴影

R1 / [ADR-0083](Decisions/ADR-0083-planar-cascaded-shadows.md) 扩宽 C2–C8 的历史阴影限制。
ModelGraphics.shadows 默认 ENABLED，其余具有原生 shadows 字段的普通 Graphics 默认 DISABLED。
Solid、Area、Route、Polyline、Polygon 和 Model 的动态 ShadowMode 更新传递至现有 primitive，
不改变 caller Property，不因阴影开关重建几何。SceneGISPlanarPrimitive.shadows 同样沿用该 enum。
全局开启使用 Viewer.shadows，地形使用 Viewer.terrainShadows / world.shadows。
连续 ground classification 覆盖并非 caster mesh，本次不赋予额外阴影能力。

## 平面面材质（ADR-0178）

普通非线图元与贴地 Polygon 支持原生 `MaterialAppearance` / `Material` / Fabric：
Image、Checkerboard 等内建材质和自定义 Fabric 均沿用原生纹理与 uniform 生命周期。
每批共享一种材质；多材质请分批。材质不自动乘 per-instance color，独立 show/id/pick 保持。
直接传入的 Material 由调用方拥有，在移除 Primitive 后销毁；Entity adapter 自行创建的 Material 则自行释放。

```js
const material = Cesium.Material.fromType("Image", { image: canvas });
const primitive = new Cesium.SceneGISPlanarPrimitive({
  geometry: new Cesium.SceneGISPlanarPolygonGeometry({
    positions,
    stRotation: Math.PI / 4,
  }),
  appearance: new Cesium.MaterialAppearance({ material, flat: true }),
  id: "image-area",
});
scene.primitives.add(primitive);
// Material uniforms can change without rebuilding geometry.
material.uniforms.repeat = new Cesium.Cartesian2(2, 2);
```

普通 Polygon/Wall/PolylineVolume 采用逐三角面主轴 bbox UV；跨主轴存在接缝，
并非沿线连续展开。Box/Cylinder/Ellipsoid 复用原生 UV；按 vertexFormat 生成 normal/st/TBN。
Polygon 的 stRotation 围绕 UV 中心旋转，Entity 的 Polygon/Ellipse/Rectangle 同样可用。

贴地 UV 从真实表面深度和 XY extent 重建，先裁剪再旋转。MaterialAppearance 的
Material/flat/faceForward 被接纳，外层自定义 Shader 不接入。
空间相交对象保留覆盖顺序及透明叠加；互不冲突对象可合批。
贴地面 Fabric 使用 material.alpha 表达透明，禁止 discard；拾取始终以足迹判断（含透明像素）。

Polygon/Plane/Ellipse/Rectangle/Box/Cylinder/Ellipsoid/Wall/PolylineVolume/Corridor
的 Entity material 接受原生 MaterialProperty，例如 ImageMaterialProperty 和 CheckerboardMaterialProperty。
自定义 MaterialProperty 遵守原生 getType/getValue 与 Fabric 类型注册约定；同类型 uniform 更新复用几何，
类型切换构建候选 owner。实体与地表仍采用当前 World 的米制坐标。Polyline 的扩展见下节；Path 和 Polygon outline 的属性入口保持原边界。

Image 含 alpha 时，直接 Fabric 需按原生 Material 契约声明 translucency；
Entity 可使用 ImageMaterialProperty({ image, transparent: true })。
显式 textureCoordinates、连续路径 UV 展开以及 Model CustomShader 不在本轮范围。

本地验收入口：`Test/平面材质.html`，包括地形、低倾角、动态 Entity 材质与 128 对象批。

## 平面折线材质（ADR-0182）

`SceneGISPlanarPrimitive` 与 `SceneGISPlanarGroundPrimitive` 的折线接受原生
`PolylineMaterialAppearance({ material })`。支持 Color、PolylineArrow、PolylineDash，
以及只依赖 `materialInput.st` 和 uniforms 的自定义 Fabric。直接传入的 Material
由调用方管理；每批共享一种材质，不自动乘实例 color。需要逐实例颜色继续使用
`PolylineColorAppearance`。每个实例的 show、distanceDisplayCondition 和 id 保留。

```js
const material = Cesium.Material.fromType("PolylineDash", {
  color: Cesium.Color.CYAN,
  gapColor: Cesium.Color.TRANSPARENT,
  dashLength: 24,
});
const line = new Cesium.SceneGISPlanarGroundPrimitive({
  world,
  geometry: new Cesium.SceneGISPlanarPolylineGeometry({ positions, width: 12 }),
  appearance: new Cesium.PolylineMaterialAppearance({ material }),
  id: "route",
});
scene.primitives.add(line);
// Uniform updates keep geometry and VA; caller releases material after removing line.
material.uniforms.color.alpha = 0.5;
```

普通线的 s 来自源 XYZ 累计长度 / 总长度，贴地线使用 XY 长度（忽略源 Z）；
每实例独立从 0 到 1。普通线沿原生屏幕扩展网格插值，折角附近不承诺每个像素对应
精确世界弧长；贴地线按深度重建点至 miter 端面的距离插值。t 为沿行进方向的右 0、
左 1。重复首点形成闭合 miter 和唯一的 1→0 接缝，周期纹理应在该处一致；Arrow
在闭合终点结束。width 保留已有像素宽度含义及地形投影方式。地形 LOD、相机和
modelMatrix 不重算源长度参数，修改 positions 时重新计算。

原生 Dash 的周期/相位基于屏幕像素和量化方向，不是世界米制的沿线 s。
贴地线支持原生 Dash 的 discard；透明/丢弃像素不可拾取。这与贴地面的足迹拾取不同。
外层自定义 Shader、依赖任意 varying 或 TBN 光照的 Fabric 不属于贴地线契约。

原生 `PolylineGraphics.material` 接受 `PolylineArrowMaterialProperty`、
`PolylineDashMaterialProperty` 和遵循原生 getType/getValue 的自定义 MaterialProperty。
同类型每次 Visualizer.update 都读取属性并修改 uniforms，Viewer clock 冻结亦然；
类型变化替换必要外观，positions/width 变化替换几何。移除/销毁/候选失败释放派生 Material，
不销毁调用方 MaterialProperty。自定义 Fabric 类型先通过原生 Material 构造注册。

秒制动画在 MaterialProperty.getValue 中使用
`JulianDate.secondsDifference(time, epoch)`，引擎不隐式注入 time/frameNumber。
冻结 Viewer clock 会冻结此动画，但外部颜色等非恒定属性仍会读取。
本地例子 `Test/平面折线材质.html` 演示 Entity、Primitive、起伏地形、闭合边界、
颜色/透明度/效果切换、位置修改、拾取和重复增删。
