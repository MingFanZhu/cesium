# Phase Plan: V3C1B 异步矢量准备

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Owner / reviewer: 当前 architecture/execution Agent，自审
- Created / Updated: `2026-09-13`
- Entry checkpoint: `413b7ffcc6`，V3C1A 按负责人推进授权关闭
- Architecture review: `approved`，负责人明确要求迁移 CPU 准备到 Worker
- ADR: [ADR-0067](../../../Documentation/SceneGIS/Decisions/ADR-0067-vector-worker-preparation.md)
- SGP: None，预计复用现有 Worker 构建链

## Source facts and reference

当前 Source 和公开页在 fetch continuation 同步 decode；Layer createBatches 在 normal update
完成全 tile 的 geometry.build、combine、encode 和 GPU upload。每帧一块不能限制单 tile 长任务。
Symbols 在同一线程完成 filter/layout、line anchors、glyph decode/pack、shaping 和 placement。
现有缓存减少重复计算，但未迁移首次加载工作。

已只读审计负责人提供的 MapLibre 5.24.0：`src/source/vector_tile_worker_source.ts` 在 Worker
下载、decode 并调用 `WorkerTile.parse`；`src/source/worker_tile.ts` 执行 bucket.populate、收集
glyph/image dependencies、atlas 和 performSymbolLayout；视图 placement 与 GPU upload 留在主线程。
仅参考职责，不复制 Actor、网络层或整个 renderer。Cesium TaskProcessor / createTaskProcessorWorker
与 scripts/build.js 的 ESM、IIFE、npm 自动发现链已审计。

## Implementation

1. 新增唯一 `Source/Workers/SceneGISVectorTileWorker.js` 薄入口。算法、协议、池与结果校验保持
   SceneGIS Core。Layer 拥有有限、lazy Worker 池，任务完成只保存 CPU 状态；destroy 释放池。
2. Source requestTile 保留默认 decoded Promise；增加显式 raw 请求参数供 Layer 使用，避免解码数据
   往返克隆。覆盖 requestTile 返回 decoded data 的现有 source 仍可消费，不能转移 caller-owned buffer。
   网络继续使用 Cesium Resource / Request；异步 decoded API 也使用 Worker。
3. Worker 处理 MVT、样式求值、triangulation/stroke、combine/encode 与整数 zoom 的 symbol anchors。
   返回 transferable typed buffers 和 plain metadata；主线程只映射 pick IDs 与上传。
   原始 payload 在 tile cache 中保留供失效重建，独立副本 transfer，缓存淘汰时释放。
4. Glyph decode/pack 与 normalized text/icon shaping 使用同一 Worker 能力；只请求当前可见候选依赖。
   fractional size 缩放、屏幕投影、keep-upright、去重/碰撞与最终 quad publication 使用当前相机，
   不用异步相机快照冒充当前结果。旧同内容标注在新依赖准备时延续现有保留语义。
5. 限制在途准备任务、待上传结果与主线程每帧上传时间/字节；分批准备后整 tile 原子切换。
   signature/token 隔离过时结果，不重试终态错误，不在 pick/depth 推进调度，不用终止共享 Worker
   伪装单 tile 抢占。源覆盖、半开区域、样式层序、自动 pick 派生保持。
6. 公开 Test 页面去掉主线程 decode 包装，保留 native FPS 与加载/CPU 诊断。不新增样式或 terrain 支持。

## Validation and exit

- Pure / real TaskProcessor Specs：真实 MVT 与 glyph fixtures，transfer、geometry/identity、layout，错误。
- Layer / Symbol Specs：异步 pending、最新 revision、旧 cover、取消/eviction/destroy、pick 与上传预算。
- 本地 Test E2E：公开页 fixtures、样式图集/标注/沿线，冷加载和移动中的 Worker 使用、无错误/缺图。
- 同一数据/视图前后采样 cold-load 主线程时间；不把 Worker round-trip 等同主线程阻塞或跨机器 hard gate。
- 完整 build / declarations / tsc、release 与 installed-tarball Worker URL/transfer 验证；生成物不提交。
- 回写 review、正式契约与索引，交付负责人浏览器验收；阶段完成后独立 checkpoint。

## Current handoff

实现、142 项 Specs、11 项 E2E 与 build/types/release/installed-package 技术资格已完成；
状态保留 active，等待负责人浏览器验收。最新结果和剩余事项见
[V3C1B review](../reviews/2026-09-13-v3c1b-worker-review.md)。

实际边界：Layer 默认两个 Workers；4 ms / 4 MiB 为 batch 粒度软上传预算，
缓存仍按 tile 数控制，没有总驻留字节硬限制。原始 payload 缓存 + stateless tile task
避免 Worker 间 cache ownership 复杂度，但几何/整数 layout 失效会重复 decode。
Source 默认 decoded 请求使用独立的模块共享 lazy 池；地图 raw 路径不创建该池。
主线程 current-view placement/pick/GPU 仍可能成为热点，冷启动完整就绪未更快。
没有偏离 flat/direct-vector 与单根 matrix 边界；没有复制 MapLibre renderer 或引入上游修改。

## Owner motion feedback

负责人反馈当前浅角持续旋转/拖动约 20 FPS，V3C1B gate 保持打开，不激活下一阶段。
实际页面 55 visible tiles、1578 commands、1187 candidates；60 帧 pan/rotate 的 CPU median 约 36 ms，
几乎没有新 Worker 任务。Profiler 指向 symbol projection/bounds、appendQuad、update 与 GC。

本轮继续处理 R07：保留每帧相机投影/碰撞，缓存同 anchor/layout/scale 的地图字形几何与编码，
复用 viewport-aligned 排版结果；使用线性 bounds 与可复用 typed staging buffer 减少展开/临时数组。
另修复实际出现的密集 tile Worker 协议错误：fitToUnsignedShortIndices 拆分分支返回普通 arrays，
在自有 Worker helper 中按 attribute datatype 转回 typed buffers 后计算 bytes/transfer。
用超过 65535 vertices 的真实 Worker Spec、既有画面/pick/lifecycle、当前相机同轨迹前后采样验收。

已实施并通过 143 项 Specs、8 项相关 E2E、release 与 package Worker 回归。
Worker 还提前整理每个文本的唯一 font/range dependencies，避免交互时逐字符重建。
实际应用浏览器最终 pan/rotate CPU median 为 22.0/22.8 ms，之前约 36 ms；GC 明显减少。
完整测量条件、修复的两块失败 tile 与未解决的持续 60 FPS 边界见当前 review。

负责人随后明确要求实施持久 placement、碰撞代理与静态/动态 buffers 三项交互优化。
V3C1B 按继续授权关闭阶段 gate，保留上述实际性能限制；先形成 Worker 独立 checkpoint，
再激活 V3C1C。R07 的交互部分转入后继阶段，通用字节硬上限与 GPU 吞吐资格仍待后续评估。
