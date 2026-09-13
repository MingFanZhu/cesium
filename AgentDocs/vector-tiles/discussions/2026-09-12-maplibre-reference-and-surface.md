# Discussion: MapLibre 任意坐标系参考与地形共存

## Metadata

- Status: `resolved`
- Owner role: `architecture`
- Created: `2026-09-12`
- Updated: `2026-09-13`
- Related plan: [Extension plan](../plans/2026-09-12-vector-tiles-extension.md)
- Related discussion: [实现边界](2026-09-12-rendering-boundaries.md)
- Resulting ADR: [ADR-0057](../../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)
- Related SGP: None

## Reference provenance

用户指定已有 `maplibre-gl-js-5.24.0` 任意坐标系开发仓库。参考的是用户 fork 当前工作树，
基于 `master / 5153ca2dbacd67677460acfb7e8ea01565a7a424`；
该仓库有已提交扩展，也有未提交修改，不能把目录版本名当作干净官方 release。
本轮只读，没有切分支、修改、格式化、安装依赖或运行该仓库的构建测试。

下文 source paths 均相对该参考仓库；不在 AgentDocs 保存本机绝对路径。
未来实际采用代码片段/依赖时，要另行固定来源版本、变更状态和许可证，并遵守 SceneGIS 分层及交付审计。
此前尝试取得官方 release 参考遇到 Git HTTPS blob 下载错误，未作为完整官方源码证据；
用户随后提供的本地实现是本次主要参考。

## Current source facts

| 路径 / 符号                                                               | 当前实现                                                                                                          | 可借鉴边界                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/geo/planar_coordinate_system.ts` / `PlanarCoordinateSystem`          | 用户坐标 bounds/axis ↔ canonical `[0,1]^2` world，完全不需要经纬度                                                | CRS mapping 与 tile topology 分开                                                  |
| `src/tile/tile_matrix_set.ts` / `matrixSize`、`tileWorldBounds`、`urlRow` | 单 root；`2 ** z`；tile extent 由整数索引算；TMS 只转换 URL row                                                   | 与 SceneGIS 已有单 root 数学一致，不必新增多 root/任意矩阵协议                     |
| `src/source/vector_tile_worker_source.ts` / `loadVectorTile`              | MVT 使用 `new VectorTile(new Protobuf(rawData))`；解码不读取 planar CRS                                           | 独立格式前端，不需要 Cesium decoder；库能力仍需独立核验                            |
| `src/data/load_geometry.ts` / `loadGeometry`                              | 按 `EXTENT / feature.extent` 归一化 geometry，之后进入渲染 buffer；有其自身整数范围限制                           | 解码和 GPU packing 是两层；SceneGIS 不照搬该 clamp/位宽限制                        |
| `src/geo/projection/planar_transform.ts` / `calculatePosMatrix`           | 使用 canonical tile ID，调用 tile-to-clip math，矩阵有 Float64/Float32 表达；拒绝 wrap                            | geometry 不以 geographic conversion 为前提，overscaledZ 与 canonical geometry 分离 |
| 同文件 / `getProjectionData`                                              | ordinary tile matrix 与 terrain RTT matrix 分支；共享 shader 中保留中立 alias                                     | 相同 geometry 可以换 render target/matrix，无须重写 MVT parser                     |
| `src/render/painter.ts` / `render`                                        | 无 RTT 时 ordinary opaque/translucent passes；translucent loop 先让 RTT 处理可贴附 layers，其余正常绘制           | flat 与 terrain 路径有明确调度入口                                                 |
| `src/webgl/render_to_texture.ts` / `renderLayer`                          | 收集可贴附 layer stacks，按 terrain tile 绘入 FBO，再调用 `drawTerrain`；使用有界 RenderPool 和 cache fingerprint | 地表地图可以先合成纹理，而不要求每条矢量 geometry 自身成为 terrain mesh            |
| `src/webgl/draw/draw_terrain.ts` / `drawTerrain`                          | 获取 RTT texture 和实际 terrain mesh，绑定纹理并绘制 terrain                                                      | 地形给出位置/深度，地图给出颜色，两者职责不同                                      |

`LAYERS_TO_TEXTURES` 包含 background/fill/line/raster/hillshade/color-relief，
circle/symbol 不在该表中。当前代码按非 RTT layer 分隔 stacks，
不能简单推断所有 style layers 被烘焙到一张纹理。

用户的 `test/examples/display-planar-raster-and-vector-tiles.html` 组合本地 raster 与 MVT buildings，
配置 NJ08 bounds 和 tileMatrixSet，同一 geometry 展示 fill、line 与 fill-extrusion。
本轮只读页面组装，没有验证相关数据文件可用或实际画面。

### V3C0 测试页面与公开数据复查

负责人要求改用参考项目的公开数据路线，已只读复查以下 HTML；未修改或启动参考项目：

- `test/examples/display-a-map.html` 与 `display-a-globe-with-a-vector-map.html`：
  使用 `https://demotiles.maplibre.org/style.json`，主要是 countries/geolines 世界地图，
  适合基础地图演示，不作为本轮密集街区基线。
- `test/examples/display-buildings-in-3d.html` 与 `add-a-vector-tile-source.html`：
  基础样式为 `https://tiles.openfreemap.org/styles/bright`；
  前者另接 `https://tiles.openfreemap.org/planet` 并显示 building extrusion。
- `debug/planar-nj08-vector.html` 与前述 planar raster/vector 页面：
  NJ08 单根矩阵，本地 `debug/data/buildings/{z}/{x}/{y}.pbf`，属于自定义 CRS 参考；
  本轮不搬运其数据或将 NJ08 数值冒充 EPSG:3857。

据此 [V3C0](../plans/2026-09-13-v3c0-public-map-and-style-baseline.md) 默认改用
OpenFreeMap / Bright，保留 Liberty 对照，移除 Mapbox token 入口。
只复用数据/样式来源，仍由 SceneGIS 独立 decoder 与自有图元直接渲染。
Bright 93/119 层通过当前前端，25 symbol 与 1 fill-translate 层显式列为待实现；
参考示例的 3D building 不代表本扩展已支持 extrusion。

### SceneGIS 应保留自己的契约

- 用户 fork 支持可选 axis direction；SceneGIS 保持 fixed X east/Y north/Z up，不引入轴配置。
- 用户 fork 的 bounds span 用 relative tolerance 检查；SceneGIS `SceneGISPlanarCoordinateSystem`
  使用严格 square extent，不复制该容差或静默修正输入。
- MapLibre normalized world 适合其相机/renderer；SceneGIS public coordinates 保留完整米制世界值，
  归一化只用于内部 tile-local 表达，不能改写现有 Camera/terrain/content 的坐标语义。
- Source 与 World 先用匹配的单根 matrix。3857 是首轮验收配置，不是 MVT parser 的硬编码投影。

## 底板与地形冲突的准确位置

MVT 不包含地形表面。若把解码后的 polygons/lines 全部生成 `Z=0` 平面 mesh，
又独立绘制有起伏的 terrain，那么它们会互相穿插/遮挡；固定加高也不能保证连续贴附。
这个冲突在 geometry-to-surface 映射，既不在 PBF 解码，也不在 tile matrix 本身。

但 MapLibre/Mapbox 并非只能直接绘制平面 geometry：
上述参考源码有 RTT 地形路径；Mapbox 官方还明确说明 terrain/globe draping 会影响 layer order，
被贴附的 fill/line 等会批量处理，并可能排在 symbol/circle 之下。
参见 [Mapbox terrain/globe 层序说明](https://docs.mapbox.com/help/troubleshooting/layer-rendering-order/)。

所以不能把 Cesium experimental MVT 的所有问题归因于“要与地形共存”。它的整树初始化、
丢失 ID 和兼容样式缺口是独立问题；terrain integration 则是需要单独选取表示方法的问题。

## Options and tradeoffs

| 方案                        | 几何/颜色如何产生                                    | 主要收益                                                          | 必须解决的成本                                                        |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Flat geometry               | 同一 root plane 上直接绘制 vector batches            | 第一轮样式、线型、layer order 易对照，保持几何 pick               | 不代表已支持起伏地形                                                  |
| Surface texture composition | batches 先画颜色纹理，再由 Planar/Globe surface 取样 | 复用样式/triangulation；地形保留唯一几何/深度；适合底图 fill/line | texture density、重绘失效、alpha/层序、cache/上传预算、查询索引       |
| Batch depth/stencil         | 用 footprint/volume 对实际 surface depth 分类        | 无需先栅格化颜色，能贴合可见 surface                              | 重叠、stroke/dash/pattern、layer order、stencil/pick 粒度复杂         |
| Geometry displacement/drape | 细分 vector geometry 并映射高程                      | 可成为真实 3D geometry                                            | 面细分、地形 LOD 同步、孔洞/裂缝与资源失效；需要独立 terrain 数据契约 |

项目负责人明确优先矢量直接贴地，主路线不采用地图颜色 RTT。
RTT 可以保留原始 feature 与重新样式化能力，但地图先受中间纹理分辨率约束；
屏幕像素线宽、近距离缩放、样式响应和 feature query 还要额外处理。
用户要求保留的矢量价值应体现在这些可验收行为中，而不只在 CPU 缓存的数据类型中。

### 现有 SceneGIS 直接贴地的实际证据

以下路径相对 SceneGIS 仓库：

- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundCommands.js` 的
  `createSceneGISPlanarGroundCommands` 为每个 source command 紧邻提交 stencil-depth 与 color/pick。
  z-fail 写 classification mask，color/pick 消费后清零；不写 surface depth，
  因而 `pickPosition` 继续以地表深度为依据。
- `packages/engine/Source/Shaders/SceneGIS/PlanarGround/SceneGISPlanarGroundLineVS.glsl`
  从 previous/current/next route 求 miter，以 `czm_metersPerPixel` 展开 stable volume，
  用 `u_sceneGISGroundLineWidth` 控制宽度。这是现有实现的宽度机制，
  不能据此宣称任意坡度/pitch 下已经满足 Mapbox pixel width 语义。
- LineFS 与 AreaFS 当前都是简单 vertex color、gamma/premultiplied alpha 与 depth clamp。
  它们没有完整 dash/cap/join/沿线距离/抗锯齿样式解释器，也不读取 terrain height texture。
  贴附来自 volume 与实际 depth/stencil 分类，不是提前合成地图颜色。
- 已批准 [ADR-0023](../../../Documentation/SceneGIS/Decisions/ADR-0023-planar-depth-stencil-ground-rendering.md)
  规定稳定 footprint 不随 terrain LOD 重建，且 public GroundPrimitive 保持 single logical instance。

**地图 batching 尚未成立**：当前 stencil mask 表示覆盖，不记录任意 feature 身份。
从上述“先累计、再着色并清零”的执行方式推断，把不同颜色或相互重叠的 features
直接塞进同一 stencil 批次，不能自动保留各自颜色、透明叠加次数和 pick 归属。
需要专门证明 batch 粒度、重叠处理与层序；不能靠逐 feature 双命令实现冒充地图级 batching。
这是待验证风险，尚未编写新 batch 或以 WebGL 复现其所有失败组合。

## Recommendation

先把共享的 `MVT → feature data → style/layout → tile batches` 做成独立能力，
首轮以 **flat geometry** 验收；直接贴地是优先支持目标。
先前 surface texture composition 的推荐已被当前产品选择取代，保留上文作为参考比较。

优先验证 **stable vector volume + depth/stencil 地表着色**，它保留直接颜色/要素绘制，
也与现有平面 ground 的稳定 footprint 思路一致。但不提前批准现有 single-instance 后端作为新地图后端。
V2 在 flat 闭环之外加入最小 ground 可行性验证，先检查：

1. 有孔面与重叠不同颜色/alpha features 的覆盖、层序及逐要素 pick；
2. 线的 pixel width、casing、join/cap 与选定 dash 在坡度、倾斜视角下的实际画面；
3. terrain LOD/provider 改变时的连续贴合，以及 command 数和 geometry 资源是否保持合理规模。

这些证据决定 ground 的 batch 表达，不把困难留到完整地图实现结束后再处理。
生产 ground 能力仍在 V4 单独实现与验收；V2 不提前完成全部 terrain/样式组合。
若 stencil 路径不满足明确契约，再比较有实际依据的直接几何方案并记录架构决定；
不自动改成颜色 RTT，也不恢复现有 GroundPrimitive 已删除的 CPU draper。

直接生成贴地 mesh 需要处理边中间跨山脊、面内起伏与 terrain LOD，
只采样原始 MVT 顶点并不能保证连续贴合。GPU 位移也需要足够细分、与实际 terrain
插值一致的高程来源及接缝协议；它不因“放到 GPU”而消除这些条件。

flat 与 ground 可共享前端和适用的批量数据，GPU 几何表达可以不同；
Globe 同样复用前端，在 G1 另外处理曲率、覆盖体和深度语义。
不复制 MapLibre 的整套 Painter/Context，不依赖 Cesium experimental MVT，
也不改变既有 GroundPrimitive/Surface public contract 来绕过本扩展的架构审议。

## Decision and phase assignments

用户同意按当前计划推进。V2 先 flat 并验证直接贴地可行性，V4 完成生产地形，V5 完成约定标注；
M1 是完整平面目标。颜色 RTT 不作为主路线，具体 ground 算法由 V2 证据确定。
地表层序、circle/symbol 与普通 3D 遮挡、可见要素 pick 在 V2 明确；
样式/字体具体 profile 按所属 phase 冻结。稳定边界已提升 ADR-0057。

## Verification

本轮使用代码图谱发现和 trace，并用当前文件复核；图谱中的部分 Planar method 行号已经过时，
没有把截错范围的 snippet 当作当前源码。参考仓库未发生本 Agent 修改。
没有运行其测试、dev server 或 GPU 验收；此记录属于架构证据，不是渲染效果保证。
