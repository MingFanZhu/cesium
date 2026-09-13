# 矢量瓦片点标注

V5A 使用自有 glyph PBF parser、metrics layout、collision、glyph/icon GPU buffers 和 shaders，
仅复用 Cesium 通用 Scene/Renderer 与自动 pick command 派生。
不依赖 Cesium experimental MVT、LabelCollection、BillboardCollection 或地图颜色 RTT。
长期边界见 [ADR-0063](Decisions/ADR-0063-point-symbol-renderer.md)。

## 样式与坐标

Style root 可指定 `glyphs: "/fonts/{fontstack}/{range}.pbf"` 和单个 `sprite: "/sprite"`。
glyph PBF 的 24-pixel em、3-pixel SDF border、signed bearings 与 advance 保持原义；
sprite 使用 `.json` 和 `.png`，图标尺寸除以 metadata.pixelRatio 后为 CSS pixels。
Style 的 `glyphs`、`sprite` 是只读配置，Style 不负责请求。

| 范围      | 已支持                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------- |
| placement | MVT Point，symbol-placement: point；viewport/auto rotation/pitch alignment                            |
| 内容      | text-field 属性表达式与字符串 token、text-font 数组、text-transform、icon-image 名称/表达式           |
| 排版      | text-size/max-width/line-height/letter-spacing、九种 anchor、justify、offset；icon-size/anchor/offset |
| 避让      | symbol-sort-key、text/icon padding、allow-overlap、ignore-placement、optional                         |
| 绘制      | text-color/opacity、text-halo-color/width/blur；普通 RGBA icon-opacity                                |

文字排版以横排中文和普通 Latin 为首轮验收范围；保留完整词的英文换行、中文逐字断行和显式换行。
不支持沿线、map alignment、vertical/RTL/复杂 shaping、rich text、variable anchors、
icon-text-fit、SDF icon 或 fade transition。不支持的显式属性在构造时拒绝；
非 Point geometry、缺字、已识别的复杂 shaping 文本在运行时提供诊断。
该范围不承诺与 MapLibre 的自动均衡换行、复杂字体 shaping 或任意宽 halo 逐像素相同。

文字/图标 size 按精确 fractional zoom 表达式求值，排版与 collision 使用同一值；
其余 layout/filter 按 floor zoom。这是本 profile 的选择，和 MapLibre stop-pair 插值可能存在差别。
MVT 内坐标保持 CRS 无关，先按 source tile matrix 转世界 anchor，再投影为屏幕 CSS pixels；
GPU 使用 RTE 和 DPR，glyph 不按基础瓦片区域裁切。

同一 Layer 的所有 sources/styles 共享 collision，高层优先、小 sort key 优先参与避让。
身份由 source/style/content/font 与量化容差内的空间位置匹配，允许父子/邻 tile 去重，
不单独依赖不保证全局唯一的 MVT ID。同名不同位置不会仅按文字合并。
允许 overlap/ignore-placement 的层保留 feature 绘制顺序，普通避让层共享 atlas batch。
不同 Layer 实例各自管理 collision。

## 资源与诊断

`SceneGISVectorTileLayer` 新增正整数选项：

| 选项                    | 默认 | 含义                                                         |
| ----------------------- | ---- | ------------------------------------------------------------ |
| maximumSymbolCandidates | 2048 | 每次放置采用的候选上限；排序后截断，不是 MVT 解码/总内存上限 |
| maximumGlyphRanges      | 64   | 单 Layer 的 glyph range cache 数量；页面为 512 宽，最高 2048 |
| maximumSymbolRequests   | 4    | glyph range 或 sprite bundle 同时加载任务上限                |

公开 Test 页显式配置 `maximumGlyphRanges: 192`；北京多字体中文实测超过默认 64。
该设置不会自动修改产品预算，也不代表任意中文视图都能在任意预算下完整显示。

字形按 font/range 共用页面；当前需求/发布命令使用的页面不可 LRU 淘汰。
过期请求可取消；迟到结果不能恢复已销毁资源。异步完成只准备 CPU 数据并 requestRender，
GPU 与布局只在 normal update 发布，pick/depth 复用快照。
基础地图不等待字体；同内容标注在延迟 LOD 替换时保留身份。
热帧保持排版、纹理、buffer 与 command；camera 变化重新投影和碰撞。

`tilesLoaded` 表示当前 base 与 symbol 请求均已终结，不保证没有失败；隐藏 Layer 没有当前需求。
`errorEvent` 的资源错误形如 `{layer, resource, error}`，`tile` 可 undefined。
无自动字体替代或额外 retry；缺字不会伪装为成功的完整文字。

Bright 真实数据存在未列在 sprite 中的 `office` 等名称。按 MapLibre 的原始布局语义，
缺少 image entry 时只有 text geometry，文字仍参与放置；没有合成替代图标。
名称列入 `statistics.missingSymbolImages`，公开页有可见提示。
sprite HTTP/解码失败或损坏 metadata 则是 error，不与 entry 缺失混为一类。

统计同时提供 symbolCandidates、placedSymbols、truncatedSymbols、duplicateSymbols、
pendingSymbolRequests、symbolFailures、glyphRanges、glyphCpuBytes 与 symbolTextureBytes。
候选在请求字体和 collision 前按 anchor 的视口与 near/far 可见性筛选，避免远景粗瓦片的
不可见名称占用资源或产生 shaping 错误。placedSymbols 统计已放置的视口内 anchor，
它不是文字像素计数；完整 glyph 可跨 tile/屏幕边界。视口外 anchor 的局部入屏暂未支持，
见 [ADR-0064](Decisions/ADR-0064-vector-perspective-lod.md)。
missingSymbolImages/symbolFailures 是本 Layer 生命周期累计诊断。
大负载的 Worker、buffer 分块和整体吞吐量属于 V3C1；terrain/Globe 另行资格验证。

## 验收入口

- [symbols.html](../../Test/vector-tiles/symbols.html)：完全本地的中英文、描边、POI、避让、拾取、缩放与倾斜。
- [public.html](../../Test/vector-tiles/public.html)：在线 Bright/Liberty；点击“街道细节”查看 16 级 POI。
- [V5A phase plan](../../AgentDocs/vector-tiles/plans/2026-09-13-v5a-point-symbols.md)：测试与负责人视觉 gate。
