# ADR-0027：平面地形 Worker 任务与交付协议

## 状态

- Status：`approved`
- Date：`2026-08-11`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- Related plan：
  `AgentDocs/planar-terrain-advanced/plans/2026-08-11-phase-a4-terrain-worker-pipeline.md`
- Related patch：预计无；A4 新增一个不属于上游基线的 SceneGIS Worker entry，不修改既有
  upstream-owned build file

## 上下文与源码事实

当前 `SceneGISPlanarUrlTemplateHeightmapTerrainProvider` 在 `fetchArrayBuffer` 完成后的 Promise
continuation 中同步执行 `Lerc.decode`、mask/statistics/NoData 检查和 sample scan，再构造
`SceneGISPlanarHeightmapTerrainData`。Terrain runtime 收到 data 后，只在 normal render 中同步调用
`_SceneGISPlanarTerrainMesh` 生成 regular-grid/skirt `Float32Array`，随后上传 GPU；每帧最多执行两个
CPU-to-GPU promotion。

本阶段使用仓库内 `Specs/Data/ArcGIS/9_214_379/tile_9_214_379.tile` 做一次有边界的 Node diagnostic。
该 tile 为 109814 bytes、257×257 samples；同一进程 warm 后的代表结果为：

| 工作                        | Median   | P95      |
| --------------------------- | -------- | -------- |
| `Lerc.decode`               | 0.828 ms | 1.347 ms |
| TerrainData scan/validation | 0.511 ms | 0.580 ms |
| regular-grid + skirt mesh   | 0.646 ms | 2.142 ms |
| decode + data + mesh        | 1.844 ms | 2.659 ms |
| 257×257 sample buffer clone | 0.067 ms | 0.101 ms |

这些数字只用于确定任务边界，不是跨机器 hard gate。它们说明当前单 tile 同步工作足以占用可感知的
主线程预算，而把 TerrainData-owned sample 复制给 Worker 的成本明显较小。A4 因此迁移 LERC decode
和 mesh position generation，但保留必要的 main-thread result preflight 与 GPU upload。

Cesium 1.144 的 Worker 事实为：

- `TaskProcessor` 按相对于 `Workers/` 的 module name 延迟创建 ESM Worker，使用
  `scheduleTask(parameters, transferableObjects)`；
- `createTaskProcessorWorker` 负责 message id、error serialization 和 result transfer；
- `TaskProcessor` 没有 per-task abort。`destroy()` 会终止整个 Worker，不适合用来取消一个 tile；
- `scripts/build.js#bundleWorkers` 自动扫描 `packages/engine/Source/Workers/**`，同时生成 workspace
  `Build/Workers`、release Worker 和 IIFE inline Worker；
- `workspaceSourceFiles.engine` 明确从普通 public barrel 排除 `Source/Workers/**`，npm package 又包含
  `Source` 与 `Build/**`。因此新增一个正确命名的 Worker entry 不需要修改 build script、public barrel
  或 package manifest。

## 决策

### 一个 entry、两个独立任务

A4 新增唯一 entry：

```text
packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js
```

该文件只把 SceneGIS-owned private task handler 交给 `createTaskProcessorWorker`。实际 decode、mesh、
validation 和 scheduler 实现在 `packages/engine/Source/SceneGIS/**`；不得把可复用产品逻辑堆入 Worker
entry，也不得复制 Cesium geodetic terrain Worker。

同一 entry 接受精确的 private task discriminator：

1. `decodeLerc`：输入 transferred compressed `ArrayBuffer`、expected dimensions 与 configured global
   height range；Worker 保持 ADR-0011 的 single-band、dimensions、mask、statistics、NoData、finite
   sample 语义，并 transfer decoded numeric TypedArray 回主线程。
2. `createHeightmapMesh`：输入 TerrainData-owned raw numeric buffer 的独立 clone、normalized structure、
   dimensions、accurate height range、effective geometric error 与 provider minimum height；Worker 生成
   tile-local regular-grid + skirt positions 和有限 metadata，并 transfer position buffer 回主线程。

不把两个任务合成一个 provider-specific `decodeAndMesh`。这样 generic Heightmap provider、image
payload 和 upsampled fallback 都能使用同一 mesh task；Provider 仍只返回 TerrainData，不附加 hidden
mesh sidecar，也不让 renderer 接触 URL/payload contract。

### Main-thread rehydration 与 ownership

- LERC fetch result只由provider Promise拥有；task开始时可transfer compressed buffer。Worker返回的sample
  TypedArray由新`SceneGISPlanarHeightmapTerrainData`接管，constructor继续扫描finite/min/max，World global
  range preflight不跳过。
- Existing TerrainData必须保留自己的raw buffer供query/upsample。Mesh task只transfer一个独立clone；原
  TerrainData永不被neuter或移交Worker。
- Mesh Worker只返回positions与plain finite metadata。Regular-grid/skirt indices继续由main-thread
  `TerrainProvider` topology cache/ref-counted GPU index buffer拥有，不逐tile跨线程复制。
- Main thread必须验证task kind、TypedArray type/length、vertex counts、reference/min/max/skirt metadata与
  topology key，再允许normal-render promotion。Worker output不是无条件可信的GPU input。
- Request、provider、TerrainData object、Credit、waterMask、World/tile、Context、Buffer、VertexArray和
  DrawCommand均不得进入Worker payload。

### Scheduling、状态和取消

使用一个private、lazy、module-scoped `TaskProcessor("SceneGISPlanarTerrainWorker")`，与Cesium官方
Heightmap Worker的进程级复用方式一致。它不是public API或per-World resource；没有任务时不会创建
browser Worker，flat/no-provider path也不得schedule task。

Provider的network scheduling `undefined`、Request cancellation和Promise rejection语义保持。LERC fetch
完成后继续等待decode task；decode error仍表现为原request Promise rejection并进入既有
`TileProviderError`路径。

Terrain runtime为direct/fallback mesh增加独立pending/received状态：

- task只能在normal render按既有blocking/direct/refresh优先级启动，每帧最多启动两个；
- Promise completion只保存当前attempt/generation的CPU result并请求后续frame，不做selection、GPU、
  bounds、command、LRU或active-content mutation；
- GPU promotion仍在normal render且每帧最多两个，旧active fallback在candidate成功前保持；
- pending worker task参与current-view `tilesLoaded=false`；terminal failure配合稳定fallback仍可settle；
- replacement、eviction、detach和destroy先取消现有network Request并使task token stale。尚未提交的工作不再
  提交；已进入TaskProcessor的同步CPU task无法被1.144逐task中止，其late result必须被generation/attempt
  丢弃且不得恢复引用或资源。

A4不伪造active task cancellation，也不为此修改`TaskProcessor`。若未来确需可抢占的长任务，必须以新的
Worker协议/ADR设计cooperative chunking或独立Worker ownership。

### 错误与生命周期

- Worker input/protocol/result错误使用`DeveloperError`；LERC payload/decode failure保持request rejection；
  mesh failure进入既有terrain provider error/retry/fallback状态机。
- Decode或mesh task失败不得破坏last-successful active content、command replay或TerrainData ownership。
- Stale/failed result中的transferred buffers只通过丢弃reference交给GC；它们不是destroyable GPU resource。
- World/tile destroy仍exactly once释放content、VA和shared index references。Module-scoped TaskProcessor由页面
  module lifetime持有，不新增public destroy责任，也不被caller-owned provider拥有。

## 构建、所有权与发布

`packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js`不在上游基线中，作为本ADR明确列出的
SceneGIS-owned特殊资源入口；该例外不自动授权其他`Source/Workers`文件。其余实现保持在既有
SceneGIS-owned roots。

A4预计不修改`scripts/build.js`、package manifests或其他upstream-owned files，因此
upstream-owned files=`0`、A4 SGP=`0`。Development/release build和installed-tarball smoke必须证明：

- source entry与`Build/Workers/SceneGISPlanarTerrainWorker.js`存在；
- dev/release runtime能通过普通Cesium base URL加载该Worker；
- entry/private handler不进入engine/root public exports、`.d.ts`或API HTML；
- IIFE inline Worker仍能按basename注册该entry。

若实际构建证明现有自动发现链不足，Execution必须先记录精确失败并交回Architecture；不得预防性修改
build script或package manifest。

## 不采用的方案

### 一个LERC-specific combined decode+mesh任务

不采用。它会让provider知道renderer的tile error/skirt协议，或要求TerrainData携带private prepared mesh，
从而破坏generic provider/data边界。一次小型sample clone的测量成本不足以支持这种耦合。

### Transfer TerrainData-owned原buffer

拒绝。它会neuter resident TerrainData，破坏query、upsample、retry和caller-visible data semantics。

### 复用官方`createVerticesFromHeightmap`

拒绝。它依赖Ellipsoid、Rectangle、HeightmapTessellator、TerrainEncoding、horizon和geodetic bounds。
SceneGIS只复用TaskProcessor通信方式与坐标无关的regular-grid topology helper。

### 修改build脚本扫描`Source/SceneGIS/Workers`

当前不采用。现有`Source/Workers/**`入口已经完成所有目标构建/发布形态；增加新的glob、outbase、sideEffects
和URL规则会制造没有收益的upstream seam。

### Worker完成GPU创建或直接改变terrain entry

拒绝。Worker没有Context，且async completion mutation会破坏normal-render-only、command replay与资源所有权。

## 验证与升级检查点

- Pure task Specs锁定真实本地LERC、mask/error、encoded Heightmap、SW→NE grid、skirt和transferable输出。
- Actual TaskProcessor Spec锁定dev Worker URL、error serialization和input/output ArrayBuffer transfer。
- Terrain runtime Specs锁定pending readiness、两任务启动预算、cancel/stale/retry/replacement和fallback continuity。
- Representative real-Context closure锁定最终pixel/depth/query、warm command/resource identity和destroy balance；不
  建立无收益的浏览器/driver矩阵。
- Build、release和installed package smoke锁定Worker source/output/private边界；A4没有新的public API。
- 性能只复测同一257×257本地fixture，记录main-thread synchronous work和worker round-trip，不使用跨机器
  percentage hard gate。

Cesium升级时复核`TaskProcessor`message/error/transfer semantics、ESM Worker支持、worker module prefix、
`bundleWorkers` entry/output/IIFE逻辑、npm package files/sideEffects、LERC API，以及regular-grid/skirt topology。
