# 矢量瓦片标注

V5A 使用自有 glyph PBF parser、metrics layout、collision、glyph/icon GPU buffers 和 shaders，
仅复用 Cesium 通用 Scene/Renderer 与自动 pick command 派生。
不依赖 Cesium experimental MVT、LabelCollection、BillboardCollection 或地图颜色 RTT。
V5B 增加曲线文字、路牌与有向箭头；长期边界见
[ADR-0063](Decisions/ADR-0063-point-symbol-renderer.md) 和 [ADR-0065](Decisions/ADR-0065-line-symbol-placement.md)。

## 样式与坐标

Style root 可指定 `glyphs: "/fonts/{fontstack}/{range}.pbf"` 和单个 `sprite: "/sprite"`。
glyph PBF 的 24-pixel em、3-pixel SDF border、signed bearings 与 advance 保持原义；
sprite 使用 `.json` 和 `.png`，图标尺寸除以 metadata.pixelRatio 后为 CSS pixels。
Style 的 `glyphs`、`sprite` 是只读配置，Style 不负责请求。

| 范围      | 已支持                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------ |
| placement | MVT Point / LineString；symbol-placement: point / line / line-center；map / viewport / auto alignment  |
| 内容      | text-field 属性表达式与字符串 token、text-font 数组、text-transform、icon-image 名称/表达式            |
| 排版      | text-size/max-width/line-height/letter-spacing、九种 anchor、justify、offset；icon-size/anchor/offset  |
| 避让      | symbol-sort-key、text/icon padding、allow-overlap、ignore-placement、optional                          |
| 绘制      | text-color/opacity、text-halo-color/width/blur；普通 RGBA icon-opacity                                 |
| 沿线      | symbol-spacing、text-max-angle、text/icon-rotate、text/icon-keep-upright；逐字曲线排布、独立路牌和箭头 |

文字排版以横排中文和普通 Latin 为首轮验收范围；保留完整词的英文换行、中文逐字断行和显式换行。
不支持 Polygon point placement、vertical/RTL/复杂 shaping、rich text、variable anchors、
icon-text-fit、SDF icon 或 fade transition。不支持的显式属性在构造时拒绝；
Polygon geometry、缺字、已识别的复杂 shaping 文本在运行时提供诊断。
该范围不承诺与 MapLibre 的自动均衡换行、复杂字体 shaping 或任意宽 halo 逐像素相同。

文字/图标 size 按精确 fractional zoom 表达式求值，排版与 collision 使用同一值；
其余 layout/filter 按 floor zoom。这是本 profile 的选择，和 MapLibre stop-pair 插值可能存在差别。
MVT 内坐标保持 CRS 无关，先按 source tile matrix 转世界 anchor，再投影为屏幕 CSS pixels；
GPU 使用 RTE 和 DPR，glyph 不按基础瓦片区域裁切。

透视浅俯角下，远处地面投影比例低于中心参考比例的四分之一时，不显示该处整组文字与图标。
判定使用 anchor eye depth 相对视轴地面交点距离，独立于 source 瓦片层级；城市名、道路名、
路牌和箭头一致处理。相机接近后可重新显示，正交和同一平面的俯视不受此距离规则影响。
这是当前平面可读性策略，尚无距离阈值配置或渐隐过渡。

同一 Layer 的所有 sources/styles 共享 collision，高层优先、小 sort key 优先参与避让。
身份由 source/style/content/font 与量化容差内的空间位置匹配，允许父子/邻 tile 去重，
不单独依赖不保证全局唯一的 MVT ID。同名不同位置不会仅按文字合并。
允许 overlap/ignore-placement 的层保留 feature 绘制顺序，普通避让层共享 atlas batch。
不同 Layer 实例各自管理 collision。

## 沿线、路牌与箭头

`line` 在 tile 内裁切的路径上重复放置；`line-center` 在每条完整 part 的弧长中点放置一次。
`point` 遇到 LineString 使用首顶点，与 MapLibre 的道路编号牌低 zoom 分支一致。
沿线不自动换行，text-max-width 仅用于 point；glyph advance 与 letter-spacing 决定沿路径的逐字位置。
短线放不下完整文字，或相邻字形之间的转角超过 text-max-angle 时，整条名称不放置。
显式换行保留为多行，每一行分别沿路径排布。

rotation auto 在 point 为 viewport、沿线为 map；pitch auto 跟随 rotation。
map pitch 的四角是真实世界顶点，透视时随地面缩短和缩放；viewport pitch 的尺寸为 CSS pixels。
文字按当前投影方向应用 keep-upright；箭头默认 icon-keep-upright=false，保留道路方向，
icon-rotate 可表达反向交通。路牌使用 viewport rotation，编号和图标保持朝向屏幕。
道路编号使用原始样式选择的预制普通 sprite，不需要 text-fit。

同一 source/style/content 的沿线文字受半个 symbol-spacing 的屏幕重复距离约束，
抑制邻 tile / LOD 的密集重复；不同内容不合并。曲线 collision 使用逐 glyph 投影盒，
不把整条弯曲文字的空白内部全部占满。相机 near/far 外的路径先裁切再做 viewport 排布。
anchor ownership 继续使用 resident cover 半开区域，完整 glyph 可跨 tile 边界。

anchor 的世界间距为 symbol-spacing 乘以整数 style zoom 与 source canonical LOD/overzoom
两者中较粗的米/像素值；因此浅俯角远方粗瓦片不会按近景尺度生成海量候选。
不推断未加载道路的连接，不做跨 tile 全局里程或语义道路拼接；anchor 相位和 LOD 切换
不承诺逐像素等同于 MapLibre，当前也没有 fade transitions。

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
候选在请求字体和 collision 前按 anchor 的视口、near/far 与透视相对距离筛选，避免远景粗瓦片的
不可见名称占用资源或产生 shaping 错误。placedSymbols 统计已放置的视口内 anchor，
它不是文字像素计数；完整 glyph 可跨 tile/屏幕边界。视口外 anchor 的局部入屏暂未支持，
见 [ADR-0064](Decisions/ADR-0064-vector-perspective-lod.md)。
missingSymbolImages/symbolFailures 是本 Layer 生命周期累计诊断。
V3C1B 已将整数 anchors、glyph decode/pack 和 normalized shaping 迁入 Worker。
同一文本的排版按标准字号缓存，fractional size 只缩放；glyph/sprite 重载使用 generation 使旧排版失效。
Worker 提前整理去重的 font/range dependencies；交互时复用不变的世界字形几何、高低位编码和顶点暂存区，
减少临时对象与 GC。地图方向、字号或 anchor 改变时重新准备相关几何。
屏幕投影、keep-upright、碰撞和最终 quads 仍随当前相机在主线程计算，不能用过时相机结果代替。
Worker 待处理任务也计入 tilesLoaded；完成回调只存 CPU 状态。主线程 GPU/pick/placement 仍可能成为
密集视图瓶颈，整体内存硬上限与 terrain/Globe 另行验证。见 [ADR-0067](Decisions/ADR-0067-vector-worker-preparation.md)。

## 验收入口

- [symbols.html](../../Test/vector-tiles/symbols.html)：完全本地的中英文、描边、POI、避让、拾取、缩放与倾斜。
- [line-symbols.html](../../Test/vector-tiles/line-symbols.html)：曲线名称、正反道路、路牌、箭头、锐角和短线。
- [public.html](../../Test/vector-tiles/public.html)：在线 Bright 118/119、Liberty 107/111 层；“街道细节”查看 POI、道路和箭头。
- [V5B phase plan](../../AgentDocs/vector-tiles/plans/2026-09-13-v5b-line-symbols.md)：测试与负责人视觉 gate。
