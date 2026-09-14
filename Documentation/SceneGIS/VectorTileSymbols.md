# 矢量瓦片标注

G1 将既有点、沿线、图标和路牌前端接入 WGS84 / SCENE3D Globe。原始 anchors 保留 Mercator
坐标用于 region ownership 和跨 tile 去重，绘制坐标独立映射为 ECEF；layout、glyph atlas 与
native derived pick 共用。默认椭球直接使用 geodetic zero；真实地形借用已渲染 mesh 的 Worker
BVH 查询高度，并通过实际地表 depth 遮挡。小范围 quad 随锚点贴地不等于完整曲面字形；
大字形跨陡坡、跨瓦片道路语义拼接和全球所有字体覆盖仍保留原边界。见 [ADR-0070](Decisions/ADR-0070-globe-vector-ground-rendering.md)。

V5A 使用自有 glyph PBF parser、metrics layout、collision、glyph/icon GPU buffers 和 shaders，
仅复用 Cesium 通用 Scene/Renderer 与自动 pick command 派生。
不依赖 Cesium experimental MVT、LabelCollection、BillboardCollection 或地图颜色 RTT。
V5B 增加曲线文字、路牌与有向箭头；长期边界见
[ADR-0063](Decisions/ADR-0063-point-symbol-renderer.md) 和 [ADR-0065](Decisions/ADR-0065-line-symbol-placement.md)。

## 地形标注

V4A 在 World 有 terrainProvider 时，从最近正常帧发布的 terrain cover 采样点 anchor；
map-pitched 文字/图标的各角点也采样真实高程，viewport 字号与朝向保持原样。
按 cover/content revision 更新高度与必要 dynamic buffers，不额外发起 terrain 请求，
不把最高驻留但尚未绘制的 LOD 当成地表。surface 发布位于 primitives 更新之后，
因此 anchors 跟随最近已发布结果，地形替换期间可能有一帧更新差。

GPU 根据 anchor 所在像素周围四个地形深度样本判断遮挡，普通点标注整组遮挡；
map-pitched 四角的可见性在字形片元间插值。拾取使用相同结果，山后标注不可拾取。
这不是连续曲面字形的完全贴合：跨陡坡/山脊的大字形可能局部穿插或裁缺，terrain 上的
collision proxies 也不承诺包含起伏曲线的全部投影。精细地形文字质量和稳定过渡留给 V5C。
相关决定见 [ADR-0069](Decisions/ADR-0069-planar-vector-ground-rendering.md)。

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

文字/图标 size 按精确 fractional zoom 表达式求值；每轮 collision 使用该轮快照 zoom，
实际绘制继续使用当前 zoom，短期避让延迟见下文。
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
map-pitched 文字和图标还按 anchor 与视轴参考点的距离做部分透视补偿，缓和近景过大和远景过小；
字号、沿线间距、碰撞和拾取使用同一地面比例。它仍保留透视和倾斜压缩，不保证固定屏幕尺寸；
正交及中心参考比例保持，具体公式与 MapLibre 兼容边界见 ADR-0065。
文字按当前投影方向应用 keep-upright；箭头默认 icon-keep-upright=false，保留道路方向，
icon-rotate 可表达反向交通。路牌使用 viewport rotation，编号和图标保持朝向屏幕。
道路编号使用原始样式选择的预制普通 sprite，不需要 text-fit。

同一 source/style/content 的沿线文字受半个 symbol-spacing 的屏幕重复距离约束，
抑制邻 tile / LOD 的密集重复；不同内容不合并。曲线 collision 使用沿路径分段的保守包络，
直线路段不逐字投影四角；包络覆盖字形旋转外扩，可能比逐 glyph 盒产生额外避让。
Point 使用整组 layout box。相机 near/far 外的路径先裁切再做 viewport 排布。
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
热帧保持候选、排版、纹理、buffer 与 command；camera 变化立即更新已发布标注的真实绘制。
Placement 使用不可变相机快照，按约 2 ms 的步骤粒度软预算跨帧推进；普通交互在提交后
最多复用 100 ms，再启动下一轮。持续移动不重启在途布局，避免饥饿；完成后处理最新视图。
单个不可分割步骤可能超过预算，100 ms 也不是包含计算时间的硬完成期限。
离开当前 owner/视口、near/far 或远景范围的已发布标注当前帧隐藏。

候选和空间索引随驻留瓦片保存，短时离开 render cover 后再次进入可直接复用；真正淘汰、
整数 layout 或 terrain snapshot 改变时失效。空间包围盒只用于保守跳过不可见候选，仍按实际
anchor 位置完成原有可见性与碰撞判断。Shaping 只扫描待处理队列，字形内存统计复用加载时
计算的字节数，减少相机移动时的主线程扫描；细节见 ADR-0068 的 V3C1D amendment。

`tilesLoaded` 表示当前 base 与 symbol 请求、Worker 和最新视图 placement 均已终结，
不保证没有失败；隐藏 Layer 没有当前需求。
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
V3C1C 按 [ADR-0068](Decisions/ADR-0068-symbol-placement-and-dynamic-buffers.md) 分离碰撞与绘制：
先用代理做碰撞预检，再为通过的候选验证真实曲线字形和 max-angle；每帧只更新已发布字形。
Static buffer 保存 UV、颜色与 pick，dynamic buffer 保存位置、offset、size/halo 参数和 visibility。
数据不变不上传；平移只更新矩阵时不会重写这些 buffers，旋转、缩放与 paint 只写 dirty 范围。
保留原 non-indexed quad 和批次顺序；未合并底图命令，也未改变 depth/blending 策略。
Worker 待处理任务也计入 tilesLoaded；完成回调只存 CPU 状态。主线程 GPU/pick/placement 仍可能成为
密集视图瓶颈，整体内存硬上限与 terrain/Globe 另行验证。见 [ADR-0067](Decisions/ADR-0067-vector-worker-preparation.md)。

## 验收入口

- [symbols.html](../../Test/vector-tiles/planar-symbols.html)：完全本地的中英文、描边、POI、避让、拾取、缩放与倾斜。
- [line-symbols.html](../../Test/vector-tiles/planar-line-symbols.html)：曲线名称、正反道路、路牌、箭头、锐角和短线。
- [public.html](../../Test/vector-tiles/planar-map.html)：在线 Bright 118/119、Liberty 107/111 层；“街道细节”查看 POI、道路和箭头。
- [V5B phase plan](../../AgentDocs/vector-tiles/plans/2026-09-13-v5b-line-symbols.md)：测试与负责人视觉 gate。
