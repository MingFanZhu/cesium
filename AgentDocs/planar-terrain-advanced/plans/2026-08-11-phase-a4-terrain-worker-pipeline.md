# 阶段计划：A4 平面地形 Worker 管线

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`A4-terrain-worker-pipeline`
- 状态（Status）：`completed`
- 负责人角色（Owner role）：`architecture`
- 执行角色（Execution role）：Execution Agent
- 架构评审（Architecture review）：`approved`
- 架构评审人：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- 创建日期（Created）：`2026-08-11`
- 更新日期（Updated）：`2026-08-11`
- Implementation base：`c03f7d9a561a2e94495631339f883b9c11873781`
- Extension plan：
  [SceneGIS 平面高级地形总体计划](2026-08-10-planar-terrain-advanced-extension.md)
- 正式决定：
  [ADR-0027](../../../Documentation/SceneGIS/Decisions/ADR-0027-planar-terrain-worker-tasks-and-delivery.md)
- Related review：
  [A4 approved review](../reviews/2026-08-11-a4-terrain-worker-pipeline.md)
- Related SGP：预计None；A4不修改既有upstream-owned file

## 阶段目标

把已测得的LERC decode与Heightmap regular-grid/skirt position generation从主线程迁移到Cesium现有
TaskProcessor Worker链，同时保持provider/TerrainData/runtime公共分层、normal-render-only GPU mutation、
continuous LOD/fallback、query/pick和资源生命周期。

A4完成后，主线程仍负责network ownership、TerrainData constructor validation、Worker result preflight、
topology/shared index ownership与GPU upload；Worker不是新的terrain状态机。

## 进入基线与源码事实

- A3已由Architecture review和项目负责人Sandcastle人工验收通过，checkpoint为`c03f7d9a56`；工作树clean。
- URL Heightmap provider在fetch Promise continuation中同步`Lerc.decode`，并把decoded samples交给
  `SceneGISPlanarHeightmapTerrainData`再次做finite/min/max scan。
- `_SceneGISPlanarTerrainMesh`同步遍历sample grid，生成surface/skirt `Float32Array`；
  `_SceneGISPlanarTerrain`在normal render中执行该函数与GPU upload，CPU-to-GPU promotion上限为2。
- `TaskProcessor`提供lazy ESM Worker、transferable和serialized error，但不支持单task abort；只能销毁整个
  Worker。A4必须使用generation/attempt隔离active late completion，不能虚报可抢占取消。
- `scripts/build.js#bundleWorkers`已经递归扫描`packages/engine/Source/Workers/**`并生成workspace、release、
  npm和IIFE形态；普通barrel明确排除这些entry。新增一个正确路径的entry无需build/package修改。
- 仓库内109814-byte、257×257 ArcGIS LERC fixture的bounded Node diagnostic为：decode median/P95
  `0.828/1.347 ms`，TerrainData scan `0.511/0.580 ms`，mesh `0.646/2.142 ms`，串行
  `1.844/2.659 ms`；sample clone `0.067/0.101 ms`。它只决定迁移边界，不是性能hard gate。

## 已批准设计

### 1. Worker entry与内部职责

- 新增唯一特殊entry：`packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js`。
- Entry只调用`createTaskProcessorWorker`并导入SceneGIS private handler；所有算法与scheduler主体位于
  `packages/engine/Source/SceneGIS/**`。
- 该新文件不在上游基线，按ADR-0027作为精确SceneGIS-owned Worker entry；不修改`AGENTS.md`默认拥有的
  其他路径，也不授权以后任意增加Worker entry。
- 不修改`scripts/build.js`、`TaskProcessor.js`、package manifests或其他upstream-owned file。

### 2. 两个task kind

`decodeLerc`：

- transfer fetched compressed `ArrayBuffer`；
- 在Worker内保持ADR-0011的single band、dimensions、mask、statistics、NoData和finite validation；
- transfer decoded numeric TypedArray回主线程；
- 主线程仍构造`SceneGISPlanarHeightmapTerrainData`并执行global range检查。

`createHeightmapMesh`：

- TerrainData提供private、一次性的raw typed-array clone + normalized structure payload；原owned buffer保留；
- transfer clone、dimensions、accurate range、effective error与provider minimum到Worker；
- Worker返回tile-local surface/skirt positions与plain finite metadata；
- main thread复用`TerrainProvider` cached topology/indices并验证result，不跨线程传每tile indices。

两项任务使用同一private lazy module-scoped TaskProcessor。不得合并为LERC-specific prepared-mesh sidecar，
不得让provider返回非TerrainData工作产物。

### 3. Terrain runtime状态与帧门禁

- Direct provider request state与mesh task state必须分开；fallback refresh也必须有独立candidate task状态。
- Mesh task只在normal render按blocking fallback、direct、current-view refresh、bridge refresh的既有优先级启动，
  每帧最多两个task start。
- Task completion只存plain CPU result并由既有request-render机制唤醒后续frame；不得在Promise callback中改变
  selection、bounds、GPU、active content、command cache、protection或LRU。
- Normal render result preflight后才允许最多两个GPU promotion；旧active content保留到candidate完整成功。
- Pending decode/mesh、recoverable failure或current revision refresh使current-view`tilesLoaded=false`；terminal
  direct配合stable fallback仍可settle。
- Pick+depth继续重放last normal-render exact command refs，不能schedule/consume Worker或改变debug counters。

### 4. Cancel、stale、error与release

- Existing Request cancellation继续负责fetch；entry在task提交前已stale/cancelled时不提交。
- TaskProcessor 1.144不能逐task取消。Active task在replacement、eviction、detach、destroy后可以完成，但必须因
  generation/attempt不匹配被丢弃；不得恢复TerrainData/mesh/content reference。
- Decode failure保持provider Promise rejection；mesh protocol/validation/upload failure进入既有
  `TileProviderError`、retry和fallback路径，且candidate failure保留last current。
- Input compressed buffer或clone只在transfer成功后归Worker；output samples/positions只在result preflight成功后
  归main-thread data/content。Stale/failure output通过drop reference释放。
- World/tile仍exactly once释放VA、vertex buffer和shared index ref；provider保持caller-owned。
- Module-scoped TaskProcessor属于engine module lifetime，不增加public destroy API或provider ownership。

### 5. Flat、image与其他TerrainData边界

- 无provider路径不得创建browser Worker、task、payload clone或mesh state。
- Image provider仍在main thread执行browser image pixel extraction/close；随后只把Heightmap mesh生成交给Worker。
- Generic custom Heightmap与upsampled fallback使用同一mesh task。
- Unsupported non-Heightmap TerrainData继续走当前failure边界；A4不为A5 quantized-mesh预设task payload。
- A4不改公开provider/data/world API，不改navigation、lighting、Shader、quantized-mesh或normal格式。

## 允许的实现路径

### Product source

- `packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js`（唯一新特殊entry）
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProvider.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarHeightmapTerrainData.js`
- `packages/engine/Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorker*.js`或同职责、唯一basename的private modules
- `packages/engine/Source/SceneGIS/Renderer/_private/_SceneGISPlanarTerrainMesh.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrain.js`

允许在不改变职责的前提下把纯Heightmap decode/mesh helper下沉到SceneGIS Core private，以同时供main与
Worker handler复用；不得形成Core→Renderer反向依赖。

### Specs与交付

- 对应`packages/engine/Specs/SceneGIS/Core|Renderer|Scene/**` focused Specs
- 一个actual TaskProcessor/Worker integration Spec；优先复用现有engine Spec runner与`Build/Workers`
- 既有terrain real-Context Widget Spec的最小扩展（只有行为闭环需要时）
- `scripts/scenegis/verify-planar-packages.mjs`只增加Worker source/build/tar/private边界断言
- `Documentation/SceneGIS/**`、`AgentDocs/planar-terrain-advanced/**`

禁止新增重复Sandcastle、workflow或公网自动化。画面应保持不变，A4默认不要求项目负责人人工验收。

## Source-to-Spec映射

| 风险/契约                       | 最小直接证据                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| LERC Worker validation/transfer | 仓库内257×257真实LERC + 一个代表性invalid mask/statistics/error case               |
| Heightmap mesh Worker           | encoded structure、surface/skirt positions、metadata、shared topology不跨tile复制  |
| Actual Worker URL/protocol      | TaskProcessor真实Worker成功、error serialization、input/output buffer transfer     |
| Runtime async state             | pending readiness、normal-frame task/promotion budget、candidate/current atomicity |
| Cancel/stale/retry              | replacement或destroy late completion、retry后新generation、old result零mutation    |
| Coverage                        | direct与upsampled fallback各一个代表case，无hole/parent-child overlap              |
| Replay/flat                     | depth exact refs零task delta；no-provider零Worker/clone/state                      |
| Lifecycle                       | output/content/VA/shared-index balance；provider non-ownership                     |
| Delivery                        | dev/release Worker文件与installed tarball存在，root/types/API无private入口         |

不建立TypedArray、浏览器、driver、frustum或错误排列的大矩阵。既有未受影响的navigation/content/upstream
suite不重复运行。

## 执行步骤

1. 先固定pure serializable task protocol与result preflight，直接Spec通过后再接TaskProcessor。
2. 增加thin Worker entry和actual Worker integration Spec，确认dev build URL/transfer/error。
3. 把LERC provider decode迁移到`decodeLerc`；保持image、Resource、Request、Credit与public promise语义。
4. 为Heightmap增加private clone payload，迁移mesh CPU生成；main保留topology、result validation和GPU upload。
5. 扩展terrain direct/fallback state、两task启动预算、stale/retry/readiness与normal-render promotion。
6. 跑focused correctness/real-Context/lifecycle，记录同一fixture的diagnostic main/worker timing，不设flaky阈值。
7. 验证build、release、installed package、private/public边界与upstream audit。
8. 回写实际路径、偏差、计数、验证和risks，创建pending review request并停止；不得进入A5。

## 最小充分验证

必须：

- 新pure task、provider、mesh、terrain runtime focused Specs；
- actual TaskProcessor Worker integration；
- 一个受影响的real-Context terrain closure；
- `npm run build`、`npm run build-release`；
- `node scripts/scenegis/verify-planar-packages.mjs`（扩展Worker断言后）；
- changed-scope ESLint/Prettier、AgentDocs/Documentation Markdownlint、`git diff --check`；
- `node scripts/scenegis/audit-upstream-patches.mjs`。

只有public JSDoc/type意外变化时才运行`build-ts`、`build-docs`和`tsc`；预期public inventory保持
engine/widgets/root `24/2/26`。不运行全量CesiumWidget/Viewer/Globe/Scene或重复E2E。

## 完成条件

- 两种获批CPU工作实际通过Worker执行，主线程不再调用同步`Lerc.decode`或遍历完整grid生成positions。
- Provider/TerrainData/World公共API与ownership保持；no-provider/image/custom Heightmap边界明确。
- Transfer、result preflight、pending readiness、retry、stale generation、late completion与resource release闭环。
- Normal-render-only mutation、two-promotion budget、continuous cover、query/pick/depth replay和warm identity不退化。
- Dev/release/npm package均能定位Worker；private entry/handler不进入public exports/types/API。
- Upstream-owned files=`0`、A4 SGP=`0`、generated status=`0`；若实际事实不符，必须在review前明确记录。
- Architecture/code review关闭finding并形成独立中文checkpoint后才能进入A5。

## 风险与停止条件

- 若actual build证明现有Worker glob/output/package链不能承载entry，停止并提交精确失败；不得直接扩大
  `scripts/build.js`或manifest。
- 若TaskProcessor result在destroy/replacement后无法隔离而需要修改upstream cancellation protocol，停止并交回
  Architecture；不得kill共享Worker冒充per-task cancel。
- 若复制/transfer反而形成可重复更大的main-thread峰值，保留测量并缩小迁移范围，不为完成路线图强行Worker化。
- 若Worker mesh改变surface/skirt topology、Float32数值、query或pixel结果，优先修复shared pure algorithm；不得
  接受双实现长期漂移。

## Execution handoff

- 从clean checkpoint `c03f7d9a561a2e94495631339f883b9c11873781`开始。
- A4 implementation、focused验证、delivery audit与Architecture/code review均已完成；由Architecture形成独立
  中文checkpoint后，才从clean base进入A5源码审计。
- Review request：
  [A4 Worker pipeline review](../reviews/2026-08-11-a4-terrain-worker-pipeline.md)。

## 偏差与结果

### 实际设计与状态协议

- 新增一个thin `Source/Workers/SceneGISPlanarTerrainWorker.js`，只把private dispatcher交给
  `createTaskProcessorWorker`。一个module-scoped lazy scheduler复用
  `TaskProcessor("SceneGISPlanarTerrainWorker")`，没有provider/flat work时不会实例化或schedule。
- `decodeLerc`在Worker内完成single-band、dimensions、mask/statistics/NoData/finite/global-range检查，压缩input
  与decoded TypedArray output均transfer；主线程仍验证result shape并构造TerrainData。
- `createHeightmapMesh`从TerrainData-owned raw buffer复制独立TypedArray，Worker只生成normalized XY、relative Z、
  skirt positions与plain metadata；主线程完整preflight后复用`TerrainProvider` cached indices并上传GPU。
- Terrain entry新增独立direct/fallback mesh `NONE/LOADING/RECEIVED/FAILED`状态与generation/token。每normal frame
  最多start 2项、promote 2项；Promise completion只存CPU result/error。Direct data已收到时不会启动无意义的
  fallback refresh，保留`DIRECT > UPSAMPLED > FLAT`原子优先级。
- TaskProcessor无per-task abort。detach/replacement/eviction/destroy只使active task stale，late result drop reference；
  不销毁共享Worker。Malformed Worker result走既有provider error/retry，稳定fallback保留。
- 与计划一致，没有public API、Shader、Worker build seam或upstream patch偏差。Surface Specs只因真实async Worker
  帧序改用bounded polling，不改变产品surface contract。

### 最终 source-to-Spec mapping

| Source / role                                                                                                          | Direct evidence                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js` + `Source/Workers/SceneGISPlanarTerrainWorker.js` | `Specs/SceneGIS/Core/_private/SceneGISPlanarTerrainWorkerTasksSpec.js` 3 cases；其中1项真实TaskProcessor覆盖两个task、input/output transfer与serialized error |
| `Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerScheduler.js` + URL provider                                | URL provider 13 cases；LERC path精确经过private scheduler，image path保持main thread                                                                          |
| Heightmap private clone seam + Renderer mesh finalizer                                                                 | terrain mesh 5 cases；encoded structure、skirt、large offset、source ownership与malformed result                                                              |
| Terrain async mesh state                                                                                               | terrain runtime 12 cases；A4新增2项锁定two-start budget、CPU-only completion、pending readiness、late detach与malformed result retry                          |
| Surface/coverage/replay                                                                                                | Surface/Shader aggregate 33 cases；direct/fallback gate、depth exact refs、flat lazy和warm/resource evidence                                                  |
| Real Context closure                                                                                                   | terrain Widget 1 case；真实Worker、four-child LOD、imagery、depth/query/pick、two-task/two-promotion、warm identity与destroy balance                          |
| Release/package                                                                                                        | `scripts/scenegis/verify-planar-packages.mjs`断言source/Build/release/tar Worker、private declarations/API和24/2/26 public inventory                          |

Focused aggregate为67 cases；A4新增direct unique `it` cases为6（Worker tasks 3、mesh 1、runtime 2），其余为既有
provider/surface/Widget cases的Worker帧序与ownership断言扩展，不重复计为新增case。

### 验证矩阵

| Command                                                                                           | Result                                                                                             |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainWorkerTasks"`                  | Exit 0，3/3；真实TaskProcessor case 0.09 s，Node `util._extend` deprecation warning非A4引入        |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProvider"` | Exit 0，13/13                                                                                      |
| `npm run test -- --includeName "SceneGIS/Renderer/SceneGISPlanarTerrainMesh"`                     | Exit 0，5/5                                                                                        |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTerrain"`                            | Exit 0，12/12                                                                                      |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`                            | Exit 0，33/33 aggregate（Surface + Shader）                                                        |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"`               | Exit 0，1/1；真实Context与Worker closure 0.441 s                                                   |
| `npm run build`                                                                                   | Exit 0；dev Worker output存在                                                                      |
| `npm run build-release`                                                                           | Exit 0；release/IIFE Worker output存在                                                             |
| `node scripts/scenegis/verify-planar-packages.mjs`                                                | Exit 0；installed tarball ESM/CJS、Worker source/build/release、private boundary与broken-entry通过 |
| scoped ESLint / JS Prettier                                                                       | Exit 0                                                                                             |
| affected Markdown Prettier / Markdownlint                                                         | 最终检查见review request                                                                           |
| `git diff --check`                                                                                | Exit 0；仅CRLF conversion notices                                                                  |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                                | Exit 0；current delivery upstream-owned 0、generated status 0                                      |

一次探索性并行启动Terrain与Surface gulp runner时，两个进程同时清理`Build/CesiumUnminified`，其中一个以
Windows `EPERM scandir`退出，未形成suite结果。随后所有focused runner均按串行方式重跑并取得上表通过结果；
该失败不是产品或Spec失败，也未修改工作区所有权。

`build-ts`、`build-docs`和`tsc`未运行：A4没有public JSDoc/type surface变化；package smoke精确复核既有
engine/widgets/root public inventory仍为`24/2/26`，private Worker roles不进入declarations/API。

### Ownership、交付与剩余风险

- Upstream-owned files=`0`；A4 SGP=`0`；`.scenegis/upstream-patches.json`与SGP-0001/0002 unchanged；
  SceneGIS-owned新增patch marker=`0`；generated status=`0`。
- 257×257 planning diagnostic仍是边界依据，不作为跨机器performance gate。真实Worker focused case的0.09 s包含
  cold Worker启动、decode、mesh与serialized-error round trip，不能与纯CPU median直接比较，也不宣称加速比例。
- TaskProcessor 1.144仍不能逐task abort；active stale任务消耗Worker时间后由token丢弃。Module-scoped Worker生命周期
  属于engine module lifetime。Future upgrade必须复核Worker URL、ESM/IIFE、transfer/error和package glob。
- Architecture独立复核完整source/runtime/delivery diff，并串行复跑actual Worker 3/3、terrain runtime 12/12、
  real-Context terrain Widget 1/1、`git diff --check`与official upstream audit；均Exit 0。Review无阻断finding，
  A4状态改为`completed`。
