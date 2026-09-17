# Discussion: 矢量瓦片实现边界

## Metadata

- Status: `resolved`
- Owner role: `architecture`
- Created: `2026-09-12`
- Updated: `2026-09-12`
- Related plan: [Extension plan](../plans/2026-09-12-vector-tiles-extension.md)、
  [V0](../plans/2026-09-12-v0-architecture-audit.md)
- Related audit: [Cesium/Planar 审计](2026-09-12-cesium-mvt-and-planar-audit.md)
- Resulting ADR: [ADR-0057](../../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)
- Related SGP: None

## Question and confirmed requirements

怎样在当前 Cesium 上建立类似 Mapbox 的矢量地图，同时保证真正的平面坐标、可扩展批量渲染和 Globe 复用？

已确认：独立 `vector-tiles` 扩展；基于当前 develop 新建大阶段分支；
先架构讨论后实现；首轮平面验收；当前 Agent 可以后续编码；人工页面使用 `Test/**`。
用户已明确没有必须兼容的服务、style.json 或效果参考，因此采用本地确定性数据定义验收。
用户进一步确认：完全不依赖 Cesium 实验性 MVT 支持，自行设计；MVT 解析 CRS 无关，
tile matrix 只考虑 `1×1` root，先用 3857；可以参考用户提供的 MapLibre 任意坐标系实现。
用户进一步明确优先保留矢量直接绘制并贴地，不以地图颜色纹理合成作为主路线。
用户随后批准按当前计划推进；样式采用版本化子集，具体算法在 V2 验证，生产贴地/标注由 V4/V5 完成。

## Current source facts

详见审计：native provider 存在完整基础链路，但整树初始化、丢失原生 identity、
ECEF 坐标与 Globe ground 依赖、Cesium3DTileStyle 和无 symbol placement 均限制整体复用。
Planar 有 ordinary/GPU ground/pools，但 public wrapper 固定 single instance。

## Options

| 方案                                     | 优点                                 | 主要代价                                        | 初步结论                       |
| ---------------------------------------- | ------------------------------------ | ----------------------------------------------- | ------------------------------ |
| 改造现有 native MVT provider             | 复用 3D Tiles、GLB 和 Buffer 管线    | 球面耦合、格式往返、样式/调度与目标差距大       | 用户已排除依赖                 |
| MVT 转 Entity/现有 planar wrapper        | 易验证小样本坐标和画面               | 逐对象 ownership；样式/标注仍缺；规模上限不合适 | 仅可作为少量参考对象           |
| 独立 vector runtime + 通用 Renderer 能力 | 可明确 source/style/batch/world 边界 | 需要专门设计批量、层序、ground、symbols         | 独立方向已确认，具体后端待设计 |
| 地表地图先合成颜色纹理                   | 地形贴合与 surface compositing 自然  | 缩放清晰度、重绘、pick 和屏幕标注另建链路       | 只保留参考，不作为主路线       |

## MVT 与服务兼容

建议以 **MVT 2.1** 为数据基线，形成明确 conformance matrix：

- 多 source-layer、每 layer 自身 extent、Point/MultiPoint、Line/MultiLine、Polygon/MultiPolygon、
  outer/hole、tile buffer、所有标准 scalar property 类型。
- 保留原生 feature id；业务 identity 至少区分 source 与 source-layer，GPU index 是另一个局部编号。
  缺少 ID 时使用 tile-local identity，不保证任意相邻 tile 同一个对象能被识别为同一业务 feature。
- 超过 JS safe integer 的 64-bit 值不能静默转 Number；建议公共 identity 使用无损 string，
  原始属性和样式输入转换分别定义，算术不隐式接受不能精确表示的值。
- 不把任意 buffer geometry 直接 clamp 到 `[0,extent]`；解码保留原坐标，
  几何裁剪与最终覆盖由 renderer 按线端、halo 和 alpha 语义处理。
- 明确版本、畸形 payload 和不支持 geometry 的策略；不把坏 tile 当作空 tile。
  旧 MVT 1.x 不在未经测试时宣称兼容。
- 首轮 source 接受普通 URL template；TileJSON 属同一 source 前端的后续已选范围。
  XYZ/TMS 只改变 URL Y 编号，不再次翻转 tile-local 几何。
- 204/404、合法空瓦片、网络失败、取消和 malformed 是不同状态；具体服务错误策略在 V1 冻结。
  不从文件后缀猜 gzip，不重复处理浏览器已解压的 Content-Encoding。

规范依据：[MVT 2.1](https://github.com/mapbox/vector-tile-spec/blob/master/2.1/README.md)；
服务配置依据：[Mapbox vector source](https://docs.mapbox.com/style-spec/reference/sources/)。
PBF 格式、TileJSON、style source、OpenMapTiles 等数据 schema 兼容应分别声明。

**解码器选择待 V1 定案**：在独立实现范围内审计成熟 PBF/MVT 基础库或自有解码模块，
尤其核查 uint64、畸形几何与 Worker 数据所有权；不因参考库已有实现而自动承诺完整 conformance。
Cesium `decodeMVT`、MVTDataProvider、vector GLB、Buffer vector 和 VectorProvider 均不进入依赖链；
先前保留的上游 decoder 修补/复用选项已被项目负责人的明确决定取代。

## 样式兼容

建议以 **Mapbox Style v8 常见子集** 为外部输入，发布版本化能力矩阵。
Mapbox 和 MapLibre 持续演进，`version:8` 本身不足以证明兼容任意新 style。

| 能力        | M1 建议目标                                                                             | 首轮不承诺                                                |
| ----------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 结构        | sources、source-layer、layer order、filter、min/maxzoom、visibility                     | Standard imports/slots/config，托管服务语义               |
| fill        | color、opacity、outline 和稳定边界抗锯齿                                                | pattern、extrusion                                        |
| line        | color、opacity、pixel width、常见 cap/join、dash、道路 casing 所需多层绘制              | 任意 line-gradient/pattern/elevation 扩展                 |
| circle      | radius、color、opacity、stroke                                                          | heatmap 等不同渲染模型                                    |
| symbol      | 分阶段支持 text/icon、颜色/halo/size、点和约定沿线 placement                            | 完整国际文字 shaping、全部 variable anchors/writing modes |
| expressions | 明确选择 get/has、比较/逻辑、match/case/coalesce、step/interpolate、zoom 及必要类型转换 | 所有 expression、feature-state、完整 transitions 自动兼容 |

这个表是讨论目标，不能用它直接宣称已支持。V1 冻结基础操作，
后续 phase 激活时才按实际 renderer 定义属性值域和图像验收。地图背景建议继续由 World/base layer 配置，
是否接收 style 的 background layer 作为适配便利项在 V1 明确。

建议先考察独立的 `@maplibre/maplibre-gl-style-spec` 校验/表达式前端；其
[官方仓库](https://github.com/maplibre/maplibre-style-spec) 提供独立于 GL JS renderer 的 npm 包。
是否引入需固定版本、bundle/runtime/Worker 边界和依赖审计，不把采用它等同于全 MapLibre 支持。
若改 package/lockfile，需要 SGP；本轮没有安装。

unsupported layer/property/operator 在应用样式前给出带路径诊断，避免静默忽略得到似是而非画面。
合法表达式运行时的缺失值/类型错误遵循选定规范的明确 default/error 规则；
不能把规范自身的默认值机制一概替换为全图失败。
依据：[Style layers](https://docs.mapbox.com/style-spec/reference/layers/)、
[Expressions](https://docs.mapbox.com/style-spec/reference/expressions/)。

**style zoom 与 tile LOD 分开**：连续 camera scale 驱动 paint，layout zoom 按已选规则失效；
source maxzoom/overzoom 是数据选择。不能用 terrain LOD 或整数 tile level 冒充 style zoom。
M1 的 pixel 默认建议 CSS pixel，DPR 转换集中处理；zoom 的标定要固定 reference tile pixel span、
参考平面和相机 scale，不能只凭 camera height 猜测。

## 坐标契约

首轮用 EPSG:3857 验收，但通用数学输入是当前米制平面坐标系的 root extent 与单根 quadtree，
不把全球 Web Mercator 写进解码器。World CRS 继续是 opaque metadata，
source 与 World 的 matrix 由应用显式匹配。
用户已有实现的职责分离见 [参考审计](2026-09-12-maplibre-reference-and-surface.md)。

source tile 的二维范围是 `[west,south,east,north]`，layer extent 是 `E`：

```text
X = west  + (u / E) * (east - west)
Y = north - (v / E) * (north - south)
Z = 显式 reference-plane height，或后续声明的 ground/anchor 语义
```

- 只翻转一次 tile-local Y。tile-local 整数与 world double 坐标保留到适当边界；
  GPU 使用 tile-local positions + origin，禁止把完整投影坐标直接降为 Float32。
- MVT 自身不提供 Z 或 CRS。属性中的 height 不自动成为几何高程。
- root 固定 `1×1`，level z 为 `2^z × 2^z`。source 与 World 使用匹配 root/matrix 时，
  同一 tile address 直接成立；优先复用已存在的 `SceneGISPlanarTilingScheme` 数学。
  第一版不要求支持不同 matrix 之间的任意地址/coverage 重映射。
- 换平面 CRS 不改变 PBF/几何整数解析，只改变显式坐标映射与匹配的数据源；
  给 3857 数据改一个 CRS 标签不等于重投影。任意 CRS 自动重投影不进入 M1。
- 首轮有限平面不新增 world wrap。Globe 的 antimeridian/horizon/curvature 在 G1 定义。
- Globe adapter 可以由同一 tile-local 数据反算经纬度/ECEF，但 tessellation、bounds、
  terrain 和标注屏幕投影独立实现，不复用平面 GPU 顶点作为球面结果。

既有约束见 [ADR-0002](../../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)。

## 批量、流式与图层顺序

推荐 source bytes/decoded tile、layout/geometry、paint state、GPU batches 和 placement 分开缓存，
但不提前固定具体 class 数量或字段。图层拥有自身请求、CPU/GPU 缓存和 feature registry，
借用 Scene/World/Context；不把 vector readiness 混进 `world.tilesLoaded`。

- 以 tile + style layer + 必要 pipeline state 分组；data-driven color/width 优先以 attribute、
  uniform 或受预算约束的 table 表达，避免一 feature 一 command。
- 同一 source tile 多 style layer 共用解码结果。paint-only 更新不重新下载，
  未变化 warm frame 不重新 decode/triangulate/upload；layout 变化仅使有关 batch 失效。
- 按视图懒创建、按需请求；source overzoom、父子过渡、空 tile 和 coverage 掩码明确，
  同一区域不能重复叠画 ancestor/child 造成透明加深。
- tile clipping 要保留需要的线端/halo buffer，同时对 fill/alpha 的实际覆盖消除重复贡献。
- fetch cancellation 与已启动 Worker 的 stale-result 丢弃分开；线程化需先观察主线程热点，
  不能借用 terrain Worker 的唯一 entry 例外。
- CPU decode/mesh 与 GPU publication 分开；normal frame 发布资源，
  picking/depth 不推进请求、LRU 或创建第二份可见状态。
- feature pick 至少返回 source、source-layer、style-layer、feature id/属性与必要 tile context。
  GPU 渲染索引不能成为永久业务 ID。

Flat 内部 style stack 应保持 painter order 与正确 source-over，同时尊重场景对象遮挡。
Cesium 的 pass/frustum/opaque/translucent sorting 未必保留提交顺序，必须在 V2 用重叠半透明 fixture 验证。
V2 再比较合并 Geometry/standard Primitive 与 SceneGIS 自有 DrawCommand batch，
不直接扩宽现有单 instance public wrapper，也不提前要求增加 Scene pass。

## 贴地边界

把以下行为分开：

1. Flat reference plane：首轮出图和样式基准，terrain 未介入。
2. Fill/line 地形共存：优先矢量直接贴地，地形 LOD 变化时不逐 feature 重建几何。
3. Circle/symbol 点锚：用明确的 resident/sampling 策略取得位置，并定义缺失高程与遮挡行为。
4. Relative height/extrusion/3D Tiles classification：不在 M1 承诺。

用户参考仓库的 `RenderToTexture → drawTerrain` 证明纹理地形路径存在，
但项目负责人要求优先保留矢量直接绘制，因此不采用颜色 RTT 作为主路线。
精度、pixel width、动态样式与逐 feature 交互成为直接贴地的验收目标，
不能把“保留 CPU feature 数据”作为满足这些渲染目标的替代证据。

当前优先验证 stable vector volume + depth/stencil 地表着色，
不把“已有单对象 GroundPrimitive”当作“已有地图 batch backend”。
实际 shader 使用 volume 和 stencil，不是逐像素读取地形高程后重建 vector mesh；
现有地形深度参与可见地表分类，而地图颜色直接写入当前渲染目标。
重叠要素身份、alpha 次数、layer order、线型与 pick 要有独立资格。
V2 的最小验证提前暴露这些风险，生产地形支持仍另设 phase。
具体选择见 [地形专题](2026-09-12-maplibre-reference-and-surface.md)。

flat 和 ground 共享 source/style/layout 及适用的 batch 数据，各有明确绘制语义。
不改既有 ADR-0023 的 public GroundPrimitive，不恢复其已删除 CPU draper，
不依赖 native VectorProvider，也不在直接贴地遇到困难时自动转为 RTT。

## 标注边界

标注是一套独立的 placement/rendering 能力，MVT 只给几何/属性；不是简单把 name 填进 LabelCollection。

- 先验证 point-placement 的 text/icon、halo、优先级与 collision，再处理沿线文字；
  中文与 Latin 使用固定本地字体和 fixture，不依赖操作系统恰好安装某字体。
- glyph PBF、sprite JSON/PNG 与直接字体栅格化是不同输入协议。选择 glyph/sprite 兼容意味着需要
  atlas、metrics、字体栈与 DPR 管理，Cesium Label/Billboard 的可复用范围须实际验证。
- 全可见 tile 集合进行 collision，明确跨 source 是否共享碰撞域；仅 tile 内避让不算完成。
- 跨 tile/zoom 去重结合显式 ID 与 placement key；无稳定业务 ID 时说明可保证的范围，
  不能只按相同 name 合并不同对象。
- 沿线标注需要弧长、角度/可读方向、重复间距、边界连续性；pool 只能复用绘制资源，
  不能代替 layout。
- 对相机连续缩放/旋转、tile 到达/撤离、terrain 变化定义稳定性；不能无限积累历史对象或
  用持续 retry/settling frames 掩盖抖动。
- symbol 与 surface 的高度、遮挡、屏幕方向及 pitch alignment 分别资格验证。

字体/glyph/sprite 的分发和预算在 V5 前确定，本轮不提前引入 runtime asset。

## 决定与阶段分工

| ID  | 决定                                                   | 状态 / 后续                                   |
| --- | ------------------------------------------------------ | --------------------------------------------- |
| D1  | MVT 2.1、常见 Style v8 子集、unsupported 路径诊断      | 已确认方向；V1 固定基础 profile，后续逐项扩充 |
| D2  | CRS 无关解码、匹配单 root matrix、首轮 EPSG:3857       | 已确认；V1 固定数学/zoom contract             |
| D3  | 完全独立于 Cesium experimental MVT，tile batch runtime | 已确认；V1 选格式前端，V2 renderer            |
| D4  | 矢量直接贴地优先，颜色 RTT 不作主路线                  | 已确认；V2 可行性，V4 生产资格                |
| D5  | M1 基础中文/Latin 点与约定沿线标注                     | 已确认阶段目标；V5 固定字体/placement profile |
| D6  | M1 保留 Globe 前端复用边界，G1 后续另行激活            | 已确认                                        |
| D7  | 无必须兼容服务/style，使用本地确定性数据               | 已确认                                        |

## Outcome and follow-up actions

用户已批准按计划推进，稳定决定提升 ADR-0057，V0 review 已通过。
具体 decoder/source/style API 在 V1 定义，直接贴地算法以 V2 证据决定，字体在 V5 冻结。
这些是已分配的后续阶段工作，不把待验证算法误记为已完成能力。
