# ADR-0067：独立矢量瓦片 Worker 准备

## Status and context

- Status: `accepted`
- Date: `2026-09-13`
- Plan: [V3C1B](../../../AgentDocs/vector-tiles/plans/2026-09-13-v3c1b-worker-preparation.md)
- Related: [ADR-0027](ADR-0027-planar-terrain-worker-tasks-and-delivery.md)、[ADR-0063](ADR-0063-point-symbol-renderer.md)
- SGP: None

负责人确认新加载瓦片的主线程准备需要迁往 Worker。当前独立 MVT pipeline 的 decode、geometry
和 symbol preparation 均同步；只限制 tile 数或扩大缓存不能限制单个新 tile 的长任务。
MapLibre 5.24.0 的 VectorTileWorkerSource / WorkerTile / performSymbolLayout 证明数据准备、
依赖解析与视图 placement 可分离；SceneGIS 只参考职责，不复用其 runtime 或复制第三方实现。

## Decision

新增精确 owned entry `packages/engine/Source/Workers/SceneGISVectorTileWorker.js`，只包装
SceneGIS Core private handler。它沿用 TaskProcessor message/error/transfer 与现有 bundleWorkers
自动发现，不修改上游构建、package 或 experimental MVT。实际算法保持 SceneGIS/Core 单向依赖。

Layer 使用两个 owned lazy Workers，准备与待上传 tile 合计最多两块。
Source 默认 decoded API 使用模块共享的 lazy 双 Worker 池，与页面同生命周期，不由借用它的 Layer 销毁。
Layer raw 请求绕过该共享池；显式同步 decode 工具仍可使用。
Worker 准备 decode、style/filter、triangulation/stroke、combine、
high/low position encoding、整数 zoom symbol anchors，以及 glyph decode/pack 与 normalized shaping。
主线程拥有 Request、Scene/World、Context、pick IDs、GPU 和当前视图 placement；这些对象不跨线程。
异步完成只发布 CPU result；normal render 才上传并更新 cover，pick/depth 重放已发布命令。

Source 的默认 requestTile 仍返回异步 decoded Data；显式 raw 形式供 Layer 使用，使原始 MVT
只在准备 Worker 解码。自定义 source 返回 decoded data 仍可准备，不能 detach caller-owned buffers。
同步 SceneGISVectorTile.decode 继续作为纯数据工具 API，地图 runtime 不在主线程调用它。

Tile 原始 payload 由按 tile 数量限制的 resident cache 持有，独立副本 transfer 给准备任务；Worker 编译一次
固定 style 后复用，结果直接 transfer packed buffers。主线程只验证协议/布局与恢复 pick identity，
不重新做三角化或几何合并。几何或整数 layout 失效时重新解码，当前不维护 Worker 内 decoded tile cache，也没有总驻留字节硬限制。
视图连续变化合并为最新待处理 revision，旧已发布 cover 保留到新批次完整。
已提交 task 不可抢占，单 tile cancellation 隔离结果；整个 Layer destroy 才终止其 owned Workers。

符号资源依赖仍由当前可见候选请求，避免远景 glyph 放大。Normalized shaping 与当前 fractional
size 分离，主线程使用当前 camera 投影、沿线方向与全视图碰撞；不发布滞后相机的屏幕布局。
Normalized shaping cache 记录 glyph/sprite generation，资源重载后不复用旧 atlas 排版。
Worker 同时整理文本的唯一 font/range dependencies，主线程只按可见候选合并，不逐帧重复扫描字符。
当前视图 placement 复用 anchor/layout/scale/keep-upright 相同的世界字形几何与 high/low 编码，
viewport-aligned quad 复用 CSS 布局；碰撞和屏幕投影仍在当前帧计算，不降低布局频率。
符号顶点使用逐批次可复用的 typed staging buffer，容量按需增长，GPU 发布和失败原子性保持。
fitToUnsignedShortIndices 的拆分输出必须在自有 Worker helper 中按 componentDatatype 恢复为 typed arrays，
才能计算字节预算和 transfer；不假定 Cesium helper 的两个分支返回相同数组类型。
GPU 上传分帧受默认 4 ms / 4 MiB 时间/字节预算约束，单个不可分割的上传操作可超过软时间预算，不能承诺浏览器实时调度。
任务池监听 TaskProcessor owned native Worker 的 error/messageerror，入口或通信失败会拒绝活动与排队任务并释放池；
该私有句柄依赖纳入升级审计。错误显式上报并保持最后成功内容，不引入 main-thread fallback 或自动 retry。

## Delivery and verification

现有 Source/Workers glob 自动覆盖 workspace Build/Workers、root dev/release 与 IIFE inline；
barrel 排除 Worker entry，npm files 包含 Source/Build。该精确 owned 例外不授权其他新 Worker 路径。
验证真实 TaskProcessor transfer、生命周期、当前 view readiness、覆盖/alpha/pick、冷加载性能及
installed package 资源 URL；不提交生成结果，不将 flat 资格扩大为 terrain/Globe。
升级时重新检查 TaskProcessor 异常/传输/销毁、bundleWorkers 和 npm 资源边界。
