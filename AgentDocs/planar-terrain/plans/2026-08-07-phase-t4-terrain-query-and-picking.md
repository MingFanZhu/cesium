# T4 阶段计划：平面地形查询、拾取与独立采样

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
  `8c72ac3ef76071da24fad820bf3b75cb4899127b`
- 相关讨论（Related discussions）：项目负责人与 Architecture Agent 已一次性审阅并批准本阶段
  完整设计；没有独立 open discussion
- 相关 ADR：
  - [ADR-0002：平面坐标与瓦片寻址契约](../../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)
  - [ADR-0004：平面导航、相机约束与 Surface Picking](../../../Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md)
  - [ADR-0007：平面地形 Core 契约](../../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)
  - [ADR-0008：平面地形 Mesh、Surface 集成与最小加载](../../../Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)
  - [ADR-0009：平面地形连续 LOD、上采样与缓存](../../../Documentation/SceneGIS/Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md)
  - [ADR-0010：平面地形驻留查询、Terrain Picking 与独立采样](../../../Documentation/SceneGIS/Decisions/ADR-0010-planar-terrain-query-picking-and-sampling.md)
- SGP：无；T4 禁止修改 upstream-owned file
- 相关评审（Related reviews）：
  [T4 terrain query/picking review](../reviews/2026-08-07-t4-terrain-query-and-picking.md)
  （`approved`）

## 阶段目标

在不改变 T3 terrain runtime 和既有 Z=0 navigation contract 的前提下，补齐三种职责不同的地形
读取能力：

- 从 World 已驻留 cache 中查询与实际 Float32 surface mesh 一致的高度；
- 对最近一次 normal render 的实际 terrain cover 做双面、skirt-excluded ray/window picking；
- 不依赖 World/cache，按显式 level 对 provider TerrainData 做分组异步采样；
- 明确上述能力与 `world.pick`、`scene.pickPosition` 的差异；
- 保证所有查询均不推进 selection、request、promotion、LRU、GPU 或 `tilesLoaded` 状态。

T4 是 query/picking API 阶段，不优化 T3 LOD，不增加 concrete provider、示例、Worker、Shader、
camera collision、Entity clamp 或地下交互。

## 进入基线与依赖

- 分支：`feature/planar-terrain`。
- implementation diff base：
  `8c72ac3ef76071da24fad820bf3b75cb4899127b`。
- T3 已 architecture/code review、提交并保持 clean checkpoint；执行 Agent 必须以该 commit 为本阶段
  diff base，不把 T2、planar-world 或 upstream merge-base 当作 T4 base。
- T1 已固定 provider、TerrainData 与 Heightmap interpolation；T4 sampler 只能消费这些公共契约，
  不能把 Heightmap concrete type变成 Provider 的唯一返回值。
- T2/T3 已固定 tile-local Float32 mesh、`surfaceIndexCount`、downward skirt、active content revision、
  actual render cover 与 exactly-once lifecycle；T4 只建立只读视图，不取得资源 ownership。
- P4/P7 已固定 private four-frustum ray helper和 Z=0 camera navigation；T4 不得让 Controller 改用
  terrain picking。

## 当前源码事实

### World、Quadtree 与 Surface

- `SceneGISPlanarWorld` 当前只有 bounded Z=0 `pick` 和 `pickFromWindowPosition`，并通过 private
  `_surface` 持有 runtime。
- `_SceneGISPlanarQuadtree` 的 tile cache 是按 canonical key 保存的 Map；`getOrCreateTile` 会创建
  tile，因此查询不能调用它。`_renderTiles` 是 normal render 实际 cover，但在下一帧
  `beginFrame` 清空，不能直接作为跨帧公共 snapshot。
- `_SceneGISPlanarSurface` 只在 normal render 进行 selection、terrain/imagery prepare、command
  建立与 LRU mutation；pick/depth pass 精确重放 `_renderCommands`。
- provider replacement/detach 已有 generation 与资源清理边界，T4 snapshot 必须在这些边界同步
  失效，不能保留已释放 content reference。

### Terrain content 与 mesh

- active source 为 `DIRECT`、`UPSAMPLED` 或 `FLAT`。前两者保留 TerrainData、CPU mesh、VA 与
  source revision；FLAT 使用既有 shared unit quad，不代表 provider 高程。
- CPU terrain mesh 使用 tile-local Float32 positions、实际 indices、`surfaceIndexCount`、width、
  height、reference height；skirt indices 位于 surface range 之后。
- 渲染几何的高程语义由 Float32 positions 和实际 surface triangles 决定。重新 decode 原始
  Heightmap 会绕过已上传 mesh 的 round-off，不适合作为 resident query 的事实源。
- `SceneGISPlanarHeightmapTerrainData.interpolateHeight` 与 direct-child upsample 使用 SW→NE
  triangle topology，可作为独立 provider sampler 的 TerrainData 语义。

### Cesium 启发与不可复用边界

- `Globe.getHeight` 启发“最深 resident mesh”语义，`Globe.pick` 启发只拾取实际 render cover，
  `sampleTerrain` 启发按 tile 聚合 provider 请求。
- 官方 `TerrainPicker` 依赖 `TerrainEncoding`、projection/SceneMode 和 Worker 空间结构；T4 不复制、
  包装或 monkey patch 它。
- `IntersectionTests`、`Ray`、`Request`、`RequestType.TERRAIN` 等非球面基础设施可以在验证其当前
  语义后窄复用。

## 已确认设计

完整长期决定以 ADR-0010 为准。本节将其转换为执行边界。

### 1. Public World API

`SceneGISPlanarWorld` 新增：

```js
world.getTerrainHeight(position);
world.pickTerrain(ray, result);
world.pickTerrainFromWindowPosition(windowPosition, scene, result);
```

三者必须具有英文 JSDoc、明确的 `DeveloperError` 条件、destroyed-world 行为和 result reuse 语义，
并进入 engine/Cesium root exports、`.d.ts` 与 API docs。它们不加入 generic `SceneGISWorld`
structural contract。

`getTerrainHeight` 的 `position` 必须是 finite `Cartesian3`。X/Y 负责寻址；Z 只验证 finite，不参与
结果。extent 外、无 provider 或无 resident terrain mesh 返回 `undefined`。

`pickTerrain` 的 ray origin/direction 必须 finite，direction non-zero但无需 normalize；最近
non-negative `t` 命中有效，包含 `t=0`。`pickTerrainFromWindowPosition` 的参数 validation、SCENE3D
要求、zero canvas和 result reuse与既有 `pickFromWindowPosition` 对齐。

### 2. Resident height query

查询根据 ADR-0002 的 owner rule，从 World maximum level 向 Level 0 计算该 X/Y 的 canonical key，
只读取已存在 Map entry，不创建 tile，也不扫描无关 tile：

- internal east/south boundary 归 east/south tile，world 四条 outer boundary inclusive；
- 第一个拥有合法 active terrain mesh 的 `DIRECT`/`UPSAMPLED` tile 提供结果；
- `FLAT` 不返回 0，继续检查 ancestor；祖先也无 terrain mesh时返回 `undefined`；
- visible、culled、bridge 或普通 resident cache entry 都可以成为来源，所以此 API 不承诺当前屏幕
  LOD；
- 不 touch frame number、protected set、last used、LRU、request、promotion 或 readiness。

私有查询 helper 必须从实际 Float32 surface positions/indices 求高程，使用规则 grid cell 局部定位并
只测试该 cell 的两个实际 surface triangles；不能重新读取 Heightmap sample，也不能包含 skirt。

### 3. Normal-render terrain cover snapshot

Surface 需要建立只读的 terrain picking snapshot：

- 下一次正常渲染开始时先使旧 snapshot 失效，只有本次 actual render cover command成功建立并提交后
  才发布新 snapshot；
- snapshot 保存可复用 tile/content/mesh reference、active source、identity/revision 和稳定 tile key，
  不复制 mesh、不拥有资源、不建立第二套 quadtree；
- provider attach/replacement/detach、`show=false`、zero drawing buffer、无 cover和 destroy 必须清空；
- content identity/revision 与 snapshot 不再一致时，该 entry 无效，不得读取替换或释放后的资源；
- stable normal frame 不产生新的 query-only per-frame object/array；允许复用 Surface-owned container；
- snapshot 建立和查询不得改变既有 `_renderCommands` refs 或 pick/depth replay。

如果当前 Surface lifecycle 没有“normal render成功结束”的单一 hook，可以在 SceneGIS-owned Surface
内部增加一个窄小、可测试的 publish step；不得修改 upstream `Scene`。

### 4. Terrain ray intersection

`pickTerrain` 只遍历最近发布的 actual cover snapshot，不能扫描全部 resident cache。每个 entry：

1. 以 tile command/surface bounds 做无分配 broad phase；
2. 把 world ray 转到 tile-local space，并保持同一 affine ray parameter；
3. 只遍历 `surfaceIndexCount` 范围内的 triangles；
4. 关闭 back-face culling，支持从上方和下方拾取；
5. 返回最近 non-negative hit；相同距离按稳定 tile key 决定顺序。

Skirt 不参与语义 picking。`FLAT` cover 仍参与前后遮挡排序，但不生成 terrain result：如果最近 surface
是 FLAT，返回 `undefined`，不能穿透它拾取更远 terrain，也不能把 Z=0 当作 terrain。

私有实现新增 `_SceneGISPlanarTerrainQuery.js`，模块内部 symbol 命名不带额外 `_` 前缀。首版 ray
query 可以在 tile broad phase 后线性扫描 surface triangles；这是已接受的低频 correctness-first
边界，T4 不预建 BVH、grid DDA 或 Worker。

### 5. Window terrain picking

`pickTerrainFromWindowPosition` 必须复用 `_SceneGISPlanarCamera` 已有 four-frustum helper构造 world
ray，再调用 `pickTerrain`：

- 不调用 `Camera.getPickRay`；
- 不触发 render、pick pass 或 depth pass；
- 不以 `scene.pickPosition` 或 `world.pick` fallback；
- 只增加一个 perspective 和一个 orthographic representative integration，不重复 P4 已覆盖的四
  frustum 极值矩阵。

### 6. Public async sampler

新增非实例化 public utility `SceneGISPlanarTerrainSampler`：

```js
SceneGISPlanarTerrainSampler.sampleAtLevel(
  terrainProvider,
  level,
  positions,
  (rejectOnTileFail = false),
);
```

返回 `Promise<Array<number | undefined>>`，长度和顺序与 caller-owned `positions` 一致；不得修改输入
数组或任一 `Cartesian3.z`。没有 World 参数，也不访问 World runtime/cache。

在发出任何 provider request 前原子 preflight：provider structural contract、canonical tiling scheme、
height range、maximum level、level整数范围、positions数组与每个 finite `Cartesian3`。Programmer
error 始终抛 `DeveloperError`。

对合法输入按 level/address 分组：

1. extent 外 position 直接为 `undefined`；
2. known unavailable tile 不请求；
3. unknown availability 最多尝试一次 `loadTileDataAvailability`，完成后重查；仍 unknown 或 loader
   返回 `undefined` 则 optimistic geometry request；
4. 每个 unique tile 使用独立 `RequestType.TERRAIN`；`requestTileGeometry` 返回 `undefined` 表示
   scheduler defer，采用 private delay 后重试，不能同步或 microtask busy-poll；
5. 成功结果验证 TerrainData structural interpolation、finite ordered range且处于 provider range内；
   tile-interior `interpolateHeight` 必须返回 finite height；
6. 同一 tile 的多个 positions共享一次成功请求，最后恢复输入顺序。

默认 `rejectOnTileFail=false`：runtime request rejection、sync throw、invalid TerrainData 或 invalid
interpolation 仅令该 tile 的输出为 `undefined`，其他 tile继续；`true` 时任一 runtime tile failure
reject整体 Promise。Known unavailable不是 failure。Sampler 不 raise `errorEvent`、不 retry provider
业务错误、不 upsample、不查 ancestor、不 flat fallback、不跨调用 cache，也不销毁 provider/data。

T4 不提供 public cancel、`sampleMostDetailed` 或可配置 retry delay。Provider 永久返回 scheduling
`undefined` 时 Promise 可以 pending；测试只证明一次 defer 后可继续，不能构造无意义永久 timer gate。

### 7. 职责表

| API                                          | 数据来源                             | Render 依赖    | 对象/Skirt | 缺失时 Z=0 fallback |
| -------------------------------------------- | ------------------------------------ | -------------- | ---------- | ------------------- |
| `world.pick`                                 | bounded mathematical reference plane | 否             | 否         | 本身就是 Z=0        |
| `world.getTerrainHeight`                     | 最深 resident active terrain mesh    | 仅依赖先前加载 | 否         | 否                  |
| `world.pickTerrain`                          | 最近 normal-render terrain cover     | 是             | 否         | 否                  |
| `scene.pickPosition`                         | frontmost rendered depth             | 是             | 可以包含   | 不适用              |
| `SceneGISPlanarTerrainSampler.sampleAtLevel` | provider 指定 level TerrainData      | 否             | 否         | 否                  |

Camera Controller、Viewer selection 与既有 `world.pickFromWindowPosition` 都保持 Z=0 reference-plane
语义。

## 允许修改范围

默认允许新增：

- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarTerrainSampler.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrainQuery.js`
- 对应 `packages/engine/Specs/SceneGIS/Core/**` 与 `packages/engine/Specs/SceneGIS/Scene/**`
- T4 必需的 SceneGIS terrain Widget/WebGL Spec（只放在既有 SceneGIS-owned Spec root）
- `Documentation/SceneGIS/Decisions/ADR-0010-planar-terrain-query-picking-and-sampling.md`
- 本 phase plan、review request 和相关 `AgentDocs/planar-terrain/**` 索引

默认允许窄修改：

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarQuadtree.js`
- 上述模块对应的现有 SceneGIS Specs
- `Documentation/SceneGIS/Architecture.md`

若只读 access seam需要触及 `_SceneGISPlanarTile.js` 或 `_SceneGISPlanarTerrain.js`，执行 Agent 必须
先证明现有 identity/revision 无法安全读取，在 phase plan/results 中登记偏差，并保持 pure read-only；
不得借此修改 T3 状态机。其他路径需回到 Architecture Agent裁决。

## 禁止范围

- 修改任何 upstream-owned file，或创建/扩大 `SGP-0001`、`SGP-0002` 和新 SGP。
- 修改 terrain request/promotion/fallback/availability/cache/LRU policy 或每帧 promotion budget。
- 修改 mesh topology、skirt、vertex layout、Shader、DrawCommand、depth replay 或 imagery composition。
- 修改 `SceneGISPlanarCameraController`、CesiumWidget、Viewer、HomeButton 或 generic `SceneGISWorld`。
- 增加 Worker、BVH、DDA、public cancellation、`sampleMostDetailed`、cross-call cache 或 provider adapter。
- 增加 Sandcastle、公开网络数据、T5 provider/example 或 T6 lighting/performance工作。
- 手工编辑/提交任何生成文件。

## 实现步骤

1. 复核 implementation base与允许路径，确认工作树没有并发变更；重新读取受影响 SceneGIS module
   的当前实现和调用关系。
2. 实现 pure private terrain mesh query role，先以无 WebGL Specs锁定 Float32 point/ray、surface-only、
   double-sided与 result reuse语义。
3. 为 Quadtree/terrain runtime增加最窄 read-only resident lookup seam；实现 World
   `getTerrainHeight`，证明零 tile创建和零 runtime mutation。
4. 在 Surface normal-render lifecycle中实现 reusable actual-cover snapshot、所有 invalidation边界与
   revision validation；实现 World ray/window terrain picking。
5. 实现 `SceneGISPlanarTerrainSampler` 的 preflight、tile grouping、availability、scheduler defer、
   failure policy和 input immutability。
6. 增加一个真实 Context closure Spec，复核与 `scene.pickPosition`、Z=0 `world.pick`、imagery/depth
   command replay和资源 lifecycle 的边界。
7. 运行最小充分验证、公开生成链和 ownership audit；回写 phase results与 pending review request，
   然后停止等待 Architecture review。

## 验收条件

### Resident height

- direct和 upsampled active mesh返回与实际 Float32 surface triangles一致的 finite height。
- FLAT/no mesh不会伪造 0；能够继续命中 resident terrain ancestor，否则返回 `undefined`。
- deepest canonical existing tile胜出；覆盖一个 internal owner boundary、outer inclusive与完整
  EPSG:3857 large-offset representative。
- 查询前后 tile count、request、promotion、protected/LRU、GPU和 `tilesLoaded` evidence不变。

### Terrain picking

- 上方/下方、non-normalized direction、`t=0`、nearest hit与 result reuse成立。
- 只使用最后 normal-render actual cover；resident culled/off-view tile不参与。
- skirt不会成为结果；nearest FLAT会遮挡更远 terrain并返回 `undefined`。
- hidden、zero buffer、provider replacement/detach、revision mismatch与 destroy不会读取 stale snapshot。
- stable normal frame复用 snapshot container；查询不分配 GPU/command或推进 terrain状态。

### Window、depth与职责闭环

- 一个 perspective和一个 orthographic representative通过 private four-frustum helper命中 terrain。
- 同一 deterministic point中，resident height、window terrain pick与无遮挡 `scene.pickPosition` 在已说明
  的 Float32/depth tolerance内一致；同 ray `world.pick` 仍精确位于 Z=0。
- 现有 navigation representative保持通过，证明 controller没有切换 terrain target。

### Async sampler

- preflight在任何 request前原子失败；positions和每个 input vector保持 unchanged。
- 同 tile多位置只发一个 geometry request，跨 tile结果按输入顺序恢复。
- extent外、known unavailable、unknown metadata一次尝试、scheduler一次 defer后成功均有证据。
- 默认 tile-local failure不影响其他 tile；`rejectOnTileFail=true`整体 reject；programmer error始终为
  `DeveloperError`。
- 返回数据、interpolation和 provider height range均验证；Sampler不 raise provider error event、
  不访问 World cache、也不销毁 provider/data。

### Public、ownership 与文档

- `SceneGISPlanarTerrainSampler` 和三个 World methods在正式 root JS/types/API docs中可见。
- `_SceneGISPlanarTerrainQuery` 及任何 private seam在 declarations/API HTML中命中为 0。
- upstream-owned files=`0`、T4 SGP=`0`、`.scenegis/upstream-patches.json` unchanged、生成文件
  status=`0`。
- ADR-0010、Architecture durable rules、phase results、review request和索引互相链接且状态真实。

## 最小充分验证命令

Execution Agent 应根据最终 Spec basename填写精确 `--includeName`，不得为形式完整扩大到 Globe、
Viewer、完整 CesiumWidget 或 full repo：

```text
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainSampler"
npm run test -- --includeName "SceneGIS/Scene/_SceneGISPlanarTerrainQuery"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run test -- --includeName "SceneGIS/Scene/_SceneGISPlanarQuadtree"
npm run test -- --includeName "SceneGIS/Scene/_SceneGISPlanarSurface"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"
npm run build
npm run build-ts
npm run build-docs
npm run tsc
```

另运行实际 changed JS/docs范围的 scoped ESLint、Prettier、Markdownlint、`git diff --check`，以及现有
SceneGIS upstream audit。只有实现真实触及额外公共 build surface或发现明确回归时才扩展命令并说明
理由；T4 不把 `build-release`、Sandcastle、E2E、性能矩阵或上游全量 suite列为 hard gate。

## 风险与已接受限制

- Resident高度反映已驻留 mesh，不保证指定 level，也不保证等于当前 render LOD；需要确定 level时
  使用 async sampler。
- Sampler使用 TerrainData interpolation，resident query使用 GPU-source Float32 mesh；两者 topology
  一致但不承诺 bit-identical。
- Ray picking对每个 broad-phase candidate线性扫描 surface triangles；T4 接受其低频成本，T6 以
  profiling决定是否增加 acceleration。
- Snapshot只代表最近成功 normal render，不等于实时 provider全金字塔；调用方必须接受无 prior
  render、hidden或 invalidated时 `undefined`。
- FLAT是画面 coverage但不是 terrain truth；其遮挡返回 `undefined` 是有意设计。
- Public async sampler不具 cancel/timeout/most-detailed；provider持续 scheduler defer可能使 Promise
  pending。
- T4 不改变 camera collision和地下模式，terrain-aware navigation仍是后续独立设计。

## 完成与阶段门禁

T4 只有在以下条件同时成立后才能标记 `completed`：

1. implementation、最小充分自动化验证、公开生成链和 ownership audit完成；
2. Execution Agent在本计划回写 affected paths、实现偏差、case counts、命令结果、已接受限制和
   remaining risks；
3. 创建 `../reviews/2026-08-07-t4-terrain-query-and-picking.md`，状态保持 `pending`，由
   Architecture Agent完成 code/architecture review；
4. 所有 finding均由 Architecture reviewer确认 fixed或明确接受；
5. Architecture Agent将 T4 code、Specs、ADR/Architecture和 AgentDocs形成独立中文本地提交。

在该 checkpoint前禁止进入 T5；Execution Agent不得 commit、push或自行把 plan/review标记为
`completed`/`approved`。

## Execution results

### 实际设计与路径

- 新增 public namespace
  `packages/engine/Source/SceneGIS/Core/SceneGISPlanarTerrainSampler.js`，对应
  `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarTerrainSamplerSpec.js`。实现完整同步
  preflight、canonical tile grouping、tri-state availability、一次 metadata load、独立
  `RequestType.TERRAIN`、macrotask scheduler defer、tile-local failure 和输入不变。
- 新增 private
  `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrainQuery.js`，对应
  `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarTerrainQuerySpec.js`。Spec 按 constructor/
  module symbol 命名而不在 basename 增加前导下划线；源码 private module basename 保持 `_SceneGIS*`。
  Helper 从实际 Float32 positions/indices 求值，以 tile-local affine ray 保持原 ray parameter，只扫描
  `surfaceIndexCount`，并把 FLAT 作为无 terrain result 的遮挡 cover。
- 窄修改 `SceneGISPlanarWorld.js`、`_SceneGISPlanarSurface.js`、`_SceneGISPlanarQuadtree.js` 及其
  mirrored Specs；真实闭环补在既有 `SceneGISPlanarTerrainCesiumWidgetSpec.js`。Quadtree 只新增
  `Map.get` 型 `getTile` read-only seam，没有修改 Tile 或 Terrain runtime。
- Surface 使用固定 `_terrainQuerySnapshot` array 和可复用 entry objects。每个新的 normal render
  先清除上一有效范围的 tile/content/mesh 等 strong fields并清零 count，只有 actual render commands
  全部提交后才发布；provider 变更、hidden、zero buffer/no cover、cover shrink和 destroy都不保留旧
  mesh。Entry objects在 warm frame复用，identity/revision/source/mesh 在查询时重验。

### 行为与偏差

- Resident query 从 World maximum level 向 root 使用 owner-rule address，只读取 existing tile；
  DIRECT/UPSAMPLED mesh 返回实际 Float32 triangle height，FLAT 或无 mesh 继续 ancestor。查询前后
  tile count、quadtree debug、`tilesLoaded` 和 terrain counters保持不变。
- Point query依据实际 Float32 XY triangles，在理想 cell周围固定 `3×3` 邻域内查找实际 coverage；ray
  broad volume从 surface vertices（不含 skirt）取得真实 Float32 Z extrema。Terrain ray query支持上下
  双面、structural非单位 direction、`t=0`、result reuse、stable-key tie break、nearest FLAT occlusion
  和 skirt exclusion。Window API直接复用 `_SceneGISPlanarCamera.getWindowRay`；现有
  `world.pick`/controller继续 Z=0，`scene.pickPosition`继续 rendered depth。
- Sampler对每个 tile先在临时数组完成全部 interpolation validation，再原子提交该组结果；scheduler
  defer使用 private fixed `100 ms` delay，避免 event-loop busy polling。具体 delay仍不是兼容契约。

### Specs 与计数

- 新增 direct unique cases=`18`：Sampler `7`、private query `7`、World `2`、Quadtree `1`、Surface `1`。
- 另在既有 World/Surface/terrain Widget cases中补 provider/snapshot invalidation、stable container、
  zero-buffer/hidden/no-cover/destroy、WebGL resident/window/depth/Z=0 closure；未把这些修改后的既有
  cases重复计为新增 direct cases。
- 最终 focused runner：Sampler `7/7`；query `7/7`；World `18/18`；Quadtree `14/14`；Surface
  aggregate `26/26`（Surface direct `24` + Shader `2`）；terrain Widget `1/1`；navigation Widget
  `4/4`。

### 验证矩阵

| Command                                                                                                       | Result                                                            |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainSampler"`                                  | Exit 0，`7/7`                                                     |
| `npm run test -- --includeName "SceneGIS/Scene/_SceneGISPlanarTerrainQuery"`                                  | Exit 0，`7/7`                                                     |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                                          | Exit 0，`18/18`                                                   |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarQuadtree"`                                       | Exit 0，`14/14`                                                   |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`                                        | Exit 0，aggregate `26/26`                                         |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"`                           | Exit 0，`1/1`                                                     |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"`                        | Exit 0，`4/4`                                                     |
| `npm run build`                                                                                               | Exit 0                                                            |
| `npm run build-ts`                                                                                            | Exit 0；保留既有 TSD-JSDoc warnings                               |
| `npm run build-docs`                                                                                          | Exit 0                                                            |
| `npm run tsc`                                                                                                 | Exit 0                                                            |
| changed-scope ESLint / Prettier，SceneGIS/planar-terrain Markdown Prettier / Markdownlint，`git diff --check` | Exit 0                                                            |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                                            | Exit 0；delivery upstream-owned entries `0`，generated status `0` |

### 生成、所有权与风险

- 正式 root JS、`packages/engine/index.d.ts`、`Source/Cesium.d.ts` 和 API HTML 均包含
  `SceneGISPlanarTerrainSampler` 与三个 World methods；sampler declaration 是不可实例化 namespace，
  返回 `Promise<(number | undefined)[]>`。
- `_SceneGISPlanarTerrainQuery` 在正式 declarations/API HTML命中 `0`。生成文件未进入 status。
- upstream-owned files=`0`；T4 SGP=`0`；`.scenegis/upstream-patches.json`、SGP-0001/0002 unchanged；
  new patch markers=`0`。
- 保留 ADR-0010 已接受风险：resident 与 sampler结果不保证 bit-identical；snapshot只代表最近成功
  normal render；candidate tile内 ray triangle线性扫描；sampler无 cancel/timeout/most-detailed，持续
  scheduler defer可以 pending。未发现需要新 discussion 的方案偏差。
- Review：
  [T4 terrain query/picking review](../reviews/2026-08-07-t4-terrain-query-and-picking.md)
  （`approved`）。Architecture首轮 review提出 `T4-R001`～`T4-R004`：实际 Float32
  grid/bounds查询一致性、snapshot strong-reference清理、sampler tile-result原子提交，以及
  scheduler defer非零延迟。Execution完成四项 focused fix并补齐直接回归，Architecture focused
  re-review已确认全部 `fixed`，无 unresolved finding；T4标记为 `completed`。
- Focused fix实际重跑：query `7/7`、sampler `7/7`、Surface aggregate `26/26`、World `18/18`、
  `npm run build`、changed-scope ESLint/Prettier、planar-terrain Markdownlint、`git diff --check` 与
  upstream audit均 Exit 0。按 Architecture最小矩阵裁决未重跑 WebGL/navigation/Quadtree、
  build-ts/build-docs/tsc；沿用首轮已记录证据，因为本轮未触及其边界。
- Architecture focused re-review独立运行 query `7/7`、sampler `7/7` 和 Surface aggregate
  `26/26`，均 Exit 0；复核确认修复仍遵守实际 Float32 mesh、stable snapshot identity、tile级原子
  failure和private delayed retry契约。
