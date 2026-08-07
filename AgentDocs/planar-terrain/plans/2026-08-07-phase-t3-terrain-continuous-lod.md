# T3 阶段计划：平面地形连续 LOD、上采样与缓存

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- Parent extension：
  [SceneGIS 平面地形总体计划](2026-08-07-planar-terrain-extension.md)
- 负责人角色（Owner role）：`architecture` / `execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-07`
- 更新日期（Updated）：`2026-08-07`
- Planning checkpoint / implementation diff base：
  `e0959172e84d4e49c254b38fa45184027c22e39d`
- 相关讨论（Related discussions）：项目负责人与 Architecture Agent 已一次性审阅并批准本阶段
  完整设计；没有独立 open discussion
- 相关 ADR：
  - [ADR-0003：平面 Surface Runtime、LOD 与缓存](../../../Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md)
  - [ADR-0005：平面栅格影像运行时与图层合成](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)
  - [ADR-0007：平面地形 Core 契约](../../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)
  - [ADR-0008：平面地形 Mesh、Surface 集成与最小加载](../../../Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)
  - [ADR-0009：平面地形连续 LOD、上采样与缓存](../../../Documentation/SceneGIS/Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md)
- SGP：无；T3 禁止修改 upstream-owned file
- 相关评审（Related reviews）：实现完成后由 Execution Agent 创建
  `../reviews/2026-08-07-t3-terrain-continuous-lod.md`

## 阶段目标

把 T2 的独立 ideal-tile flat/direct replacement 扩展为真正连续的异步 terrain LOD runtime：

- desired LOD 与实际 render cover 分离；
- 以 ancestor/direct-parent upsample 或 terminal flat 保持完整 coverage；
- 使用完整四子门禁原子替换父子层级；
- 主动消费 availability metadata 和 direct-parent child mask；
- 使用 terrain skirt 遮蔽 mixed-LOD edge crack；
- 对 request、TerrainData、fallback、CPU mesh、VA 与 shared index 建立 deterministic cache 和
  exactly-once lifecycle；
- 保持 imagery single-command drape、normal-render-only mutation、depth replay 和当前 view
  `tilesLoaded` 语义。

T3 只建立 correctness-first 的 continuous terrain runtime。它不增加 terrain query/picking、公开
provider、Sandcastle、normal/lighting、camera collision、Worker 或正式 byte budget。

## 进入基线与依赖

- 分支：`feature/planar-terrain`。
- implementation diff base：
  `e0959172e84d4e49c254b38fa45184027c22e39d`。
- T2 已 architecture/code review、提交并保持 clean checkpoint；执行 Agent 必须从该 commit 的
  当前工作树开始，不把 T1、planar-world 或 merge-base 当作本阶段 diff base。
- T1 已固定 provider/data/Heightmap 的公共契约；T3 不悄然把 Heightmap 改成 Provider 唯一返回
  类型，也不把 runtime upsample 提升为公共方法。
- T2 已固定 tile-local XY/relative Z、三维 bounds/SSE、caller-owned provider、single Context、
  terrain/imagery single opaque command 和 Z=0 public world picking。
- P4/P5 已固定 normal render command cache 与 pick+depth exact replay；T3 不能通过 depth pass
  重新运行 selection 或加载状态。

## 当前源码事实

### Terrain runtime

- `_SceneGISPlanarTerrain.js` 当前每 tile 只有一个五态 entry：`UNLOADED`、`LOADING`、
  `RECEIVED`、`READY`、`FAILED`。
- `prepare(context, idealTiles, frameNumber)` 对 ideal tiles 依次请求、同步建 mesh/GPU，并以
  `READY/FAILED` 判断 terrain readiness。
- `getTileDataAvailable=false` 直接进入 known-unavailable FAILED；尚未调用
  `loadTileDataAvailability` 或 parent `isChildAvailable`。
- provider replacement 释放全部 tile entry 和全部 shared index buffer；tile eviction 释放 VA，
  但 index buffers 直到 provider replacement/world destroy 才统一销毁。
- Request 使用与官方 Globe terrain 相同的 `RequestType.TERRAIN`、`throttle:false`、
  `throttleByServer:true`，provider 返回 undefined 时下帧重试。

### Quadtree、Tile 与 Surface

- `_SceneGISPlanarQuadtree.js` 使用 implicit stack 从 root 遍历，只有 `_idealTiles` 和
  `_protectedKeys`；readiness 不参与 selection，LRU 只按 unprotected tile count trim。
- `_SceneGISPlanarTile.js` 没有 parent/child object links，但 address 可以由 level/x/y 确定；tile
  持有稳定 extent、OBB、command sphere、modelMatrix、terrain entry 与 imagery bindings。
- `_SceneGISPlanarSurface.js` 先选择 ideal tiles，再让 terrain 与 imagery prepare 同一数组，
  每 tile 从 shared flat quad 或 READY terrain VA 中二选一。
- Pick+depth pass 重放 `_renderCommands` 的精确 refs；normal render 前清空 cache，provider
  replacement/detach 也先清空 cache。

### Heightmap、mesh 与可复用上游 helper

- `SceneGISPlanarHeightmapTerrainData.interpolateHeight` 与 mesh 都使用 SW→NE triangle surface，
  已支持完整米制 extent 和大 EPSG:3857 X/Y。
- Heightmap private `_getSample` 只供现有 mesh builder 读取精确 decoded samples；public
  `SceneGISPlanarTerrainData` 已有 generic `interpolateHeight`、credits、waterMask、
  `wasCreatedByUpsampling` 和 `isChildAvailable`。
- `_SceneGISPlanarTerrainMesh.js` 当前只生成规则 grid vertices，并复用
  `TerrainProvider.getRegularGridIndices`，没有 skirt vertices 或 edge metadata。
- Cesium `TerrainProvider.getRegularGridAndSkirtIndicesAndEdgeIndices` 只依赖 width/height，返回
  regular+skirt indices、四组固定方向 edge indices 和 `indexCountWithoutSkirts`，可以窄复用。
- 官方 `HeightmapTerrainData.upsample` 和 `GlobeSurfaceTile` 只借鉴 direct-parent upsample、
  availability 和父级保底原则；其 ellipsoid、Rectangle、TerrainMesh、Worker 与 Globe traversal
  不能进入 SceneGIS runtime。

### Worker、Shader 与构建

- 当前 terrain vertex shader 已以 tile-local `position.xy + 0.5` 生成 imagery UV；skirt 和
  upsample mesh 不需要新 attribute 或 shader variant。
- SceneGIS Worker 的入口、输出、URL、transferable 和 npm/release 行为仍未形成通用方案；T3
  没有 measured blocker，不触发该首次构建决定。
- private `_SceneGIS*.js` 普通模块可以由源码直接 import；不得依赖生成 barrel，也不得将 private
  role 当作 public declaration。

## 已确认设计

完整长期决定以 ADR-0009 为准。本节将其转换为可执行边界。

### 1. Quadtree selection result

Quadtree 每个 normal frame 至少维护：

- `desiredTiles`：现有 visibility/SSE traversal 得出的目标 leaves；
- `loadTiles` 或等价的 blocking/desired load queues；
- `renderTiles`：terrain prepare 后按 readiness 重新形成的实际 command coverage；
- `protectedKeys`：render、desired、ancestor chain、bridge children 与 promotion source 的并集。

可以继续使用 implicit address 和 tile Map，不要求建立常驻 child object arrays。需要 parent、children
或 ancestor 时通过 level/x/y 计算并复用 `getOrCreateTile`。不得创建与现有 quadtree 平行的第二套
surface tree。

Desired traversal 必须保留 T2 的：

- exact planar extent 与三维 closed-distance SSE；
- provider effective geometric error；
- perspective、orthographic、large-coordinate 与 below-terrain camera 行为；
- no-provider selection 和 warm-allocation fast path。

### 2. 四子门禁与 render cover

每个 refined parent 的四个直接 children 都有 renderable active content 后，parent 才从 render
cover 退出。门禁决策必须在 command submission 前完成：

- 四子未齐：提交 parent，不提交任何 descendant；
- 四子齐备：不提交 parent，只递归提交 visible child subtrees；
- culled sibling 可以不提交 command，但仍需有 fallback，保证下一视角的 coverage 稳定；
- deeper child 门禁可以独立满足，允许相邻 branch 具有不同 LOD；
- 一帧内任何 XY region 不得同时出现在 parent 与 descendant commands 中。

若所有更细内容 terminal 且 fallback promotion 失败，允许稳定 ancestor cover 成为 settled 结果，
不能以达不到 desired leaf 为由永久 false。

### 3. Entry、content 与 revision

现有单一 `state/terrainData/mesh/vertexArray` 必须拆成职责等价的 direct 与 fallback content。具体
object 字段名可以根据实现简化，但必须可独立表达：

- direct state：`UNLOADED`、`AVAILABILITY_LOADING`、`LOADING`、`RECEIVED`、`READY`、
  `UNAVAILABLE`、`FAILED`；
- fallback state：`NONE`、`QUEUED`、`READY`、`FAILED`；
- active source：`DIRECT`、`UPSAMPLED` 或 `FLAT`；
- request/availability attempt 与 provider generation；
- active/source revision；
- direct/fallback TerrainData、CPU mesh、VA 与 shared-index reference；
- current-view touched/protected/last-used evidence。

Active source 固定优先 `DIRECT > UPSAMPLED > FLAT`。Direct READY replacement 只在 normal
render 生效；先使 command 不再引用旧 content，再 exactly once 释放旧 fallback。

Fallback 是 source 的独立 Heightmap snapshot。Parent revision 更新时，旧 child fallback 保持
coverage，新 fallback blocking build 完成后原子替换。Direct READY child 不再跟随 parent revision。

### 4. Provider maximum level 与 availability

T2 的 attachment preflight 不再要求 `provider.maximumLevel >= world.maximumLevel`。T3 改为：

- `provider.maximumLevel` 是 `0..tilingScheme.maximumSafeLevel` 内的整数；
- World 可以选择到自己的 `maximumLevel`；
- `level > provider.maximumLevel` 的 direct state 直接为 `UNAVAILABLE`，不得调用 availability
  metadata 或 geometry request，只使用 upsample/flat fallback；
- provider 的 geometric-error curve 只读取到其 `maximumLevel`；更深层保持最后一个 provider
  error 不变，因为 upsample 不创造新精度，再与 ADR-0008 nominal error 取最大值；最终数组仍
  覆盖 world maximum level、finite、non-negative、non-increasing。

在 provider level 范围内按 ADR-0009 顺序处理：provider availability、非 upsample direct-parent
child mask、一次 metadata load、unknown optimistic geometry request。

- Parent child mask 只在 provider 返回 undefined 时补充判断，不覆盖 provider explicit true/false；
- upsampled parent 的 mask 不参与 direct availability；
- metadata Promise resolve/reject、sync throw、non-Promise return 都必须进入 generation/error
  boundary；
- root false 作为 provider contract error 报告并使用 terminal flat root；
- non-root known unavailable 不报告错误。

### 5. 私有 Heightmap upsampler

优先新增一个 SceneGIS Core private helper，保持纯 CPU、无 Scene/Renderer/DOM 依赖。它接收：

- source `SceneGISPlanarTerrainData`；
- source extent/address；
- direct child extent/address。

它只允许 direct child，一次跨一级，使用 source `interpolateHeight` 产生 source width/height 的
`Float64Array` Heightmap：

- NW-origin row-major；
- SW→NE surface；
- `createdByUpsampling=true`；
- `childTileMask=0`；
- source credits 保留；waterMask 暂不复制；
- sample、allocation length、extent/address 必须有效且 finite。

若 generic TerrainData 没有稳定 width/height，当前 private adapter 可以只接受 T1/T2 已支持的
Heightmap concrete data，但不得改变 Provider public return contract。Upsampler 和 private seam 不得
进入 root `.d.ts` 或 API HTML。

### 6. Promotion queues

Normal render 先消费 promise mailbox/state，再处理最多两个 CPU-to-GPU promotions：

1. blocking root/ancestor/four-child fallback；
2. visible desired direct RECEIVED；
3. current-view stale fallback refresh。

同优先级按 level、camera distance、tile key 保持 deterministic。一次 promotion 可以完成 upsample、
mesh、vertex buffer、shared index acquire 和 VA。若第一个 promotion 已消耗明显时间，T3 仍只以
固定数量限制为 correctness contract，不引入不可测试的 private wall-clock threshold。

请求调用本身不受两个 promotion 限制，继续由 provider/RequestScheduler 的 server throttle 控制。
不得引入 TaskProcessor、Worker、transferable 或 build resource。

### 7. Skirt mesh 与 dual bounds

Terrain mesh builder 改用 regular-grid + skirt topology：

- surface grid vertex/local XY/relative Z 与 T2 完全一致；
- 按上游返回的 west/south/east/north edge order 追加 skirt vertices；
- 每个 skirt Z 使用 `max(edgeHeight - 4 * effectiveError, provider.minimumHeight)`；
- mesh 明确记录 surface vertex/index count、full vertex/index count、surface min/max、command
  skirt min、reference height 与 byte lengths；
- topology key 至少包含 width/height/skirt flag。

Tile selection OBB 与 command sphere 分工：

- selection OBB 不包含 skirt；
- direct pending 时保持 provider global range 与 active fallback 的并集，避免未来 direct terrain
  被当前低 fallback bounds 裁掉；
- stable direct/terminal content 可以收紧 surface range；
- command sphere 包含 skirt 和实际 active geometry；
- 更新复用 OBB、sphere、matrix object，不形成逐帧 allocation。

不实现 neighbor stitching、2:1 balancing、geomorph、corner cap 或新 shader。若已有上游 helper 的
corner topology 在代表 WebGL fixture 中出现真实孔洞，Execution Agent 必须先暂停并提交证据，
不能自行扩展为另一套 index generator。

### 8. Surface 帧顺序与 imagery

Normal render 顺序必须改为：

1. preflight 与 command cache clear；
2. desired/load traversal；
3. terrain async/request/promotion advance；
4. actual render-cover resolve；
5. imagery prepare(actual render tiles)；
6. command/credit/readiness submission；
7. endFrame LRU trim。

Imagery binding 从 ideal tiles 改为 actual render tiles。新 child terrain 的 imagery 可以使用 ADR-0005
已有 ready ancestor fallback；不得为了父级 imagery 同时绘制 parent terrain，也不得增加第二
imagery plane。

Command 继续 tile-owned 并尽量复用 identity。Active terrain 使用 indexed triangles；terminal
flat 使用 shared unit quad。Depth pass 只重放 normal-render cached command references，所有 terrain
debug counters、selection result、queue、protection 和 resources 都必须零 delta。

### 9. Cache 与 lifecycle

保留 public `tileCacheSize`，不增加 `terrainCacheBytes`。Quadtree trim 仍只驱逐 unprotected tiles，
但 protected set 必须覆盖 render/desired/ancestors/bridge/promotion source。

- unprotected in-flight request 只有在 tile eviction、replacement/detach 或 destroy 时取消；
- availability Promise 无 cancellation handle，只用 generation 隔离；
- tile direct/fallback content 各自 exactly once destroy VA/vertex buffer 并释放 shared index ref；
- shared index buffer reference count 归零立即销毁，不再无条件保留到 provider destroy；
- fallback replacement、direct promotion failure 和 stale result 不得 double release；
- TerrainData 没有 destroy contract，释放表示丢弃 owned reference；
- provider 始终 caller-owned；
- provider replacement/detach 在任何资源释放前清空 replay cache，并一次切换 generation；
- World destroy、tile destroy 和 repeated release 保持幂等。

可以增加 private CPU/GPU byte debug counters 证明 balance，但 byte 数字不参与 public eviction
policy。视图外 cache/request 不影响当前 view readiness。

### 10. `tilesLoaded` 与 Credit

Terrain current-view settled 必须综合：

- desired region 是否有完整 render cover；
- direct 是否 READY，或 terminal 且有 stable fallback；
- availability/request/retry/promotion/source-refresh 是否仍可能改变当前 view；
- render tiles 的 shown imagery 是否 settled。

Pending direct 即使已有 upsample fallback 仍为 false。Terminal direct + stable fallback 可以 true。
无法达到 desired leaf 但所有 finer work terminal、ancestor coverage 完整时也可以 true。View 外工作
不阻塞。

Credits 只从 provider 和本帧 active TerrainData 收集。Upsampled credits 来自 source；未实际参与
render cover 的 cached direct/ancestor data 不额外显示 tile credit。

### 11. 保持的公共与交互契约

- 不新增 public type、property、constructor option 或 event；
- `SceneGISPlanarWorld.terrainProvider` 仍 caller-owned getter/setter；
- `world.maximumLevel` 不因 provider maximum level 较低而静默改变；
- `world.pick`、`pickFromWindowPosition` 和 camera controller 仍是 Z=0 reference plane；
- `scene.pickPosition` 继续由实际 terrain depth 得出；
- 相机在平面或 terrain 下方仍是合法 pose，不增加 camera collision/home recovery；
- no-provider flat、P5 imagery、P6 Viewer 和 P7 navigation 的公共行为保持。

## 明确非目标与禁止范围

### 留给 T4

- resident terrain height query；
- independent async sample；
- terrain ray/window picking 与 result reuse；
- navigation 是否选择 terrain target 的独立 API。

### 留给 T5

- URL template、Terrain-RGB、Terrarium、GeoTIFF 等 concrete provider；
- 网络、CORS、Credit、许可和 Sandcastle；
- 数据预处理或转换工具链。

### 留给 T6 或后续扩展

- normals、lighting、water mask、material、shadow 与地形表现；
- geomorph、时间 blend、neighbor balancing 或专用 seam stitching；
- Worker/TaskProcessor、transferable、正式 byte budget 和 measured performance tuning；
- 地下观察时 skirt/material 表现、camera collision、Entity clamp；
- NoData hole、洞穴、悬挑或非 height-field surface。

### 本阶段禁止

- 修改 upstream-owned file、`.scenegis/upstream-patches.json`、SGP-0001/0002；
- 修改 `packages/engine/Source/Workers/**`、Shaders、shader generator、build/release scripts；
- 复制或包装 `QuadtreePrimitive`、`GlobeSurfaceTile`、官方 TerrainMesh/TerrainData；
- 修改 widgets、Viewer、Sandcastle、E2E、DataSources 或 Entity；
- 改变 Z=0 public pick、camera controller、Viewer option 或 Scene primary-world contract；
- 增加 public memory、queue、upsample、mesh 或 debug API；
- 手工修改或提交 generated barrel、`.d.ts`、SpecList、API HTML 或 Build output；
- 开始 T4 或以临时 query/picking API验证 T3。

若实现需要违反以上边界，Execution Agent 必须停止，回写 blocker、源码事实、最小范围建议和已完成
验证，等待 Architecture Agent 裁决。

## 允许的影响路径

预计允许新增：

- `packages/engine/Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainUpsampler.js`
- `packages/engine/Specs/SceneGIS/Core/_private/SceneGISPlanarTerrainUpsamplerSpec.js`
- `AgentDocs/planar-terrain/reviews/2026-08-07-t3-terrain-continuous-lod.md`

预计允许修改：

- `packages/engine/Source/SceneGIS/Renderer/_private/_SceneGISPlanarTerrainMesh.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrain.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTile.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarQuadtree.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- 对应的 existing SceneGIS private Renderer/Scene Specs
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidgetSpec.js`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md`
- `AgentDocs/planar-terrain/**`

仅为放宽 provider maximum-level preflight 时，允许最小修改
`packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js` 及其现有 Spec；不得顺手改变其他 public
World behavior。若实际无需某条路径，不为满足清单创建空文件。

新增 private basename 必须以 `_SceneGIS` 开头并标记 `@private`；内部 constructor/function symbol
不加前导 `_`。若需要额外 SceneGIS-owned helper 或 Spec，先在本计划偏差区登记职责和原因。

## 实施步骤

1. 在 implementation checkpoint 上重新核对 Terrain、Quadtree、Surface、Tile、Heightmap、
   Renderer helper 与相关 Specs；把任何与本计划冲突的事实写入偏差区并先暂停。
2. 实现并验证纯 CPU direct-child Heightmap upsampler，锁定 address、方向、triangle surface、
   metadata、large EPSG:3857 extent 与 invalid sample。
3. 扩展 terrain mesh 为 regular-grid + skirt，建立 surface/command bounds、topology metadata、
   byte evidence 和 ref-counted shared-index ownership。
4. 重构 terrain entry 为 direct/fallback/active content，加入 availability attempt、revision、
   generation、promotion queue 与 terminal/retry policy。
5. 重构 quadtree selection output，先保持 desired result regression，再实现四子门禁、actual render
   cover、bridge/protection 与 deterministic LRU。
6. 将 Surface 调整为 desired/load -> terrain advance -> render cover -> imagery prepare -> command
   submission，并保持 depth exact replay。
7. 放宽 provider maximum-level preflight，使超过 provider level 的 World leaves 只走 upsample；保持
   canonical tiling identity 与 effective-error preflight 原子性。
8. 增加 focused CPU/runtime/quadtree/Surface 与一个确定性 real WebGL fixture，证明 continuous cover、
   mixed LOD skirt、imagery/depth/warm/lifecycle 和 flat regression。
9. 更新 ADR-0009、Architecture durable rules、phase results、extension/index 与 pending review request；
   记录任何已接受偏差和 remaining risk。
10. 运行最小充分验证、generated/private visibility assertion 和 ownership audit；不扩大到无关
    Globe/Viewer/full-repo suites。
11. 保持 T3/roadmap/index `active`、review `pending`，停止实现；不 commit、不 push、不进入 T4，
    请求 Architecture/code review。

## 验收要求

### Coverage 与 replacement

- 一个 direct child pending 时，父级单独覆盖完整 region；不得提交 ready siblings。
- 四个 direct children 都具有 renderable active content 后，同一个 normal frame 移除 parent 并
  切换到 visible child subtrees。
- 任意 submitted parent 不得同时存在 submitted descendant；render cover 在代表视锥中无 XY hole。
- 新 sibling 从 culled 变 visible 时已有 bridge fallback，不因其首次出现而复位整个 parent。
- Direct READY 在同一 tile 地址原子替换 UPSAMPLED/FLAT，不改变 imagery binding ownership。
- Parent active revision 改变时，child 旧 fallback 持续覆盖，refresh READY 后 exactly once 替换。

### Availability、upsample 与 error

- provider explicit false、direct-parent child mask false、metadata Promise、metadata undefined、unknown
  optimistic request 各有代表性闭环。
- `level > provider.maximumLevel` 不调用 provider request，使用逐级 upsample，且
  `world.maximumLevel`/imagery LOD 不被 clamp。
- Level 0 unavailable 报告 provider contract failure，但保持 flat root coverage 并最终收敛。
- Upsampled Heightmap 保持 NW row-major、SW→NE triangle、source dimensions、finite Float64 heights、
  `createdByUpsampling`、mask 0 和 credits。
- Request sync throw/reject/undefined scheduling、listener retry、cancel、availability/geometry late result
  与 provider replacement generation 都有最小 evidence。
- Terminal direct failure + stable fallback 可以 loaded；recoverable pending 不可以。

### Mesh、bounds 与裂缝

- Representative rectangular grid 锁定 surface/skirt vertex order、full index count 和 shared topology。
- Skirt Z 遵守 effective-error depth 与 provider minimum clamp；relative Float32 全部 finite。
- Selection OBB 排除 skirt但保守包含 potential direct surface；command sphere 包含 skirt。
- Perspective/orthographic、positive/negative height、large EPSG:3857 offset 和 below-terrain camera 的
  bounds/SSE 保持有限。
- 一个 mixed-LOD deterministic WebGL fixture 不出现 clear-color edge crack；不建立大规模视觉矩阵。

### Imagery、pass 与 readiness

- Imagery 绑定实际 render tiles；child terrain 可以使用 imagery READY ancestor fallback，仍为每 tile
  一个 opaque command。
- Terrain parent 与 child 不因 imagery pending 同时提交。
- Depth replay 提交 normal-render 相同 command refs，对 desired/render selection、SSE、availability、
  request、promotion、bounds、protection、LRU 和 CPU/GPU allocation 为零 delta。
- `scene.pickPosition` 继续反映 rendered terrain；同 ray `world.pick` 仍为 Z=0，不在 T3 增加查询。
- `tilesLoaded` 对当前 view pending/terminal/fallback/imagery 正确，并忽略 view 外 cache work。

### Cache 与生命周期

- Render、desired、ancestor、bridge 和 promotion source 不被当帧 trim；unprotected tiles 按
  last-used/key deterministic eviction。
- Eviction、provider replacement/detach、fallback refresh、direct replacement 与 world destroy 的
  TerrainData refs、CPU meshes、VAs、vertex buffers 和 shared-index refs exactly once 平衡。
- 相同 topology 的 resident content 共享一个 index buffer；最后一个 ref 释放后销毁。
- Cancellation 与 stale completion 不重新挂接 entry、不 double destroy，也不改变新 generation。
- 稳定 warm view 不持续创建 request、upsample data、CPU mesh、buffers、VA、ShaderProgram 或
  DrawCommand。
- fresh no-provider world 继续没有 terrain runtime、entry、queue、request、mesh、VA 或 index buffer。

## 最小充分验证命令

Execution Agent 必须先根据真实 Spec description 校正 includeName，并记录每条命令的非零命中。
预计 focused commands：

```powershell
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainUpsampler"
npm run test -- --includeName "SceneGIS/Renderer/SceneGISPlanarTerrainMesh"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTerrain"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTile"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarQuadtree"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarImageryCesiumWidget"
npm run build
npm run build-ts
npm run build-docs
npm run tsc
npx eslint <T3 changed JavaScript paths>
npx prettier --check <T3 changed JavaScript paths>
npx prettier --check --ignore-path .gitignore "AgentDocs/planar-terrain/**/*.md" "Documentation/SceneGIS/**/*.md"
npx markdownlint "AgentDocs/planar-terrain/**/*.md" "Documentation/SceneGIS/**/*.md"
git diff --check
```

验证遵守最小充分原则：

- 不要求全库 Specs、Globe/Viewer aggregate、Sandcastle、E2E、package smoke、标准 embedding 或
  大规模 timing benchmark；
- `build-release` 只在实现意外改变 public/build/resource path 时追加；正常 T3 private runtime
  变化不把它列为 hard gate；
- 若 full SceneGIS glob 明显包含无关历史文件，ESLint/Prettier 缩小到 changed paths，并准确回写；
- 一个 WebGL seam fixture、一个 depth replay fixture 和代表性 lifecycle fixture足以证明契约，
  不枚举所有相机、错误和 TypedArray 组合。

## 生成、所有权与审计

- diff base 固定为 `e0959172e84d4e49c254b38fa45184027c22e39d`。
- T3 预期 public declaration diff=0；任何 new public symbol 都是 blocker。
- private upsampler、entry/content/queue role 在 root `.d.ts` 和 API HTML 中命中必须为 0。
- generated root exports、`.d.ts`、SpecList、API HTML 与 Build output final status=`0`。
- upstream-owned files=`0`、T3 SGP=`0`、manifest unchanged、new patch marker=`0`。
- `SGP-0001` 的 Scene/CesiumWidget 与 `SGP-0002` 的 Viewer hunks 不得变化。
- 不 stage build output、screenshots、temporary DEM、profile 或 dependency cache。

## 风险与已接受限制

### 主线程 promotion

每帧最多两个 promotion 限制批量峰值，但单个超大 Heightmap 的 upsample/mesh 仍可能卡顿。T3
不把没有设备和 grid evidence 的 Worker 设计当作 correctness requirement；执行中若观察到明显
stall，只记录 grid/时长条件，留给 T6 profiling。

### Tile-count cache

`tileCacheSize` 能限制 unprotected tile 数量，但 generic TerrainData 没有 byte reporting，无法严格
限制异常大单 tile。T3 要求 resource/byte debug balance，不虚报为正式 memory budget。

### Skirt 与地下观察

Skirt 是向下的 double-sided curtain，能够遮蔽 normal above-surface mixed-LOD crack，但从地下或
极低侧视角可能可见。相机位于 terrain 下方仍被允许；地下视觉表现留到 T6，不通过 camera reset
或禁止 pose 掩盖。

### 无 geomorph

父子和 fallback/direct replacement 空间连续，但高度可能发生可见 pop。T3 不增加 blend 或
stencil；只有人工验收证明不可接受时再规划 measured follow-up。

### Private upstream helper

Skirt index helper、Buffer/VertexArray ownership、RequestScheduler 和 DrawCommand replay 都是 Cesium
升级敏感点。ADR-0009 已列出复核条件；不得为降低升级风险复制整段上游 terrain runtime。

## 完成条件

- ADR-0009 的 desired/load/render 分层、四子门禁、direct/fallback state、availability、逐级 upsample、
  skirt、cache/lifecycle 和 `tilesLoaded` 契约全部实现。
- Provider maximum level 可以低于 World maximum level，deeper terrain 使用明确 fallback，而 imagery/
  world LOD 不被静默 clamp。
- Loading、failure、retry、cancel、late completion、revision refresh、eviction 和 destroy 均无 geometry
  hole、父子重复、stale mutation 或 double release。
- Imagery 只绑定 actual render tiles；depth replay 和 Z=0 public picking 边界保持。
- Focused CPU/runtime/quadtree/WebGL/lifecycle/flat evidence 与必要 build/type/docs/static checks 通过。
- Generated status=0、upstream-owned files=0、T3 SGP=0、manifest/SGP-0001/0002 unchanged。
- Execution Agent 回写 source-to-spec mapping、case counts、命令结果、实现偏差、debug resource
  balance 和剩余风险，创建 pending review 后停止。
- Architecture Agent 完成 review，所有 finding reviewer-confirmed fixed 后，将 T3 code、Specs、
  ADR/Architecture 与 AgentDocs 形成独立中文本地 commit。
- T3 commit 前不激活、设计或实现 T4；commit 后停下与项目负责人讨论 T4。

## 偏差与结果

### 实际设计与路径

- 新增
  `Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainUpsampler.js`，只接受 concrete Heightmap，
  一次跨一级生成独立 Float64 child snapshot；对应
  `Specs/SceneGIS/Core/_private/SceneGISPlanarTerrainUpsamplerSpec.js`。
- `_SceneGISPlanarTerrainMesh.js` 改用
  `TerrainProvider.getRegularGridAndSkirtIndicesAndEdgeIndices`，输出 surface/full counts、
  skirt minimum、byte lengths 与 topology key；不复制上游 helper。
- `_SceneGISPlanarTerrain.js` 在一个 private role 内表达 direct、fallback、active content、
  availability attempt、promotion queue、revision 与 ref-counted shared index。未额外拆出 queue/
  cache module，避免形成第二棵 surface tree。
- `_SceneGISPlanarQuadtree.js` 保留 `idealTiles` 兼容调试证据，并新增 load/render arrays、
  refined/visible sets 与四子门禁；`_SceneGISPlanarSurface.js` 按 desired/load -> terrain ->
  render cover -> imagery -> command 顺序运行。
- `_SceneGISPlanarTile.js` 复用 stable selection OBB，并增加 stable private command OBB 来派生
  包含 skirt 的 command sphere。`SceneGISPlanarWorld.js` 无需修改；现有 setter 经 private
  preflight 自然放宽 provider maximum level。
- 除上述 Source/Specs、Architecture durable rule、ADR-0009、plan/review/index 外没有新增路径。
  实现与 ADR-0009 一致，无需扩大 public API、Shader/Worker/build seam 或 upstream boundary。

### 状态与帧协议

- Direct：
  `UNLOADED -> AVAILABILITY_LOADING -> UNLOADED -> LOADING -> RECEIVED -> READY`，
  或 terminal `UNAVAILABLE/FAILED`；retry 只在后续 normal frame回到 `UNLOADED`。
- Fallback：`NONE -> QUEUED -> READY/FAILED`；active priority固定
  `DIRECT > UPSAMPLED > FLAT`。旧 revision fallback 保持 coverage，refresh/direct promotion
  完成后先切换 command source，再 exactly-once release旧 content。Promotion 执行时重验 state；
  direct success 清空 pending fallback refresh，fallback 永不覆盖 `READY DIRECT`。
- Availability 实际顺序为 provider tri-state、direct parent mask、一次 metadata load、unknown
  optimistic request。超过 provider maximum level直接 `UNAVAILABLE`，没有 provider调用。
- 每个 normal frame最多两个 promotion：blocking fallback（包括无 active content 的 coverage bridge）、
  visible/coarse direct、stale refresh；
  promise completion不做 mesh/GPU/bounds/command mutation。Depth replay只重提 cached command refs。
- Direct candidates 只包括 visible desired leaves 及其 coverage ancestor/source；纯 culled bridge只建立
  fallback，不推进 direct。`tilesLoaded` 检查 current-view direct chain，并在任何无 active content、
  `fallbackState=QUEUED` 的四子 coverage bridge promotion完成前保持 false。已有 active fallback 的
  off-view refresh以及 cached/in-flight off-view direct不参与；terminal + stable cover可以 true。

### Source-to-Spec mapping 与计数

- Upsampler 3/3；TerrainMesh 4/4；Terrain runtime 10/10；Tile direct 7（aggregate 12/12，含
  TileImagery 5）；Quadtree 13/13；Surface direct 23（aggregate 25/25，含 SurfaceShader 2）；
  World 16/16；terrain Widget 1/1。
- T3 修改路径映射的 direct unique总数为 77；相对 T2 新增 direct unique 12
  （Upsampler 3、Mesh 1、Terrain 4、Quadtree 1、Surface 2、World 1）。
- Imagery Widget回归 9/9。所有 includeName均有真实 suite命中，无 zero-test通过。

### 关键运行时证据

- 四子门禁 fixture在三个 child content ready时仍只提交 root；第四个 fallback promotion后同帧
  完整切换四 child，submitted parent/descendant无重叠。
- Deferred direct child先使用 parent revision N 的 UPSAMPLED content；parent切到 N+1且 child direct
  同帧 `RECEIVED` 时，direct promotion清除 stale refresh snapshot并保持 DIRECT。旧 fallback VA
  exactly-once destroy，后续 warm frame与 depth replay的 source、command refs和 resource counters稳定。
- 部分视锥 fixture逐帧证明 culled bridge不发 direct request；当 bridge fallback仍 `QUEUED` 且无
  active content时，render cover保持 parent且 `tilesLoaded=false`。Blocking bridge promotion完成、
  四子 active后同帧退出 parent并允许 settled；视图移动后 bridge才请求 direct，并在保留 fallback
  coverage期间原子切换，无 hole或 parent/child重叠。
- Real Context fixture只请求 provider Level 0，World Level 1不被 clamp，四个 render child全部
  逐级 UPSAMPLED；每帧 promotion delta不超过 2，terrain+imagery仍每 tile一个 opaque command。
- 该 fixture创建/销毁 5 个 tile VA、5 个独占 vertex buffer、1 个 shared skirt index buffer，
  acquired/released shared-index refs相等；warm frame request/upsample/mesh/buffer/VA/command为零
  增量。
- `scene.pickPosition` 与 active upsample Heightmap的 rendered depth一致，同一 ray
  `world.pick` 仍严格 Z=0；depth replay前后 terrain/quadtree/resource debug状态不变。
- Fresh no-provider Surface继续不创建 terrain runtime、entry、queue、request、mesh、VA或 index。

### 验证矩阵

- 九条 focused命令分别通过：3、4、9、12 aggregate、13、24 aggregate、16、1、9 cases，
  均 Exit 0。
- T3-R001/R002 focused复核：Terrain 10/10、Quadtree 13/13、Surface aggregate 25/25，以及
  `npm run build` 均 Exit 0。
- T3-R002 coverage follow-up：Surface aggregate 25/25与 `npm run build` Exit 0；逐帧 fixture已捕获
  `parent + queued bridge => false` 到完整 child cover settled的转换。
- `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`：Exit 0。
  build-ts/build-docs保留 Cesium 1.144既有大量 TSD-JSDoc parent/type warnings，无新增
  SceneGIS private warning或 failure。
- Changed-path ESLint、JavaScript Prettier、AgentDocs/Documentation Prettier、Markdownlint和
  `git diff --check`：Exit 0；只有 Windows checkout 的 LF/CRLF提示。
- Private upsampler/mesh/quadtree在正式 `.d.ts` 与 API HTML filename命中 0；
  相对 T2 public declaration diff=0。
- `node scripts/scenegis/audit-upstream-patches.mjs`：Exit 0；delivery upstream-owned files=0。
  T3 SGP=0、manifest/SGP-0001/0002 unchanged、new patch marker=0、generated status=0。

### 偏差、风险与 handoff

- 布局偏差：promotion queue、content与 shared-index cache保持在单个 Terrain runtime内，没有为
  每个概念创建额外 private module；职责仍可独立测试，且避免跨文件 private state协议。
- Accepted risks保持 ADR-0009不变：单个超大 Heightmap仍可能造成 main-thread峰值；tile-count
  cache不是 byte budget；地下视角可能看到 skirt；无 geomorph时 replacement可能产生 height pop。
- Review request：
  [T3 terrain continuous LOD review](../reviews/2026-08-07-t3-terrain-continuous-lod.md)
  （`approved`）。
- Current handoff：Architecture second focused re-review 已确认 T3-R001/T3-R002 fixed。T3 状态为
  `completed`，等待 Architecture Agent 创建本阶段独立中文本地提交；提交后停下与项目负责人讨论
  T4，不在本阶段实现 T4。
