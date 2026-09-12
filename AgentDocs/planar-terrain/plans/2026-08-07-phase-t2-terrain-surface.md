# T2 阶段计划：平面地形 Mesh 与 Surface 集成

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
  `ca55db7c8a6ec8a5c512a40cf20fa223f58635d8`
- 相关讨论（Related discussions）：本阶段设计已由项目负责人与 Architecture Agent 在进入
  T2 时逐项确认；没有独立 open discussion
- 相关 ADR：
  - [ADR-0003：平面 Surface Runtime、LOD 与缓存](../../../Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md)
  - [ADR-0005：平面栅格影像运行时与图层合成](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)
  - [ADR-0007：平面地形 Core 契约](../../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)
  - [ADR-0008：平面地形 Mesh、Surface 集成与最小加载](../../../Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)
- SGP：无；T2 禁止修改 upstream-owned file
- 相关评审（Related reviews）：
  [T2 terrain surface review](../reviews/2026-08-07-t2-terrain-surface.md)（`approved`）

## 阶段目标

把 T1 的 Heightmap terrain data 接入 `SceneGISPlanarWorld` 的现有 planar surface：生成真正
tile-local 三维 mesh，以三维 bounds 和 terrain geometric error 参与 LOD，让现有 imagery 在
同一个 opaque command 中贴附到高程表面，并建立 provider attach/replacement、最小异步请求、
GPU/CPU ownership 与 `tilesLoaded` 闭环。

T2 必须同时保留无 provider 的现有 flat fast path。它只建立可安全运行的最小 terrain
geometry；连续 ancestor fallback、upsampling、跨 LOD seam 与 Worker scheduling 属于 T3。

## 进入基线与依赖

- 分支：`feature/planar-terrain`。
- implementation diff base：本 phase plan 的独立 planning checkpoint；Architecture Agent
  派工时给出准确 commit，执行 Agent 不以 merge-base 或 T1 之前提交替代。
- T1 checkpoint：`a5f971bbcd378e051f1954822650f916c4482202`，已包含三个 public Core
  type、17 个 direct unique Specs、ADR-0007 和 approved review。
- `planar-world` P3-P5 已提供 ideal-tile quadtree、flat command、P4 depth replay 与 P5 imagery
  composition；T2 必须扩展这些现有职责，不能复制一套平行 surface。
- `SceneGISPlanarWorld.maximumLevel` 继续是 surface/imagery selection 上限；T2 provider 必须
  至少覆盖该 level。

## 当前源码事实

### World 与 canonical tiling scheme

- World constructor 当前只接收 coordinate system、maximum level、SSE、cache 和 base color，
  并在内部创建唯一 canonical `SceneGISPlanarTilingScheme`。
- imagery provider 由调用方在 World 创建后使用 `world.tilingScheme` 组装。terrain 也必须使用
  相同顺序；普通 `terrainProvider` constructor option 无法同时满足 strict object identity。
- World 当前通过 `_surface.tilesLoaded` 汇总 imagery readiness，destroy 顺序为 surface 后
  imagery collection。

### Tile、Quadtree 与 Surface

- `_SceneGISPlanarTile.js` 固定构造 Z=0 zero-thickness OBB、command sphere、unit-quad
  model matrix、一个 command 槽和 imagery bindings。
- `_SceneGISPlanarQuadtree.js` 在 visibility 后计算 SSE；透视距离只考虑 XY extent 与
  `abs(camera.z)`，误差固定为 `worldWidth / (256 * 2 ** level)`；正交路径使用 frustum
  height。
- `_SceneGISPlanarSurface.js` 延迟创建 shared flat VA、opaque render state、transparent
  texture 与按 layer count 缓存的 shader。每个 selected ideal tile 只提交一个 command。
- normal render 缓存实际提交的 command references；P4 depth/pick replay 不执行 selection、
  imagery、allocation 或 LRU mutation。
- tile cache eviction 通过 tile `destroy()` 释放 imagery binding，但 shared surface resources
  只在 surface destroy 时释放。

### Heightmap 与上游可复用点

- `SceneGISPlanarHeightmapTerrainData` 已在构造期验证并接管 buffer，内部 file-scope decoder
  能准确读取 structure；公共 API 没有 raw buffer 或 mesh method。
- `interpolateHeight` 面向世界坐标和 triangle surface，不适合作为规则网格原 sample 的内部
  读取路径，特别是在大 absolute extent 下。
- Cesium `TerrainProvider.getRegularGridIndices(width, height)` 是坐标无关的规则网格 helper，
  使用 NW/SW/NE 与 NE/SW/SE 两个 triangle，正好形成 SW→NE diagonal，并根据 vertex count
  选择 index TypedArray。
- 官方 Heightmap tessellation/mesh/Worker 依赖 geodetic rectangle、ellipsoid、encoding 与
  horizon；T2 不使用。

### Shader、Renderer 与 pass

- 当前 vertex shader 只读取 `vec3 position`，通过 `position.xy + 0.5` 生成 UV，并使用
  `czm_modelViewProjection`。terrain mesh 保持相同 local XY 后无需新 shader。
- `VertexArray.destroy()` 默认销毁 `vertexArrayDestroyable` 的 vertex/index buffers；共享 index
  buffer 必须显式标记为非 VA-owned，并由 terrain runtime exactly once 销毁。
- current surface 已在 `beginFrame` 与 `render` mutation 前验证 single Context。terrain 不能
  建立旁路 Context ownership。

## 已确认设计

完整长期决定以 ADR-0008 为准。本节把其转换为本阶段可执行边界。

### 1. Public World attachment

`SceneGISPlanarWorld.prototype.terrainProvider` 是 getter/setter，初始为 `undefined`；T2 不增加
constructor option。

setter 接受 `undefined` 或 structural provider。非 `undefined` provider 必须在 mutation 前
完成以下 preflight：

- `tilingScheme` 与 `world.tilingScheme` strict identity；
- finite ordered global heights，且 relative range 可进入当前 Float32 mesh；
- integer `maximumLevel` 位于 tiling safe range，且不低于 `world.maximumLevel`；
- structural event、Credit、request、availability methods 完整；
- `0..world.maximumLevel` 的 error finite、non-negative、non-increasing。

预先缓存每层：

```text
effectiveError = max(flatNominalError, providerError)
```

重复设置同一 provider 是 no-op。attachment、replacement 和 detach 都不销毁 caller-owned
provider。无效赋值不得取消旧请求、清除旧 command 或改变 readiness。

### 2. Private Heightmap sample seam 与 mesh builder

- 在 concrete Heightmap 上增加最小 `@private` exact sample method；它只接受已经验证的 row/
  column 或 sample address，不暴露 buffer，不加入 public interface。
- 新增 private Renderer mesh module，输入 Heightmap + tile extent，输出 tile-owned CPU mesh：
  vertex positions、shared CPU indices reference、grid dimensions、min/max、reference height 和
  draw count。
- local X/Y 固定 `[-0.5, 0.5]`，Y 从 south 到 north；local Z 为 decoded height 减
  overflow-safe reference-height midpoint。
- 所有写入 Float32 的 component 必须 finite；index/vertex count 与 allocation length 必须安全，
  但不为无收益的极端 TypedArray 组合建立测试矩阵。
- indices 只复用 `TerrainProvider.getRegularGridIndices`；不得使用官方 TerrainMesh、
  HeightmapTessellator、TerrainEncoding、skirt helper 或 Worker。

### 3. Tile 三维状态

tile 保留稳定 address/extent，并增加 lazy terrain entry/release seam 与可更新的：

- exact selection `OrientedBoundingBox`；
- derived command `BoundingSphere`；
- `minimumHeight` / `maximumHeight`；
- terrain/flat `modelMatrix`；
- command geometry fields。

bounds 状态：

- flat：`[0, 0]`；
- pending：`[min(0, provider.minimumHeight), max(0, provider.maximumHeight)]`；
- READY：TerrainData accurate range；
- terminal failure/unavailable：`[0, 0]`。

更新复用现有 OBB、sphere 和 matrix object。provider replacement 在下一次 selection 前把所有
resident tile 恢复到新 pending range；detach 恢复 flat range。tile destroy 必须安全、幂等地
调用 terrain 与 imagery 两类 release seam。

### 4. Quadtree 三维 selection

- `distanceToTile` 使用 camera 到 tile closed X/Y/Z intervals 的 `Math.hypot(dx, dy, dz)`；
- selection 使用 tile 当前三维 OBB；无 ellipsoid horizon；
- perspective 使用 effective terrain error 与三维距离；distance=0 仍返回 infinite SSE；
- orthographic 使用同一 effective error 与 existing effective frustum height；
- no-provider 调用保持当前 nominal error、结果和 debug allocation 行为；
- quadtree 仍只产生 ideal leaf set，不因为 readiness 选择 ancestor；T3 才改变 renderable
  dependency policy。

### 5. Minimal terrain runtime

新增 private Scene runtime，状态为 `UNLOADED`、`LOADING`、`RECEIVED`、`READY`、`FAILED`。
terrain entry lazy attach 到 selected tile，不建立第二套 tile-address Map。

- known unavailable 直接 settled FAILED/flat，不报告 error；
- request 使用 `RequestType.TERRAIN`，throttle 行为与 Provider `undefined` contract 匹配；
- sync throw、rejection、unsupported data、range mismatch、mesh/GPU failure 统一进入 provider
  error path；listener retry 只允许下一 normal frame 重试；
- Promise completion 只设置 RECEIVED/FAILED；CPU mesh、VA、bounds 与 command 只在 normal
  render 推进；
- runtime generation + tile entry generation 隔离 cancellation、replacement、eviction、destroy
  后的迟到 completion；
- T2 只调用 `getTileDataAvailable`，不调用 `loadTileDataAvailability` 或 parent
  `isChildAvailable`。

### 6. GPU 与 command

- READY tile 创建独占 vertex buffer 与 VA；terrain runtime 按 `width × height` 共享并拥有
  index buffer；
- shared index buffer 标记为 non-VA-destroyable；先销毁 tile VAs，再销毁 runtime index
  buffers；
- tile command identity 尽量复用。flat command 使用 shared unit-quad
  `TRIANGLE_STRIP/count=4`；terrain 使用 indexed `TRIANGLES` 和 mesh index count；
- shader、uniform layout、imagery slots、opaque render state、double-sided 和 depth behavior
  不变；不新增 GLSL 或 terrain shader variant；
- provider replacement/detach 立即清除 surface replay cache，再释放旧 terrain resources；
- zero buffer、hidden world、no selected tile 与 second Context 在任何 terrain mutation 前保持
  既有 early-return/fail-fast 行为。

### 7. Readiness、Credit 与 fallback

- terrain `UNLOADED/LOADING/RECEIVED` 阻塞当前 view `tilesLoaded`；
- READY、known unavailable 和无 retry terminal FAILED settled；
- final surface loaded 是 terrain 与所有 shown imagery readiness 的 conjunction；
- selected provider 添加 provider Credit，READY selected data 添加 tile credits；
- pending/failed tile 使用当前 Z=0 flat geometry，imagery 仍绑定该同一 ideal command；terrain
  READY 后在 normal render 切到真实 mesh；
- 不提交父子重叠 geometry 或第二 imagery plane。

### 8. 保持的既有契约

- `world.pick`、`pickFromWindowPosition` 与 camera controller 保持 Z=0 reference plane；
- `scene.pickPosition` 反映实际 rendered depth，但 T2 不新增 terrain picking API；
- pick/depth pass 只重放 cached command references，零 request/mesh/GPU/selection/LRU delta；
- 无 provider 时不 materialize terrain runtime/entry/request/mesh/buffer，flat P3/P5 path 保持；
- provider 替换不重建 imagery cache；tile address 与 imagery binding 继续属于同一 ideal tile。

## 明确非目标与禁止范围

### 留给 T3

- ready ancestor terrain fallback、父子 replacement、heightmap upsampling；
- mixed-LOD neighbor balancing、skirts、seam stitching 或 crack suppression；
- provider maximum level 小于 world maximum level；
- availability metadata load、child mask conflict resolution；
- Worker、transferable、per-frame mesh budget、request priority queue、byte cache；
- terminal failure 的跨祖先恢复与完整连续覆盖证明。

### 留给 T4-T6

- resident/async height query、terrain ray/window picking、navigation target 改为 terrain；
- URL/Terrain-RGB/Terrarium/公开 DEM provider 与 Sandcastle；
- normals、lighting、water mask、terrain material、shadow 或表现力；
- 人工视觉交互、E2E、发布 qualification 与正式性能 profiling。

### 本阶段禁止

- 修改 upstream-owned file、`.scenegis/upstream-patches.json`、SGP-0001/0002；
- 修改 `packages/engine/Source/Shaders/**`、增加 `.glsl`、builtin 或 shader generator；
- 修改 `packages/engine/Source/Workers/**`、TaskProcessor 或 build/release scripts；
- 复用/继承/包装官方 TerrainData/TerrainMesh/Globe surface runtime；
- 修改 widgets、Viewer、Sandcastle、E2E、DataSources 或 Entity clamp；
- 修改 camera controller、Z=0 public pick 语义或引入 camera collision；
- 手工修改或提交任何 generated root barrel、`.d.ts`、SpecList、API HTML 或 Build output；
- 开始 T3 文件或用临时 ancestor/skirt 逻辑掩盖 T2 crack 风险。

若实现证明以上边界不足，Execution Agent 必须停止并把源码事实、最小扩展建议和已完成验证
写回本计划，交由 Architecture Agent 裁决；不得自行创建 SGP、Worker 或 Shader seam。

## 允许的影响路径

预计允许新增：

- `packages/engine/Source/SceneGIS/Renderer/_private/_SceneGISPlanarTerrainMesh.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrain.js`
- `packages/engine/Specs/SceneGIS/Renderer/_private/SceneGISPlanarTerrainMeshSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarTerrainSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidgetSpec.js`
- `AgentDocs/planar-terrain/reviews/2026-08-07-t2-terrain-surface.md`

预计允许修改：

- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarHeightmapTerrainData.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTile.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarQuadtree.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- 对应的 existing SceneGIS Core/Scene Specs
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md`
- `AgentDocs/planar-terrain/**`

如实际无需某个预计路径，不为满足清单创建空文件。任何新增 private basename 必须以
`_SceneGIS` 开头并标记 `@private`；内部类名不加前导 `_`。若需要额外 SceneGIS-owned helper
或 Spec，先在本计划偏差区记录职责与原因。

## 实施步骤

1. 重新使用 codebase graph 与直接源码核对 planning checkpoint 后 World、Surface、Tile、
   Quadtree、Heightmap、Request、Renderer 和 Spec discovery；记录与本计划不同的事实。
2. 实现 Heightmap private exact sample seam 与 private CPU terrain mesh builder，先通过纯 CPU
   Specs 锁定方向、indices、relative height 与大坐标。
3. 扩展 tile 的 height range、OBB/sphere/model matrix reuse 与 terrain release seam；保持
   imagery destroy 顺序和幂等性。
4. 扩展 quadtree 的三维 distance 与 effective error input；先证明 no-provider selection
   regression，再增加 terrain perspective/orthographic/below-camera evidence。
5. 实现 terrain provider validator、state machine、generation、request/error/retry/cancel、
   CPU mesh advance 和 shared index-buffer ownership。
6. 在 World 增加 `terrainProvider` getter/setter，并实现 atomic attachment/replacement/detach；
   不增加 constructor option。
7. 将 terrain prepare 接入 Surface normal-render 顺序，复用 shader、imagery slot、DrawCommand
   与 depth replay；建立 terrain/imagery combined readiness 和 Credit。
8. 增加确定性 real WebGL Widget fixture，证明 non-flat pixels/depth、imagery drape、large
   EPSG:3857 offset、warm reuse、flat zero-allocation 和 lifecycle。
9. 运行本计划的最小充分验证；生成并检查 public root/types/API，但不 stage generated output。
10. 审计相对 planning checkpoint 的 affected paths、upstream ownership、SGP/markers 与 status；
    回写 source-to-spec mapping、case counts、命令结果、偏差和剩余风险。
11. 创建 pending T2 review request，保持 T2/roadmap/index `active`，停止实现；不提交、不 push、
    不进入 T3，等待 Architecture/code review。

## 验收要求

### Public contract

- `world.terrainProvider` 默认 undefined，可 attach、replace、detach；同实例 no-op。
- canonical tiling identity、global range、maximum level、method/event/credit 与 error curve 在
  mutation 前验证；失败原子。
- provider caller-owned，replacement/destroy 不调用其 destroy。
- root JS、engine/Cesium declarations 与 API HTML 出现正确 World property；private terrain
  roles 和 Heightmap sample seam 不进入 public declarations/API HTML。

### CPU mesh 与数值

- 代表性 `2 × 2` non-coplanar 和 rectangular grid 锁定 north/west direction 与 SW→NE triangles。
- 正负高度、nonzero reference height 和 accurate min/max 生成 finite relative-Z vertices。
- 完整 EPSG:3857 或等价 large-offset extent 下 local vertices 仍在固定范围，model matrix 与
  world-space corners/heights finite、方向正确。
- invalid/unsupported data、provider-range mismatch 或 non-Float32 relative height 失败且不产生
  GPU mutation。

### Selection、render 与 depth

- pending/global、READY/exact、failed/flat 三类 OBB 与 command sphere conservative；更新复用
  object。
- perspective 距离使用三维 closed range；orthographic 不依赖 camera distance；相机在 terrain
  下方仍可见且计算有限。
- effective error 取 nominal/terrain maximum；无 provider 原 selection fixture 不变。
- real WebGL 中确定性 terrain 非平面、imagery 真正贴附同一 geometry、每 tile 仍一个 opaque
  command。
- normal render cache 的相同 command refs 可用于 depth replay；replay 对 request、mesh、GPU、
  bounds、selection、LRU 和 allocation 为零 delta。
- `scene.pickPosition` 与 fixture mesh surface 一致；`world.pick` 仍返回 Z=0 reference hit。

### Async 与生命周期

- provider `undefined` scheduling、resolved/rejected Promise、retry 与 known unavailable 有代表性
  evidence。
- replacement/detach、tile eviction 和 world destroy 取消 pending request，隔离 late result；
  TerrainData/mesh/VA/index buffer exactly once 释放或放弃引用。
- 相同 grid dimension 的 visible tiles 共享一个 runtime-owned index buffer，不共享独占 vertex
  buffer。
- zero buffer、hidden/no-visible frame 不创建 terrain GPU；second Context 在 mutation 前失败。
- `tilesLoaded` 准确组合 terrain 与 imagery，并在 terminal fallback 时收敛。

### Flat regression

- fresh no-provider world 没有 terrain runtime、tile terrain entry、request、mesh、terrain VA 或
  index buffer。
- shared unit quad、imagery layer composition、depth replay、cache eviction、large coordinate、
  show/hide 与 destroy 继续通过相关 existing Specs。
- stable terrain/imagery view warm 后不持续创建 terrain request、CPU mesh、vertex/index buffer、
  VA、ShaderProgram 或 DrawCommand。

测试只使用足以证明上述契约的小型本地 fixture，不枚举所有 TypedArray、所有高度范围、所有
frustum/失败排列。mixed-LOD seam、skirt 与公开网络不属于 T2 passing claim。

## 最小充分验证命令

Execution Agent 应按实际 source-to-spec mapping 校正 basename，确保每条 includeName 有非零
命中。预计命令：

```powershell
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarHeightmapTerrainData"
npm run test -- --includeName "SceneGIS/Renderer/SceneGISPlanarTerrainMesh"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTerrain"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTile"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarQuadtree"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarImageryCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"
npm run build
npm run build-release
npm run build-ts
npm run build-docs
npm run tsc
npx eslint "packages/engine/Source/SceneGIS/**/*.js" "packages/engine/Specs/SceneGIS/**/*.js"
npx prettier --check "packages/engine/Source/SceneGIS/**/*.js" "packages/engine/Specs/SceneGIS/**/*.js"
npx prettier --check --ignore-path .gitignore "AgentDocs/planar-terrain/**/*.md" "Documentation/SceneGIS/**/*.md"
npx markdownlint "AgentDocs/planar-terrain/**/*.md" "Documentation/SceneGIS/**/*.md"
git diff --check
```

若全量 SceneGIS ESLint/Prettier 明显扩大到无关文件，可缩小到本阶段 changed JS paths，并在
结果中列出准确 glob。T2 不要求全库 Specs、Globe/Viewer aggregate、Sandcastle、E2E、标准
shader embedding、Worker/package smoke 或跨机器性能阈值；除非实际实现越过范围，此时应先
请求架构裁决，而不是自行扩大验证。

### WebGL 与 warm evidence

新增 Widget Spec 使用真实 Context 和小型 structural provider，不依赖网络。至少证明：

- flat fallback 到 terrain READY 的正常帧转换；
- non-flat pixel/depth 与 imagery drape；
- positive/negative height 或 below-terrain camera 的代表场景；
- full EPSG:3857 large XY offset；
- 相同稳定帧的 terrain/command/GPU debug counter zero delta；
- destroy/eviction/replacement 的资源 balance。

不建立大规模 timing benchmark。若开发期观察到明显主线程 mesh stall，只记录 fixture/grid
条件并留给 T3 Worker planning，不能在 T2 越权引入 Worker。

## 生成、所有权与审计

- diff base 使用 Architecture Agent 派工给出的 T2 planning checkpoint。
- public generated assertion 只期望 `SceneGISPlanarWorld.terrainProvider` 新增；不得出现 public
  mesh/runtime/sample-access symbol。
- generated root exports、`.d.ts`、SpecList、API HTML 与 Build output final status=`0`。
- upstream-owned files=`0`，T2 SGP=`0`，manifest unchanged，new patch marker=`0`。
- `SGP-0001` 的 Scene/CesiumWidget 和 `SGP-0002` 的 Viewer diff/hunks 不得改变。
- 不 stage node cache、profile、screenshots、temporary DEM 或 build output。

## 风险与已接受限制

### 主线程 mesh

T2 在 normal render 同步构建 RECEIVED heightmap mesh，适合小型确定性闭环但可能在大 grid/
多 tile 同帧产生卡顿。没有测量证据前不猜测 Worker protocol；T3 依据真实 runtime 设计
TaskProcessor、transferable、per-frame budget 和发布链。

### CPU 内存

tile 同时保留 TerrainData 与 CPU mesh，以便 T3 cache 和 T4 query/picking。T2 只受现有 tile
count cache 限制，没有 byte budget；评审只要求 release balance，不假装完成大数据内存优化。

### 裂缝与临时 flat replacement

T2 不做 ancestor/upscale/neighbor seam。mixed LOD、failed tile 或 pending→READY 可能产生可见
高度裂缝；这是已知 T3 输入，不得通过测试选择性描述为已解决。

### Private Renderer API

Buffer、VertexArray、DrawCommand mutable fields、UniformState 与 regular-grid helper 属于升级
敏感点。ADR-0008 已记录检查项；T2 不为降低这种风险复制上游 terrain runtime。

## 完成条件

- ADR-0008 的 public attachment、mesh、bounds/SSE、runtime、pass、ownership 和 flat-path 契约
  全部实现。
- T2 只内置 Heightmap adapter，但 Provider generic return contract 不改变。
- imagery 与 terrain 共用同一个 ideal tile command；normal/depth replay 和 Z=0 public picking
  边界保持。
- scoped CPU、async、WebGL、lifecycle、warm 和 flat regression evidence 通过；没有把 T3 非目标
  写入 passing claim。
- build/release/types/docs/static checks 通过，generated files 未进入 status。
- upstream-owned files=0、T2 SGP=0、manifest/SGP-0001/0002 unchanged。
- Execution Agent 回写实际路径、偏差、case counts、验证结果和剩余风险，创建 pending T2
  review 后停止；不 commit、不 push、不进入 T3。
- Architecture Agent 完成 architecture/code review，全部 finding reviewer-confirmed fixed 后，
  将 T2 code、Specs、ADR 与 AgentDocs 形成独立中文本地提交检查点。
- T2 checkpoint 完成后停下与项目负责人讨论 T3，不自动派发下一阶段。

## 偏差与结果

### 实际实现

- `SceneGISPlanarWorld.terrainProvider` 采用完整 structural preflight 后再切换 Surface runtime；
  canonical tiling identity、高度范围、level coverage 和 geometric-error curve 均在 mutation 前
  验证。相同实例 no-op，replacement/detach 释放内部状态但不销毁 caller-owned provider。
- Heightmap 增加 private `_getSample(row, column)`；mesh builder 生成 NW row-major tile-local
  Float32 positions，并只复用 `TerrainProvider.getRegularGridIndices`。
- Terrain runtime lazy attach 到 selected tile，维护五态、generation/attempt、
  `RequestType.TERRAIN`、structural/Cesium Event error/retry、shared index buffer 和 tile-owned VA。
  Promise completion 只进入 `RECEIVED`，CPU/GPU/bounds/command mutation 仅在 normal render。
- Tile 的 OBB、command sphere 和 model matrix 原地更新；Quadtree 使用 closed XYZ distance 与
  effective error。pending 使用 provider global range 与 Z=0 union，READY 使用 exact tile range，
  terminal failure 回到 flat bounds。
- Surface 保留 lazy flat quad，READY terrain 使用 indexed `TRIANGLES`。terrain 与 imagery 继续
  共用一个 ideal tile/opaque command；pick+depth 精确 replay。readiness、credits、single Context
  和 destroy/eviction ownership 在同一 lifecycle 汇总。

### 最终 source-to-spec mapping

| Source                                            | Direct Spec                                          | Direct cases |                              T2 added |
| ------------------------------------------------- | ---------------------------------------------------- | -----------: | ------------------------------------: |
| `Core/SceneGISPlanarHeightmapTerrainData.js`      | `Core/SceneGISPlanarHeightmapTerrainDataSpec.js`     |           10 | 0（既有 case 增加 sample assertions） |
| `Renderer/_private/_SceneGISPlanarTerrainMesh.js` | `Renderer/_private/SceneGISPlanarTerrainMeshSpec.js` |            3 |                                     3 |
| `Scene/_private/_SceneGISPlanarTerrain.js`        | `Scene/_private/SceneGISPlanarTerrainSpec.js`        |            6 |                                     6 |
| `Scene/_private/_SceneGISPlanarTile.js`           | `Scene/_private/SceneGISPlanarTileSpec.js`           |            7 |                                     2 |
| `Scene/_private/_SceneGISPlanarQuadtree.js`       | `Scene/_private/SceneGISPlanarQuadtreeSpec.js`       |           12 |                                     1 |
| `Scene/_private/_SceneGISPlanarSurface.js`        | `Scene/_private/SceneGISPlanarSurfaceSpec.js`        |           21 |                                     1 |
| `Scene/SceneGISPlanarWorld.js`                    | `Scene/SceneGISPlanarWorldSpec.js`                   |           15 |                                     1 |
| Real Context integration                          | `Widget/SceneGISPlanarTerrainCesiumWidgetSpec.js`    |            1 |                                     1 |

T2 新增 direct unique case 为 15。Tile includeName aggregate 12 包含 TileImagery 5；Surface
aggregate 23 包含 SurfaceShader 2，均不重复计入对应 source direct count。

### 验证矩阵

| Command                                                               | Result                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Heightmap / mesh / terrain runtime                                    | Exit 0；10/10、3/3、6/6                                         |
| Tile / Quadtree / Surface / World                                     | Exit 0；12/12 aggregate、12/12、23/23 aggregate、15/15          |
| Terrain / imagery / navigation Widget                                 | Exit 0；1/1、9/9、4/4                                           |
| `npm run build` / `build-release`                                     | Exit 0                                                          |
| `npm run build-ts`                                                    | Exit 0；保留仓库既有 TSD-JSDoc warnings，无新增 terrain warning |
| `npm run build-docs` / `npm run tsc`                                  | Exit 0                                                          |
| Scoped ESLint、JS/Markdown Prettier、Markdownlint、`git diff --check` | Exit 0                                                          |

真实 Context 选择 4 个 Level-1 tile，创建 4 个独占 terrain VA 并共享 1 个 runtime-owned index
buffer；每个 tile 与 imagery 共用一个 command。warm render 与 depth replay 的 command references
和 terrain debug counters 零增量；tile 内部 `(-64, 64)` 的 SW→NE 插值为 `Z=30`，真实
`scene.pickPosition` 与 Heightmap surface 闭环，同一 window ray 的 `world.pick` 仍为 Z=0；destroy
后 VA/index created/destroyed 计数平衡。

### 生成、所有权与剩余风险

- engine/root declarations 与 API HTML 出现
  `terrainProvider: SceneGISPlanarTerrainProvider | undefined`；`_getSample`、private mesh/runtime 在
  declarations/API 命中 0，generated status=`0`。
- 相对 `ca55db7c8a6ec8a5c512a40cf20fa223f58635d8`，upstream-owned files=`0`、T2 SGP=`0`、
  manifest/SGP-0001/SGP-0002 unchanged、new patch marker=`0`。
- 无公共 API、pass、fallback、Shader/Worker 或 allowed-path 偏差。private mesh adapter 以
  `_getSample` capability 识别 Heightmap adapter，避免 test/build bundle 重复 module identity 导致
  `instanceof` 假阴性；T2 runtime 仍只支持该 adapter。
- 主线程 mesh、无 ancestor fallback/upsampling/skirt/seam、CPU mesh 无 byte budget 均保持
  ADR-0008 已接受限制，未扩展到 T3。

### Architecture review

- 首轮 review 状态为 `changes-requested`。实现边界、provider/runtime、三维 bounds/SSE、单 command
  合成和资源所有权未发现独立缺陷。
- `T2-R001` 已按裁决 focused 修复：既有 Widget case 在 NW Level-1 tile 内部 `(-64, 64)` 锁定
  `Z=30`，真实 depth `scene.pickPosition` 与同一 Heightmap interpolation 一致，同一 window ray 的
  `world.pick` 保持 Z=0；focused suite 1/1、Exit 0，case count 不变。现有绿色像素、command
  identity、warm 与 destroy 证据均保留。
- Architecture Agent focused re-review 已确认 `T2-R001` 为 `fixed`，review 为 `approved`，无
  unresolved finding；T2 状态为 `completed`。本阶段代码、Specs、ADR 与 AgentDocs 纳入独立本地
  checkpoint，不 push，也不自动进入 T3。
