# SceneGIS 平面内容使用指南

本文档描述 `planar-content` 的稳定坐标、高度和兼容性边界。C1 已完成 position contract，C2 已提供
显式构造的 private Anchor/Model visualizer；它仍不表示 `viewer.entities`、Polyline 或 Polygon 已可
自动按平面语义渲染。

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

## Compatibility matrix

| 数据或 graphics                                                           | 当前决定        | 可用阶段/边界    |
| ------------------------------------------------------------------------- | --------------- | ---------------- |
| `Entity`、Property/event、availability、show、metadata                    | 复用数据模型    | C4 集成          |
| `EntityCollection`、`CustomDataSource`                                    | 复用数据模型    | C4               |
| Point、Billboard、Label                                                   | private runtime | C2 explicit only |
| 普通 glTF Model                                                           | private runtime | C2 explicit only |
| planar straight Polyline、Polygon                                         | approved scope  | C3 planned       |
| Box、Corridor、Cylinder、Ellipse、Ellipsoid、Plane、Rectangle、Wall、Path | unsupported     | 首版不实现       |
| `Cesium3DTilesetGraphics`                                                 | unsupported     | 独立扩展         |
| GeoJSON、CZML、KML 自动 planar 转换                                       | unsupported     | 独立扩展         |
| Globe ground、geodesic/rhumb                                              | 禁止隐式进入    | 不复用           |
| tracking、`flyTo`、`zoomTo`                                               | unsupported     | 不改变           |

C2 已固定 Anchor/Model graphic property allowlist；C3 仍独立处理线面。C4 才负责 Entity/DataSource/
Viewer 的 instance-owned 自动集成。当前不能使用默认 Globe visualizers 或直接使用
`viewer.entities` 绕过这些阶段边界。

## Enforcement 与 ownership

未来 automatic planar adapter 必须采用 allowlist，并避免同时运行会消费相同 graphics 的默认 Globe
visualizer。已知 unsupported graphic 或 approved graphic 中未支持的配置必须在该 Entity 的资源
mutation 前抛 `DeveloperError`；不得 silent ignore、warning 后继续或 fallback 到 Globe path。

手工加入 `scene.primitives` 的 raw Cesium primitive 不属于 automatic Entity compatibility
enforcement，由应用负责其坐标、资源和销毁。C1 resolver 与 C2 visualizer 都是 private implementation
roles，不是 supported public API。

## 当前使用建议

- 可以把本指南作为后续 C2-C4 的数据准备契约，但不要宣称 Entity 已自动显示。
- 在应用边界保留 finite meter-based Cartesian3，并显式记录所使用的 planar CRS。
- 对需要确定 terrain 高度的离线或批处理流程，先使用显式 sampler，再写入 absolute position。
- 不要使用 `Scene.getHeight/updateHeight`、`scene.pickPosition` 或 `world.pickTerrain` 替代 Entity
  HeightReference；它们的数据来源和生命周期不同。
