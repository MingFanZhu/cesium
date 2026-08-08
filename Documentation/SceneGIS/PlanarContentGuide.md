# SceneGIS 平面内容使用指南

本文档描述 `planar-content` 的稳定坐标、高度和兼容性边界。C1 已完成 position contract，C2/C3 提供
private Anchor/Model/Polyline/Polygon visualizer，C4 已把这些角色以 instance-owned callback 接入
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

C2 的 private Model visualizer 已实现这项语义，但未增加 public transform helper。

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

Model 固定 `heightReference=NONE`、`enableVerticalExaggeration=false`、`shadows=DISABLED`、dynamic
environment map disabled，并启用 picking。C2 拒绝 vertical exaggeration、shadow、environment map、
clipping planes 与 custom shader 配置；支持的普通 style/animation/property profile以 ADR-0014 为准。
C2 private visualizer 不拥有 World、Scene、EntityCollection、EntityCluster 或输入 Resource。

## C3 Polyline 与 Polygon profile

Polyline 使用 planar straight segments；`arcType` undefined等价于`ArcType.NONE`，显式值也只接受
`NONE`。Absolute与`CLAMP_TO_GROUND`都逐个解析 supplied vertices；clamp只读取当前resident terrain，
不发请求、不沿长边新增terrain采样或细分；线段内部仍按几何线性插值。支持solid
`ColorMaterialProperty`、`[0,255]` integer width、show、availability、dynamic positions、extent、
original Entity picking与world bounds。

Polygon接受一个simple outer ring和direct holes；不接受nested hierarchy、自交、ring touch或hole overlap。
Scalar top支持`NONE`、`CLAMP_TO_GROUND`和`RELATIVE_TO_GROUND`，per-position height保留各顶点absolute Z。
Extrusion显式生成top/bottom caps、outer/hole side walls，outline单独渲染且`outlineWidth`只接受
`[0,255]`内的integer。Terrain sampling只发生在supplied vertices，因此长边和大三角形可能穿越中间
terrain，这不是连续贴地承诺。

两类visualizer都使用per-Entity private Buffer owner：顶点以local DOUBLE geometry保存，world translation
进入`modelMatrix`，bounds显式保留world坐标，pick id保留original Entity。拓扑或blend变化使用candidate/
current原子替换；warm更新复用owner与collection；replacement、removal与destroy成对释放。它们不跨Entity
batch，也不拥有World、Scene或EntityCollection。未变化warm update不会重写Buffer geometry/material/show，
因此不会重新标脏或触发buffer copy。

## C4 Entity 与 DataSource 自动集成

`CesiumWidget({ world })` 和 `Viewer({ world })` 只在 `world` 是 live `SceneGISPlanarWorld` 时安装
instance-local planar visualizer callback；其他 World、`globe:false` 与默认 Globe 继续使用 Cesium 默认
callback。Planar callback 只接受 `CustomDataSource`，因此 `widget.entities`、`viewer.entities` 和显式加入
`dataSources` 的 `CustomDataSource` 属于 supported path，GeoJSON/CZML/KML 等 DataSource 不属于本阶段。

第一次合法 update 先完整验证 World/Scene identity、`EntityCluster.enabled === false` 与所有 Entity 的
top-level Property profile，再原子追加 Anchor、Model、Polyline、Polygon children；children 从下一次 update
开始执行。后续每帧 gate 仍先验证动态新增属性。Top-level 只允许 `point`、`billboard`、`label`、`model`、
`polyline`、`polygon`、`position`、`orientation`、`description`、`properties` 与 `viewFrom`；业务字段必须放入
`Entity.properties`。其他已定义 standard/custom property 会在 child normal update 和低层资源 mutation 前抛
`DeveloperError`；同步 collection listener 可以先更新 CPU tracking。

Model、Polyline 与 Polygon 自动路径加入各 DataSource 的 caller-owned `_primitives` container，使
DataSource ordering、remove 与 destroy 沿用 `DataSourceDisplay` lifecycle；显式 private visualizer 构造仍
默认使用 `scene.primitives`。SceneGIS 只拥有自己加入的 primitive，不拥有 DataSource container、
EntityCluster、EntityCollection、Scene 或 World。Pick id 保持 original Entity，Viewer selection、InfoBox 与
`DataSourceDisplay.getBoundingSphere` 复用现有流程。

## Compatibility matrix

| 数据或 graphics                                                           | 当前决定        | 可用阶段/边界 |
| ------------------------------------------------------------------------- | --------------- | ------------- |
| `Entity`、Property/event、availability、show、metadata                    | 复用数据模型    | C4 automatic  |
| `EntityCollection`、`CustomDataSource`                                    | 复用数据模型    | C4 automatic  |
| Point、Billboard、Label                                                   | private runtime | C4 automatic  |
| 普通 glTF Model                                                           | private runtime | C4 automatic  |
| planar straight Polyline、Polygon                                         | private runtime | C4 automatic  |
| Box、Corridor、Cylinder、Ellipse、Ellipsoid、Plane、Rectangle、Wall、Path | unsupported     | 首版不实现    |
| `Cesium3DTilesetGraphics`                                                 | unsupported     | 独立扩展      |
| GeoJSON、CZML、KML 自动 planar 转换                                       | unsupported     | 独立扩展      |
| Globe ground、geodesic/rhumb                                              | 禁止隐式进入    | 不复用        |
| tracking、`flyTo`、`zoomTo`                                               | unsupported     | 不改变        |

C2/C3 固定 Anchor/Model/Polyline/Polygon graphic property allowlist，C4 的 gate 固定 Entity top-level
allowlist。Planar path 替换而不是追加默认 Globe visualizers。

## Enforcement 与 ownership

Automatic planar adapter 采用 instance-owned allowlist，不同时运行会消费相同 graphics 的默认 Globe
visualizer。已知 unsupported graphic 或 approved graphic 中未支持的配置必须在该 Entity 的资源
mutation 前抛 `DeveloperError`；不得 silent ignore、warning 后继续或 fallback 到 Globe path。

手工加入 `scene.primitives` 的 raw Cesium primitive 不属于 automatic Entity compatibility
enforcement，由应用负责其坐标、资源和销毁。C1 resolver 与 C2 visualizer 都是 private implementation
roles，不是 supported public API。C4 接入点由 `SGP-0001` 追踪；升级 Cesium 时必须复核
`DataSourceDisplay` callback、update snapshot、per-DataSource container 与 destroy ordering。

## 当前使用建议

- 在 live planar World 的 `widget.entities`、`viewer.entities` 或 `CustomDataSource.entities` 中使用已批准的
  Point/Billboard/Label/Model/Polyline/Polygon profile。
- 将业务 metadata 放入 `Entity.properties`，不要注册新的 top-level Entity property。
- 在应用边界保留 finite meter-based Cartesian3，并显式记录所使用的 planar CRS。
- 对需要确定 terrain 高度的离线或批处理流程，先使用显式 sampler，再写入 absolute position。
- 不要使用 `Scene.getHeight/updateHeight`、`scene.pickPosition` 或 `world.pickTerrain` 替代 Entity
  HeightReference；它们的数据来源和生命周期不同。
