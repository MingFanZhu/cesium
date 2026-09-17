# Phase Plan: V5A 平面点标注

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Owner / reviewer: 当前 architecture/execution Agent，自审
- Created / Updated: `2026-09-13`
- Architecture review: `approved`，负责人批准独立 symbol 方案和提前实施平面标注
- Entry checkpoint: `0bec9cbe56`，V3C0 完成
- Discussion: [Symbol architecture](../discussions/2026-09-13-symbol-architecture.md)
- ADR: [ADR-0063](../../../Documentation/SceneGIS/Decisions/ADR-0063-point-symbol-renderer.md)
- SGP: None；计划仅修改 SceneGIS-owned paths

## Scope and current facts

当前 Style 仅四种基础层，root 不接 glyphs/sprite；Layer 只做同步 tile batch publication，
已有逐区域 base cover 与 native DrawCommand pick 派生。依赖方向和 Shader delivery 沿用 ADR-0061/0030。
本阶段增加 glyph PBF、普通 sprite、横排文字与 point placement，不依赖 Cesium 文字图元。
沿线/map-aligned、复杂文字 shaping、variable anchors、fade transitions 与地形不在首个 profile；
稳定去重和旧资源就绪前的保留必须实现，不以 fade 掩盖 identity 问题。

## Implementation

1. Style root 接受 glyphs URL、单 sprite URL；symbol 接受选定 text/icon point 属性。
   text/icon size 按精确 fractional zoom 表达式求值，排版与碰撞统一使用该值；
   其余 layout/filter 维持整数 zoom。输出普通 string/array/Color，不泄漏样式库实例。
2. 私有 Core 模块解析 glyph PBF，校验 dimensions/bitmap/metrics；按 range 装箱成有界 atlas page。
   私有 Scene 资源管理器用 Resource 请求 glyph/sprite，限制并发和 range cache；
   页面在同一 Layer/Context 内共享，LRU 只淘汰不被当前候选/发布状态使用的资源。
   超预算明确诊断，不无限增长，不自动换字体。异步只兑现 CPU 数据并 requestRender。
3. Core 做 metrics-driven 横排、中文断行/显式换行、anchor/justify/offset、joint text/icon collision。
   Scene 汇总 source/style 候选，选定 MVT Point anchors，按 layer priority/sort key 和稳定身份放置；
   同名不同位置保留，buffer 与父子重复去重，文字不按 tile fragment 裁剪。
4. 自有 Renderer 管理 atlas Texture、动态 glyph/icon VA/Buffer、ShaderProgram 和 pick IDs；
   Scene 沿既有有序 command 路径发布，normal update 维护资源，pick/depth 复用快照。
   热帧无变化时不重建排版/GPU；相机变化重投影和 collision；基础 tile 不等待字体才能显示。
5. 公开页接入选定 point layers，保留沿线排除原因；新增本地 Test 标注图集与字体/图标 fixtures。

## API and limits

- 保持五个公共入口；Style 新增只读 glyphs/sprite。
- Layer 增加 maximumSymbolCandidates、maximumGlyphRanges、maximumSymbolRequests；
  默认 2048 / 64 / 4，均 positive integers。统计明确候选/放置/截断、pending/failed resource、
  CPU/GPU glyph bytes；无 symbol 的现有 layer 不创建 symbol runtime。
- tilesLoaded 表示 base 与 symbol 当前需求均已终结；失败单列，不将失败视作成功渲染。
  errorEvent 扩展资源错误，tile 可以 undefined。基础渲染不阻塞。
- 单 Layer 内跨 source/layer collision；不同 Layer 实例互不共享隐式布局。
- 首个 profile 使用横排中文、Latin、普通 RGBA sprite、point + viewport alignment；
  显式不支持属性构造时拒绝。非 Point geometry 的 symbol 有明确诊断。

## Validation and gate

- Core Specs：glyph PBF 合法/畸形、metrics/换行、joint optional/overlap、空间去重与优先级。
- Scene/WebGL Specs：真正 SDF/RGBA pixels、DPR/zoom/倾斜、pick、无 tile 裁字、resource failure、
  warm reuse、stale completion 和 destroy；更新 engine Specs 后先 engine build。
- Test/E2E：确定性中英文与图文组合、邻 tile/LOD、重建、公开 Bright point layers；
  CI 网络完全本地，公开服务仅有限 smoke。
- API/Shader 变更执行 build、types/tsc、release、installed package；
  focused regression 覆盖原 87 Specs 和现有页面，不无依据扩大矩阵。
- 更新 compatibility、review、AgentDocs，完成负责人视觉 gate 后形成独立 checkpoint。

## Execution and current gate

- 负责人报告公开页浅俯角黑带，视觉 gate 继续开放。复现为 OrthographicFrustum，
  width=21061.8889、aspect=1141/1150、camera Z=503.3210、pitch=-5°；
  Z=0 视口两端 eye depth 约 -115544 / 127094，超出页面固定 (1,100000]。
  先修正公开页的投影/比例配置，再补浅俯角实际覆盖、标注和拾取回归；
  不通过 Layer 越过相机裁剪、填色黑边或改变通用 planar controller 来掩盖问题。
  同时复核透视 style zoom 的参考距离，原相机正下方采样会随 pitch 缩短。
- 负责人确认改为透视。实测透视下单级 desired cover 为覆盖远方把柏林近景降到全球级，
  需要在本次回归中修正：透视使用按投影尺寸优先细分的互不包含 quadtree leaves，
  每次仅在整个可见子集合能容纳时替换父 tile，保持 maximumVisibleTiles 硬预算。
  依负责人最新要求，正交/透视统一复用现有 planar imagery/terrain 的 SSE 计算，
  在 `_SceneGISPlanarQuadtree.computeScreenSpaceError` 暴露私有纯计算方法，
  保持原地形算法、计数、加载与缓存不变；MVT 使用 512-pixel nominal error 和 2 CSS pixel 阈值。
  不再保留强制统一 level 的分支；复用现有任意 desired region 的 resident cover、半开裁剪和调度。
  公开页显式使用 64 desired / 128 cached；不提高产品默认预算，不加入 Worker/字节预算等 V3C1 工作。
  补 mixed desired alpha/pick、预算、近远层级和真实浅角画面；不可见标注须在资源/碰撞前剔除。
  共享 SSE 修改额外运行已有 PlanarQuadtree Specs，并以相同 nominal errors 对照两类 selector 的叶集合。

- 独立 Core glyph/layout、Scene asset/placement、Renderer buffer/VA/Shader 与 Layer 集成已实现。
  缺省 batch 按 atlas page，允许 overlap 的层保留 feature 绘制顺序；复用 native pick 派生。
- 新增本地 symbols 页面；公开 Bright/Liberty 各接入 15 个 point layers。
  中文在线数据实测触及默认 64 ranges，公开页显式使用 192；默认产品上限不自动扩大。
- 实际 Bright 存在缺失 icon entry，依据 MapLibre performSymbolLayout 保留文字，并显示
  missingSymbolImages；HTTP/损坏资源继续作为失败，正式语义已补入 ADR-0063。
- 实现偏差：本阶段 buffer 为动态 non-indexed batch，按实际 quads 分配并复用容量，
  不预先加入大负载分块或 Worker，后续由 V3C1 的密集负载证据决定。
- 浅俯角修正后 112 focused vector Specs、14 项既有 planar quadtree Specs 与 8 项页面 E2E 通过。
  在线同一中心、heading、5° 俯角与 12.05 zoom：64 tiles、level 3–14，近景街道恢复，无资源错误。
  正式共享选层与比例决定见 [ADR-0064](../../../Documentation/SceneGIS/Decisions/ADR-0064-vector-perspective-lod.md)。
  验证与风险集中于 [V5A review](../reviews/2026-09-13-v5a-point-symbol-review.md)。
- 负责人在浅俯角修正交付后要求继续实现特殊标注，授权转入 V5B；当前 Agent 据此关闭阶段 gate，
  为已通过验证的 V5A 建立独立 checkpoint。该推进指令不等同于新增逐项视觉验收记录。
