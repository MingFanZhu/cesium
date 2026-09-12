# ADR-0059：平面矢量瓦片批量渲染

## 状态与依据

- Status：`accepted`（V2 flat 契约；ground 仅候选资格）
- Date：`2026-09-13`
- Owner：当前 Architecture/Execution Agent，依项目负责人已批准的独立扩展路线
- Parent：[ADR-0057](ADR-0057-independent-vector-tiles-runtime.md)、[ADR-0058](ADR-0058-vector-tile-frontend-contract.md)
- Plan：[V2](../../../AgentDocs/vector-tiles/plans/2026-09-13-v2-planar-batch-and-ground.md)
- SGP：None；本决定不改变 upstream-owned file

V1 checkpoint 为 `80089a0a91`。当前 Cesium 普通 synchronous Primitive 可以把多个 GeometryInstance
合并为 GPU commands，保留 per-instance color 与 pick。它不同于被本扩展排除的实验性 Buffer/MVT 链路。
Primitive 的显式 queue hook 可在同一个 pass 内保留输入命令顺序。

真实 Context 的 [RenderProbeSpec](../../../packages/engine/Specs/SceneGIS/Scene/SceneGISVectorTileRenderProbeSpec.js)
已通过 10 项实验：flat 同 batch/多 layer 的 source-over 与 pick、原生多 frustum 边界、
前景 opaque 遮挡、独立 ground stencil 参考、共享 stencil 反例，以及 depth-reconstruction 凸体候选。

共享 stencil 的两个 0.5-alpha 重叠要素输出红色 `[128,0,0,255]`，拾取为第一个要素；
正确参考是 `[64,0,128,255]` 且拾取第二个要素。共享 stencil 不能直接承担地图合批。

## V2 公共入口和能力

新增 `SceneGISVectorTileLayer({ scene, style, sources, tileCacheSize, maximumVisibleTiles,
maximumRequests, maximumUploadsPerFrame, show, allowPicking })`。
应用显式加入 `scene.primitives`；构造不请求数据或创建 GPU 资源。
借用 live Scene、其当前 SceneGISPlanarWorld 和可选 caller-owned sources，不销毁它们。

`style` 接受 V1 SceneGISVectorTileStyle 或兼容 JSON；sources 是可选的 source-ID override，
否则从 style.sources 的单 URL template 建立 V1 source。所有 sources 必须使用同一个 World canonical scheme；
不轮询多个 URL，不增加 TileJSON/CRS 推断。配置与原始 style 在构造时验证。
新增 `SceneGISVectorTileStyle.getLayerDefinition(id)` 返回已冻结的 layer snapshot，
使 renderer 无需构造假 feature 或读取依赖库内部对象即可取得结构信息。

V2 layer 的 style/source 配置创建后固定；替换整个 layer 有明确 ownership，原地 setStyle/feature-state
属于后续失效优化设计。公开 show、ready、tilesLoaded、errorEvent、statistics、isDestroyed/destroy；
ready 表示已有一次成功 normal update，tilesLoaded 表示当前 desired cover 无待处理工作。

V2 rendered profile 为 `scenegis-vector-flat-v2`：

- background color/opacity；fill color/opacity 与显式一像素 outline；
- line color/opacity/CSS width，straight segment 与原生受限 miter 展开，butt cap；
- circle radius/color/opacity/stroke 和屏幕圆形覆盖；
- V1 的 filter、zoom、visibility、属性/zoom 表达式和 layer 顺序。

V2 不承诺 Mapbox 边缘像素、急角 miter 或抗锯齿逐像素一致；fill/line 初期依当前 Context 的 AA。
非默认 line cap/join/miter 配置、gap/offset/dash/blur、circle blur 与 fill-antialias=false 明确拒绝；
不把默认的 native stroke 质量描述成 V3 已完成。V3 再扩大 profile 与质量。
V2 只资格化无 terrainProvider 的 Z=0 平面；挂载地形时明确报告当前 flat 后端不支持，
不把参考平面绘制冒充贴地。Globe、symbols 和 extrusion 尚未支持。

## 批量、覆盖与渲染顺序

每个 tile/style layer/geometry-kind 使用普通 synchronous Primitive 的 GeometryInstance batch。
颜色不是拆分 command 的依据；原生 feature 顺序保持，关闭会重排三角形的 vertex-cache optimization。
共享样式层跨所有 tile 提交完后才进入下一层。
填充/线/圆的 id 返回 source、sourceLayer、styleLayer、tile address、feature index、原生 id 与属性；
GPU pick index 只属于内部资源。

Core 的独立几何准备只依赖 Core 和 earcut，不依赖 Scene/World；
GPU 与 Primitive ownership 放在 Scene 层，因为 Primitive/Appearance 本身属于 Cesium Scene。
无需为目录齐全引入反向依赖的 Renderer facade。

使用现有 `Pass.TERRAIN_CLASSIFICATION` 作为 Planar surface 后、ordinary 内容前的稳定绘制槽位。
Flat 阶段不使用 stencil，不写深度；片段在 tile 的 Z=0 平面进行半开覆盖裁剪，
缓冲几何可以越界，但共享边同一像素只由一个 tile 合成。
线/圆屏幕展开不依赖任意 Z 偏移；surface 保留其 Z=0 深度，ordinary 前景遮挡与 pickPosition 保持原语义。
多 frustum 场景由真实像素回归资格，不修改 Scene 全局 frustum 参数。

平面 GPU positions 使用 tile-origin-relative DOUBLE，translation modelMatrix 保留完整坐标。
片段裁剪重建到该 local model space，不在 Shader 中先恢复巨大 world XY 再相减。
裁剪射线先在 eye space 求方向，再用 inverse-model-view 的旋转部分变换方向；
不能在加入高位相机 translation 后再用相邻采样点作差。完整 Mercator 回归覆盖此精度边界。
颜色采用 premultiplied alpha；queue hook 显式设定 blending，避免 Appearance 默认策略二次应用 alpha。

## 调度、失效和所有权

Style zoom 由参考平面在相机正下方的 CSS meters-per-pixel 确定；source LOD 单独取整并限制到可用层级。
每个 source 独立选取同一级的可见平面 tile。遍历按 frustum 裁剪，命中可见 tile 上限立即停止，
并依明确预算逐级降低 LOD；不预建完整树。到 minimumLevel 仍超预算时明确报错，
不发布不完整 desired 集合。V2 不做父子重叠、祖先底图或跨层级 fade。
V3A 通过 [ADR-0060](ADR-0060-vector-tile-resident-render-cover.md) 扩展实际覆盖：
保持单级 desired 集合，允许 resident ancestor/descendant 按不重叠区域替换。

tileCacheSize 和 maximumVisibleTiles 是每 source 的 tile-count 上限，前者不得小于后者；
maximumRequests 和每 normal frame 的 upload tile 数为整个 layer 的上限。
tile count 有界不等于任意 payload 的 byte 数有界；V3 再根据真实数据建立 byte/performance 预算。

缓存状态区分 idle、pending、decoded、ready、failed。正常帧负责请求、GPU publication、eviction 与错误 event；
completion 只放入 CPU 结果并 requestRender。未选中请求可取消；取消、移除、destroy 后的 stale completion
不得恢复条目或 GPU 状态。失败不自动重试；Resource 自身显式 retry 设置仍由调用方负责。

warm view/style 不重解码、不重建 GPU。zoom 改变时只在需要重新求值的 layer 处理失效；
V2 可以重建相关 tile batch，工作仍受 upload 预算约束，V3 优化已测热点。
pick/depth 不请求、不推进 selection/cache/upload，只重放最近 normal publication。
destroy exactly once 释放 Primitive/VA/Shader/pick id，异步结果通过 attempt identity 失效。

## 直接贴地的后续选择

优先继续验证“稳定凸体覆盖 + current surface depth 重建 + 每片段自身 footprint 判断”。
通过 front-face culling 只绘制凸体的一个出口片段，独立的 per-feature 属性无需共享 stencil 清零，
实验在相同与部分重叠的矩形、倾斜地形、普通/对数深度中保持颜色和 pick。

它读取地形深度，不生成地图颜色纹理；不复用 Cesium experimental VectorProvider。
本阶段证据只覆盖凸矩形，不能外推到凹多边形/孔洞、三角剖分共边、CSS 线型、
相机穿越 volume、全局 height envelope、大坐标、任意 frustum 和 provider/LOD 变化。
V4 必须以这些风险为入口再冻结具体算法与公共 surface mode。
现有 single-instance GroundPrimitive 和 ADR-0023 保持原契约，不引入 CPU terrain draper。

## 构建、验证与升级

新固定 Shader 进入 ADR-0030 的 SceneGIS GLSL root，生成 JS 不提交。
核心前端、几何/coverage/cache Specs 与真实 Context 互补；Test/vector-tiles 提供根服务器直达入口，
不依赖 Sandcastle 或公网服务。公开入口运行 build/build-ts/tsc；
Shader/包交付运行 release 与独立安装包 smoke。人工 flat 画面通过后才关闭 V2。
当前验证记录见 [V2 review](../../../AgentDocs/vector-tiles/reviews/2026-09-13-v2-flat-review.md)。

升级重点：Primitive geometry 合并顺序、batch table 与 pick、queue hook、GLOBE/classification 顺序、
local RTE/inverse-model-view、PolylineCommon 的宽度与 join 行为、frustum/depth replay、
Shader 构建与许可证依赖。若 hook 或 pass 不再等价，应依据回归结果重新选择窄 seam 并登记 SGP。
