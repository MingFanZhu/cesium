# Discussion: 独立 symbol 架构与平面实现顺序

## Metadata

- Type: `discussion`
- Status: `resolved — accepted`
- Owner / reviewer role: 当前 architecture/execution Agent，自审
- Created / Updated: `2026-09-13`
- Parent: [Extension plan](../plans/2026-09-12-vector-tiles-extension.md)
- Entry checkpoint: `0bec9cbe56`，V3C0 已完成并通过负责人视觉验收
- Related: [V3C0 review](../reviews/2026-09-13-v3c0-public-map-review.md)、
  [MapLibre reference](2026-09-12-maplibre-reference-and-surface.md)
- ADR: 复用 [ADR-0061](../../../Documentation/SceneGIS/Decisions/ADR-0061-owned-vector-tile-primitives.md)
  的自有图元方向；symbol API/ownership/profile 决定待讨论完成后形成新 ADR
- SGP: None；本轮仅审计与讨论，没有修改产品实现

## Request and conclusion

负责人确认公开页后，要求查看标注如何实现。本轮只做源码/资源审计与设计讨论，
不将“能读取 symbol JSON”视为已有标注 renderer，也不直接激活原 roadmap 的 V5。

建议沿用自有地图图元路线，独立实现 glyph/sprite 资源、文字排版、视图级 placement、
跨瓦片 identity 与 symbol GPU batches。复用既有 MVT、表达式前端、source 调度、
坐标数学及 Cesium 通用 Renderer/pick 派生，不依赖 LabelCollection/BillboardCollection 的内部实现。
主要工作是布局与稳定性，单个带字形纹理的 quad 只是最终绘制单元。

## Source evidence

MapLibre 路径相对用户提供的参考仓库；只读源文件和 graph，未修改或运行该项目。
先通过 graph 找到符号，再检查具体源码；SceneGIS graph 未提供完整 Layer/Style 结果，补充读取当前文件。

| Reference path / symbol                                                        | Observed behavior                                                                           | Implication                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/data/bucket/symbol_bucket.ts` / `populate`                                | 求值 text/icon，收集 glyph 与 image dependencies；沿线同文 segments 做 merge；处理 sort key | 资源依赖、排版与绘制分层；仅 MVT feature ID 不足以定义完整标注       |
| `src/source/worker_tile.ts` / `parse`                                          | 请求 glyph/image 后构造 atlas、执行 `performSymbolLayout` 并返回 CPU 数据                   | tile layout 可进入 Worker；与当前相机有关的 placement 必须有独立职责 |
| `src/symbol/shaping.ts` / `shapeText`                                          | glyph metrics、换行、行高、anchor、justify、字间距；复杂 bidi 使用独立 RTL 接口             | 不能按字符串长度估宽，也不能以存在字形推断完整 shaping               |
| `src/style/load_glyph_range.ts` / `loadGlyphRange`                             | 按每 256 个 code points 请求 glyph PBF                                                      | 与 MVT 分开的格式、请求和缓存，仍可复用 protobuf 基础 Reader         |
| `src/render/glyph_atlas.ts` / `GlyphAtlas`                                     | glyph bitmap 加 padding 装箱；MapLibre 此处按 tile 所需依赖构造 atlas                       | SceneGIS 的共享资源方案需自行明确 ownership，不能误称直接照搬        |
| `src/symbol/collision_index.ts` / `placeCollisionBox`、`placeCollisionCircles` | 当前视图投影后检查屏幕碰撞；点框与沿线碰撞分开                                              | 不能在 tile 内独立决定最终可见标注                                   |
| `src/symbol/cross_tile_symbol_index.ts` / `findMatches`                        | symbol key 与跨 zoom 归一化位置邻域匹配，复用 crossTileID                                   | 临近/父子 tile 去重不是仅按文本或仅按 MVT ID                         |
| `src/symbol/placement.ts` / `commit`                                           | placement 有前次状态，按 crossTileID 继承透明度和 anchor 等信息                             | 渐变结束前有真实资源寿命；不能每帧从空状态随机放置                   |
| `src/symbol/symbol_size.ts` / `evaluateSizeForZoom`                            | 在覆盖 tile zoom 区间的 stops 之间按 fractional zoom 插值                                   | text/icon size 在 layout 中，但不能一律整数 zoom 求值                |
| `src/webgl/draw/draw_symbol.ts` / `drawSymbols`                                | 关闭 tile stencil clipping，文字和图标分别绘制                                              | 标注可跨边界，不能复用底板的逐片元 region 裁剪                       |

SceneGIS 当前明确接入点：

- [Style](../../../packages/engine/Source/SceneGIS/Core/SceneGISVectorTileStyle.js)：
  root 不接受 glyphs/sprite；profile 只有 background/fill/line/circle；
  `evaluateLayer` 对 layout 统一 floor zoom。symbol 需要扩展声明和归一化输出，不能泄漏
  style-spec 的 Formatted/ResolvedImage 对象作为新公共协议。
- [Layer](../../../packages/engine/Source/SceneGIS/Scene/SceneGISVectorTileLayer.js)：
  `createBatches` 同步完成 tile geometry 与 GPU publication；
  `update` 正常帧更新、pick/depth 复用已发布状态。新增异步字体与 placement 不能破坏该时序。
- [Batch](../../../packages/engine/Source/SceneGIS/Scene/_private/_SceneGISVectorTileBatch.js)：
  `setRegions` 给普通图元下发片元裁剪；symbol 应按 anchor/identity 选择 owner，
  允许完整文字越过 owner region，不把每个 glyph 剪到 tile 内。

## Actual Bright / Liberty workload

[Bright snapshot](../../../Test/vector-tiles/reference/openfreemap-bright.json) 的 25 个 symbol layers：

| Group                      | Count | Examples                                                            |
| -------------------------- | ----- | ------------------------------------------------------------------- |
| 固定 point placement       | 15    | place、water_name point、poi、airport                               |
| 固定 line placement        | 7     | road names、water names、oneway arrows                              |
| 随 zoom 在 point/line 切换 | 3     | highway-shield-non-us、highway-shield-us-interstate、road_shield_us |

Point placement 描述布局方式，不保证所有输入 geometry 都是 MVT Point；道路路牌尤其需要单独审计。
不能将剩余 25 层全部当成同一种“文字显示”功能。

Bright 与 Liberty 使用相同的 glyph URL 和 sprite，三种 fontstack 为
`Noto Sans Regular`、`Noto Sans Italic`、`Noto Sans Bold`。
Bright 已包含双语换行、icon/text optional、icon overlap、anchor/offset、halo blur、
zoom-dependent size、图标表达式等真实需求。删除 icon-image 后只画文字不算兼容原层。

2026-09-13 有限在线只读检查：

- 三种 fontstack 的 `21248-21503.pbf` 均 HTTP 200、256 glyphs，包含 U+5317“北”；
  Regular 的 `0-255.pbf` 包含“A”。仅证明抽样字形可取，不代表完整 CJK/全 Unicode 排版资格。
- `https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json` 包含 264 个条目，
  全部为普通图像，未声明 SDF；如 `circle_11_black`、`hospital`、`road_2`。
  该结论来自 metadata，没有加载 PNG 或验证 GPU 显示。
- 没有把下载字形保存进仓库。实现阶段的本地 fixtures 应固定授权来源和测试字体子集；
  Test 页面可用公共服务，自动化仍完全本地。

## Proposed subsystem

`MVT feature + symbol style → resource dependencies → shaped candidates → view placement → symbol batches`。

1. **资源。** Style 仅声明 glyph/sprite；请求和缓存由 live Layer 的实例拥有。
   CPU glyph cache 按字体/字码索引，GPU atlas pages 在同一 Layer/Context 内共享，
   sprite metadata 保留 pixelRatio，普通 RGBA 图标与 SDF 字形分开。
   atlas 使用有界页与明确引用，不使用无限增长单张纹理或每 feature 独立纹理；
   页被候选/已发布/淡出标注引用时不可回收。跨 Layer 共享可后续显式增加，禁止隐式全局 cache。
2. **排版。** 纯 CPU 输入为规范化文本、glyph metrics、样式和 tile-local anchors/lines。
   Unicode code points、advance/bearing、换行、行高、anchor、justify、spacing 决定 glyph quads
   与碰撞范围。首个 profile 聚焦横排中文和 Latin，RTL、复杂文字 shaping、竖排、
   富文本内嵌图标等单独列能力；不默认使用系统字体替代服务中的字体。
3. **Placement。** 一个 `SceneGISVectorTileLayer` 内的全部 source/style layers 共用候选集合与
   screen-space collision index，按冻结的 layer priority、sort key 和稳定 tie-break 处理。
   text/icon 各自 allow-overlap、ignore-placement、optional 语义必须区分；
   合成 POI 的文字和图标共同决定 placement。不同 Layer 实例首轮不自动互相避让。
4. **跨 tile 与过渡。** 按 source/style/内容及空间匹配建立稳定 symbol identity；
   不按名称全局去重，也不假设所有服务都有跨 zoom 稳定 feature ID。
   使用显式确定的 anchor ownership 防止 buffer/父子重复；半开 tile 边界与 world 外边界规则一致。
   地图 base cover 与 symbol readiness 分开，子 tile 缺 glyph 时底图可先显示，
   旧标注 owner 的保留/替换/淡出必须遵守独立、有限的 symbol 状态；不按字形片元裁剪。
5. **GPU 与交互。** 用自有 glyph/icon Shader、Buffer/VA/Texture/DrawCommand；
   批次按 style 顺序、atlas page、SDF/RGBA 等必要状态分割，不为每个字生成 command。
   anchor 仍是双精度平面 world/tile-local 坐标，局部排版保留 em/CSS px，
   view projection 后正确应用 DPR；pick 复用 Cesium 自动派生，必须使用同一 placement、
   coverage/discard 与已发布资源。字体可缩放精度受 SDF 源分辨率限制，不承诺无限放大。

SDF atlas 只保存可复用字形素材，sprite 只保存图标素材；文字位置、字号、颜色、透明度、
避让和交互仍独立控制。地图面线不被合成为颜色 RTT，符合已批准的直接矢量地图路线。

## Update, size and lifecycle boundaries

- 几何/排版更新与视图更新分开：相机变化主要重投影和 placement，不重新下载 glyph 或重建全部字形；
  text/font/layout bucket 变化才重排，paint 与 size 的处理按依赖分类。
- text-size/icon-size 单独定义 fractional zoom 契约，collision 与 GPU 使用相同有效大小。
  现有 V1 layout floor 不能直接扩展到这两项；是否精确采用 MapLibre stop-pair 插值在 phase 中冻结。
  text-offset/max-width/letter-spacing/line-height 等 em 值不能与 text-size/padding 的 CSS pixels 混用。
- 字体网络失败、缺 glyph 与 tile fetch 失败分别诊断；字体未就绪不阻塞基础 fill/line，也不能算标注已就绪。
  不增加无限 retry、静默系统字体替代或测试专用产品路径。
- Async completion 只提交 CPU 候选并 requestRender；normal frame 统一分配/替换 GPU。
  stale generation、remove、destroy 后的结果不得复活资源。pick/depth 不触发 layout/request/allocation。
- 冷准备、warm placement、CPU/GPU atlas bytes、候选数、已放置数、draw commands、淘汰/销毁需分别观测。
  没有动画/待发布结果时保持 requestRenderMode 静止；有淡出时只在其明确生命周期请求帧。
- CPU shaping/candidate 输出保持可序列化，保留 Worker 入口；此讨论不冻结线程 transport 或额外上游 hook。
  密集性能 V3C1 应包含真实 symbol 负载后再决定最值得迁出的工作。

## Proposed milestones and sequencing

建议把原 V5 拆分为以下三个 gate；这是顺序调整提案，尚未激活 phase 或改写已批准 roadmap：

| Proposed phase   | Deliverable                                                                          | Main acceptance                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| V5A 平面点标注   | SDF text + 普通 sprite icon、点排版、统一 collision、基本跨 tile identity、pick/资源 | 本地中英文混排与重叠 POI；公开页选定 point layers；跨 tile/zoom 不重复、缺字诊断、移除重建          |
| V5B 平面沿线标注 | 沿线逐字投影、keep-upright、max-angle、spacing、路牌和单向箭头                       | 曲线/短线/急弯、多 tile 道路、重复距离、zoom placement 切换与倾斜；不能用单个旋转字符串替代沿线排版 |
| V5C 地形标注     | 在 V4 生产地形之上接入 anchor height、可见性/遮挡与地图贴合方向                      | 起伏地形/LOD 下字形连续、遮挡正确、稳定 placement；Globe 仍由 G1 单独验收                           |

建议顺序为 V5A → V5B → V3C1 → V3D → V4 → V5C。
平面标注不以 terrain 为实现前提；先取得包含标注的真实负载，再完成全图性能预算更有代表性。
V3D 与 V4 原目标保持，M1 的生产贴地和标注资格不被提前宣布完成。

## Open decisions and next action

- 确认提前实施平面标注的阶段顺序；采用 Bright/Liberty、中文和 Latin 横排作为首个 profile。
- phase 开始时冻结 API：glyph/sprite 声明与资源 override、readiness/statistics、
  失败诊断和 atlas ownership；形成 symbol ADR 后只细化 V5A。
- 首轮 exact layer/profile 要同时覆盖 icon/text 联动和默认值，不为尽快提高层数而删除原始 style 属性。
- 字体/图标 fixtures 的许可证、体积与缺字契约在实现前落实；有限线上 HTTP 检查不替代画面验收。
- 本轮无 engine/Shader/Worker/API 或 upstream-owned 修改，无新增 SGP；
  仅完成上述源码证据、资源抽样与文档检查。没有宣称 symbol 已实现。

本轮 3 份修改文档的 Prettier、62 个相对链接和 diff whitespace 通过；
全 AgentDocs Markdownlint 通过。全目录 Prettier 仍有 233 份未修改文档的既有格式警告，
不扩大格式修改范围；没有为纯讨论重复运行 engine 构建或渲染测试。

## Primary references

- [MapLibre glyphs](https://maplibre.org/maplibre-style-spec/glyphs/)
- [MapLibre sprite format](https://maplibre.org/maplibre-style-spec/sprite/)
- [MapLibre symbol properties](https://maplibre.org/maplibre-style-spec/layers/#symbol)
- [Public style and licenses](../../../Test/vector-tiles/reference/README.md)

## Resolution

负责人于 2026-09-13 批准自有 symbol 方案。阶段顺序已更新，当前实施 [V5A](../plans/2026-09-13-v5a-point-symbols.md)，公共契约与 ownership 提升为 [ADR-0063](../../../Documentation/SceneGIS/Decisions/ADR-0063-point-symbol-renderer.md)。上文保留讨论时的审计与提案事实。
