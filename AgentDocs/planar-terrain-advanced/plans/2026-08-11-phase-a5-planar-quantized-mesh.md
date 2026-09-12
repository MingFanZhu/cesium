# 阶段计划：A5 平面 Quantized-mesh Terrain

## 元数据

- Plan type：`phase`
- Status：`completed`
- Owner role：`execution`
- Architecture review：`confirmed`
- Architecture reviewer：Architecture Agent
- Created：`2026-08-11`
- Updated：`2026-08-11`
- Parent plan：
  [总体计划：SceneGIS 平面高级地形](2026-08-10-planar-terrain-advanced-extension.md)
- Entry checkpoint：`bf339ee853c9ad0eb484c34b09771e56d426707f`
- Related decision：
  [ADR-0028](../../../Documentation/SceneGIS/Decisions/ADR-0028-planar-quantized-mesh-terrain.md)
- Related review：
  [A5 Architecture/code review](../reviews/2026-08-11-a5-planar-quantized-mesh.md) (`approved`)
- Related patch：None planned；预计 upstream-owned files=`0`、A5 SGP=`0`

## 阶段目标

在不建立第二套 quadtree/surface 状态机、不引入 Globe/Ellipsoid 语义的前提下，为平面地形增加完整的
quantized-mesh 数据与通用 URL provider 路径。阶段结束时，Quantized mesh 必须与 Heightmap 一样进入现有
canonical tiling、direct/upsampled/flat fallback、四子覆盖、query/pick、imagery、lighting、Worker、GPU 与
resource lifecycle；不能只完成 binary decoder 或只能绘制 direct tile。

## 进入基线与源码事实

- A4 checkpoint `bf339ee853` 已完成唯一 `SceneGISPlanarTerrainWorker` entry、private lazy scheduler、
  `decodeLerc` / `createHeightmapMesh` task、transfer/result preflight和runtime async mesh state。
- `SceneGISPlanarTerrainProvider` / `SceneGISPlanarTerrainData` 是格式无关public structural contract；
  `SceneGISPlanarHeightmapTerrainData`只是当前唯一concrete data。
- Runtime仍用 `_createMeshTaskPayload` + `_getSample` 判断Heightmap；shared index cache只适用于regular grid。
- Heightmap fallback通过private synchronous sampler生成直接child Heightmap；Quantized mesh需要保留真实triangle
  topology，不能先重采样为规则Heightmap。
- Resident height query假定`mesh.width/height`；terrain ray pick已经只依赖surface indices，适合复用。
- Official quantized-mesh-1.0 的coordinate-neutral部分是tile-local `u/v/height`、CCW triangles和edge lists；
  header ECEF center/bounds/horizon不属于planar contract。
- 仓库已有small 16-bit与一个32-bit quantized fixture，可在无公网、无token条件下验证格式和许可边界。
- 现有Worker entry/build/package链已由A4闭环；A5不新增entry或预防性修改build。

## 已批准设计

### 1. 公共 TerrainData

新增 `SceneGISPlanarQuantizedMeshTerrainData`，接管decoded absolute quantized vertices、surface/edge indices、
量化height interval与metadata。构造器必须原子验证长度、datatype、`0..32767`、CCW/nondegenerate triangle、
edge membership/coverage、index bounds、height range与metadata；成功后调用方不得修改storage。

Public `minimumHeight/maximumHeight`由实际decoded vertices扫描得到；private保存quantization interval。
`interpolateHeight`按真实triangles工作，extent外返回undefined。类不公开raw storage、mesh或upsample API，只提供
private payload clone seam给A5 adapter。

### 2. 公共 generic URL provider

新增 `SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider`：caller-supplied canonical scheme，XYZ/TMS、subdomain、
global meter range、required Level-0 error、maximumLevel、Credit与Event。它不读取layer.json/CRS/metadata，不重投影。

Request显式发送base quantized-mesh Accept header，`fetchArrayBuffer`后transfer给Worker decode。Provider负责main-thread
result preflight与TerrainData构造；error/retry/cache仍属于既有runtime。Availability是完整`0..maximumLevel`
pyramid；global Credit不复制进tile data。

### 3. Worker task 与 upsample

在ADR-0027同一private handler/scheduler中新增：

- `decodeQuantizedMesh`；
- `createQuantizedMeshMesh`；
- `upsampleQuantizedMesh`。

Decode严格检查safe binary boundaries、delta/zig-zag、high-water indices、edge lists和extension length；ECEF fields只
校验/跳过。Mesh task生成tile-local Float32 surface/skirt、per-tile indices与bounded uniform-cell query index。
Upsample task裁剪父级真实triangles到一个direct child，重映射u/v、重新量化height、去重并重建edges；输出仍是
Quantized TerrainData，不转Heightmap。

TerrainData-owned arrays只transfer独立clone。Worker completion只记录CPU state；rehydration、GPU与active mutation留在
normal render。不得复制完整上游Worker；少量坐标无关启发必须注释source path/upstream baseline。

### 4. Runtime、GPU 与 query

Private mesh adapter按data capability分发Heightmap/Quantized task和result finalizer。Heightmap继续使用shared
regular-grid index buffer；Quantized content创建tile-owned index buffer，并在candidate rollback/replacement/eviction/
detach/destroy中exactly once释放。

Fallback新增Quantized async data-upsample state，然后进入mesh state。所有runtime terrain Worker task共享每normal frame
最多两个start；GPU promotion仍最多两个；blocking coverage优先。Generation/attempt/source revision/token隔离late
upsample与mesh result，direct不得被stale fallback覆盖。

Query按mesh private kind分支：Heightmap保留regular 3×3 cell；Quantized使用Worker生成的bounded cell references并测试
实际Float32 surface triangles。Ray pick继续复用generic surface triangle path。所有skirt均排除在semantic query/pick外。

### 5. 保持不变的契约

- canonical `SceneGISPlanarTilingScheme` identity、米制Cartesian3、1×1 root与无wrap；
- `DIRECT > UPSAMPLED > FLAT`、四子门禁、single cover、actual-render-tile imagery；
- normal-render-only request/task/promotion/GPU/LRU mutation与depth exact-command replay；
- caller-owned provider、no-provider flat zero allocation、single Context与exactly-once lifecycle；
- `world.pick` / `pickFromWindowPosition`仍是Z=0，terrain query/pick与scene depth职责不变；
- A1-A3 navigation、surface/underground和clearance不改变，只从generic resident/rendered terrain读取结果；
- A5不实现oct normals、water rendering、sparse metadata、public service discovery或A6 lighting方案。

## 允许的实现路径

### Product source

- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarQuantizedMeshTerrainData.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.js`
- `packages/engine/Source/SceneGIS/Core/_private/**`：quantized decode/result adapter、upsample adapter、existing Worker
  tasks/scheduler的最小扩展
- `packages/engine/Source/SceneGIS/Renderer/_private/_SceneGISPlanarTerrainMesh.js`及确有需要的同层private helper
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrain.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrainQuery.js`
- `packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js`仅在thin wrapper确有必要时修改；预计不需要
- `scripts/scenegis/verify-planar-packages.mjs`：更新public inventory与Worker/package evidence
- `Documentation/SceneGIS/**`、`AgentDocs/planar-terrain-advanced/**`

### Specs

- 新 public data/provider Specs镜像Core路径。
- 扩展existing private Worker task、mesh、upsample、terrain runtime、query、sampler与terrain Widget Specs；只有职责
  明确无法落入existing suite时才新增private Spec文件。
- 使用仓库内fixture，只补一个32-bit representative；不下载或提交新公网binary。

### 禁止范围

- 不修改 `SceneGISPlanarTerrainProvider` / `SceneGISPlanarTerrainData` public interface或World public API。
- 不修改Quadtree coverage规则、camera controller、imagery、content、ground、Viewer或Widgets product runtime。
- 不引入layer.json、projection、ellipsoid、Cartographic、TerrainEncoding、horizon、public decoder callback或extension API。
- 不新增Worker entry、Shader、WASM、static runtime asset、E2E或重复Sandcastle。
- 不修改upstream-owned file；若实证需要大量Cesium修改或改变总体范围，暂停并回报Architecture。
- 不手工编辑或提交generated files。

## Source-to-Spec 映射

| Source / role             | 最小直接证据                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Quantized TerrainData     | ownership/preflight、实际range、interpolation、edges/child mask、representative malformed         |
| URL Quantized provider    | XYZ/TMS/header、Accept、Request defer/reject、global range、full pyramid、provider→World          |
| Worker decode             | actual TaskProcessor small fixture、transfer、16-bit、一个32-bit、extension skip/error            |
| Worker quantized mesh     | local XY/Z、CCW、skirt、per-tile indices、bounded query grid、finite metadata                     |
| Worker quantized upsample | 四个direct child中代表性边界/内部clip、独立data、surface continuity、createdByUpsampling          |
| Terrain runtime           | direct/fallback/flat、task budget、revision/stale/retry、mixed Heightmap/Quantized、index release |
| Terrain query + sampler   | resident actual Float32 height、ray/window pick regression、public data interpolation             |
| Real Context Surface      | quantized+imagery pixel/depth/query/pick、single command、warm refs、replay、destroy              |
| Package/build             | dev/release Worker tasks、public `26/2/28` inventory、types/API、private boundary                 |

## 执行步骤

1. 先实现并测试公共 TerrainData 的CPU契约，不接Scene/GPU。
2. 在existing Worker handler中实现binary decode，并由generic URL provider完成main-thread rehydration。
3. 实现quantized mesh task/finalizer、bounded query grid与tile-owned GPU index lifecycle；保持Heightmap regression。
4. 实现direct-child triangle clip upsample task及runtime async fallback state，接入shared task/promotion budgets。
5. 接入resident query、sampler和real Context closure，确认navigation只消费既有generic terrain API。
6. 更新public declarations/API/package inventory、durable docs与AgentDocs；完成ownership/generated审计。
7. 创建pending A5 review并停下，禁止进入A6、提交或push。

## 最小充分验证

执行时以实际修改路径收敛命令，至少包括：

```powershell
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarQuantizedMeshTerrainData"
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider"
npm run test -- --includeName "SceneGISPlanarTerrainWorker"
npm run test -- --includeName "SceneGISPlanarTerrainMesh"
npm run test -- --includeName "SceneGISPlanarTerrainUpsampler"
npm run test -- --includeName "SceneGISPlanarTerrainQuery"
npm run test -- --includeName "SceneGISPlanarTerrain"
npm run test -- --includeName "SceneGISPlanarTerrainSampler"
npm run test -- --includeName "SceneGISPlanarTerrainCesiumWidget"
npm run build
npm run build-release
npm run build-ts
npm run build-docs
npm run tsc
node scripts/scenegis/verify-planar-packages.mjs
node scripts/scenegis/audit-upstream-patches.mjs
```

另运行changed-scope ESLint/Prettier、SceneGIS/AgentDocs Markdown Prettier/Markdownlint与`git diff --check`。
不要求Globe/Viewer/full-repo、public-network、E2E、driver或性能矩阵；只有出现共享边界回归证据时才扩大。

## 完成条件

- 两个public API完成runtime、types与API docs导出，public inventory精确为engine/widgets/root `26/2/28`。
- Small local binary经真实TaskProcessor/provider/data/runtime/Surface闭环；32-bit branch有一个确定性证据。
- Direct Quantized tile可绘制；Quantized parent可异步clip为child fallback并由direct原子替换，无孔洞/父子重叠。
- Heightmap direct/upsample/shared-index行为不退化；两种data可由同一runtime capability dispatch。
- Resident query、terrain pick、sampler、imagery、lighting、depth replay与A1-A3 navigation继续使用实际surface。
- Warm frame command/VA/shader/task状态稳定；tile-owned Quantized index与其他CPU/GPU resource释放平衡。
- Build/release/package/typing/docs/static/audit通过；upstream-owned files=`0`、A5 SGP=`0`、generated status=`0`。
- Phase/results/review/handoff完整回写，Execution停在A5 review边界。

## 风险与停止条件

- Binary parser必须以safe arithmetic和bounds preflight防止malformed payload越界；不要求穷举每个截断byte。
- Quantized child clip容易在threshold、vertex dedupe、edge completeness与CCW上产生crack；若无法用small fixture和
  deterministic synthetic mesh证明四子cover，停止而不是回退为Heightmap重采样。
- Uniform query grid必须有linear memory bound与single-cell fallback；不得用未界定的triangle-cell笛卡尔积。
- Tile-owned index会扩大GPU ownership分支；任何rollback/destroy不平衡是blocker。
- Worker task无法per-task abort是ADR-0027已接受边界；late result必须token-drop，不能终止shared Worker。
- 若现有Worker/build/public barrel无法承载、需要修改upstream-owned file、要公开extension/metadata API，或格式事实迫使
  改变canonical tiling/LOD/fallback语义，立即暂停并回报Architecture。

## Execution handoff

- Implementation base：`bf339ee853c9ad0eb484c34b09771e56d426707f`。
- 修改前确认working tree只包含本A5 plan/ADR/durable-doc activation changes；保留任何用户并发修改。
- 先按本计划写源码到Spec映射，再编码。实现偏差必须先回写本计划；不得以private convenience扩大public API。
- Ready for review时创建
  `AgentDocs/planar-terrain-advanced/reviews/2026-08-11-a5-planar-quantized-mesh.md`，状态`pending`，并报告：
  完整changed paths、case counts、真实Worker/Context/package证据、upstream-owned files/SGP、generated status和剩余风险。
- 不commit、不push、不进入A6；Architecture review通过后由Architecture Agent形成独立中文checkpoint。

## 偏差与结果

### 实际设计与影响路径

- 新增 public `SceneGISPlanarQuantizedMeshTerrainData`：拥有绝对 `0..32767` U/V/H、surface/edge
  `Uint16Array | Uint32Array`，构造期原子校验长度、范围、CCW/nondegenerate、edge completeness、metadata
  和 finite height interval；public min/max从真实decoded surface vertices扫描，interpolation使用真实三角形。
- 新增 public `SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider`：caller-supplied canonical tiling
  identity、XYZ/TMS/subdomain、`Resource`/`Request`、base quantized-mesh `Accept`、full pyramid与显式
  Level-0 error；不读取layer.json/CRS，不重投影。
- 扩展唯一现有 Worker entry的private task handler/scheduler：`decodeQuantizedMesh`安全解析
  delta/zig-zag/high-water/16-bit/32-bit/extensions；`createQuantizedMeshMesh`生成tile-local Float32
  surface/skirt、per-tile indices和有线性内存上界的query grid；`upsampleQuantizedMesh`对真实父级三角形
  做direct-child clipping、dedupe、requantization和edge rebuild。
- terrain runtime按data capability dispatch：Heightmap保持同步upsample/shared regular-grid index；Quantized
  增加async fallback-data后mesh state、与直接mesh共用每帧最多2个Worker start和2个GPU promotion。
  generation/attempt/revision/token隔离late result，direct success明确作废stale fallback。
- Quantized GPU index由tile单独拥有，candidate rollback/replacement/eviction/detach/destroy exactly-once；
  Heightmap shared-index path未改变。Resident query使用bounded query grid筛选真实三角形，ray pick仍
  排除skirt。
- 最终product/source路径为两个新Core public文件、现有Core private Worker scheduler/tasks、
  Renderer terrain mesh adapter、Scene terrain runtime/query；Specs对应Core public、Worker、mesh、upsampler、
  runtime、query、sampler和terrain Widget。不需要修改Worker entry、Shader、build seam或upstream-owned file。

### Source-to-Spec 与 case 统计

| Source / role               | 实际 Spec                                                      | 本轮直接证据             |
| --------------------------- | -------------------------------------------------------------- | ------------------------ |
| Quantized TerrainData       | `SceneGISPlanarQuantizedMeshTerrainDataSpec.js`                | 5 new cases              |
| URL Quantized provider      | `SceneGISPlanarUrlTemplateQuantizedMeshTerrainProviderSpec.js` | 5 new cases              |
| Worker decode/mesh/upsample | `_private/SceneGISPlanarTerrainWorkerTasksSpec.js`             | 4 new cases; suite 7/7   |
| Renderer mesh adapter       | `Renderer/_private/SceneGISPlanarTerrainMeshSpec.js`           | 1 new case; suite 6/6    |
| Direct-child fallback       | `Core/_private/SceneGISPlanarTerrainUpsamplerSpec.js`          | 1 new case; suite 4/4    |
| Runtime states/budgets      | `Scene/_private/SceneGISPlanarTerrainSpec.js`                  | 3 new cases; suite 15/15 |
| Resident query              | `Scene/_private/SceneGISPlanarTerrainQuerySpec.js`             | 1 new case; suite 8/8    |
| Independent sampler         | `SceneGISPlanarTerrainSamplerSpec.js`                          | 1 new case; suite 8/8    |
| Real Context closure        | `Widget/SceneGISPlanarTerrainCesiumWidgetSpec.js`              | 1 new case; suite 2/2    |

- A5 direct unique new cases=`22`；上述九个focused suites aggregate=`60`，每个suite只计一次。
- Heightmap regression额外为TerrainData `10/10`、URL provider `13/13`，不计入A5 direct unique。

### 验证结果

| 命令 / 检查                                                                                           | 结果                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarQuantizedMeshTerrainData"`                | Exit 0, 5/5                                                                                               |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider"` | Exit 0, 5/5                                                                                               |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainWorkerTasks"`                      | Exit 0, 7/7; actual TaskProcessor + transfer; Node DEP0060 warning                                        |
| `npm run test -- --includeName "SceneGIS/Renderer/SceneGISPlanarTerrainMesh"`                         | Exit 0, 6/6                                                                                               |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainUpsampler"`                        | Exit 0, 4/4                                                                                               |
| `npm run test -- --includeName "SceneGIS/Scene/_SceneGISPlanarTerrainQuery"`                          | Exit 0, 8/8                                                                                               |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarTerrain"`                                | Exit 0, 15/15                                                                                             |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainSampler"`                          | Exit 0, 8/8                                                                                               |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"`                   | Exit 0, 2/2; actual Quantized provider/Worker/imagery/depth/query/pick/warm/destroy; Node DEP0060 warning |
| Heightmap TerrainData / URL provider regressions                                                      | Exit 0, 10/10 and 13/13                                                                                   |
| `npm run build`, `npm run build-release`                                                              | Exit 0                                                                                                    |
| `npm run build-ts`, `npm run build-docs`, `npm run tsc`                                               | Exit 0; build-ts only emitted existing repository TSD-JSDoc warnings                                      |
| `node scripts/scenegis/verify-planar-packages.mjs`                                                    | Exit 0; installed ESM/CJS/tar/broken-entry and inventory passed                                           |
| scoped ESLint and JS Prettier                                                                         | Exit 0                                                                                                    |
| Markdown Prettier/Markdownlint, `git diff --check`                                                    | Exit 0                                                                                                    |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                                    | Exit 0; current delivery upstream-owned entries 0, generated status 0                                     |

Public root JS/types/API均可见两个新类，engine/widgets/root inventory=`26/2/28`。Private task names、
TerrainData clone/mesh seams在installed declarations/API HTML命中=`0`；generated files未进入status。

### 实现事实、所有权与剩余风险

- 仓库small fixture经public provider、actual TaskProcessor/Build Worker、TerrainData、runtime和真实Context
  闭环；quantized+imagery仍为单个opaque command，depth replay精确复用command refs，warm task/GPU
  counters零增量，resident query和terrain pick在actual irregular triangles上一致。
- 仓库的32-bit fixture含一个degenerate triangle；它用于证明32-bit decode branch后按已批准
  public contract拒绝。独立deterministic valid `Uint32Array` mesh证明成功路径，未弱化
  nondegenerate契约。
- 边界edge list依据fixture事实不要求输入排序，但仍要求完整membership/coverage；
  upsample output以deterministic order重建。
- Real Context使用EPSG:3857全尺度、45,000 km观测距离；GPU depth reconstruction与CPU
  surface误差小于50 m，而CPU terrain pick/query严格一致。这一容差是large-offset depth精度
  证据，不改变terrain geometry。
- Worker仍继承A4无per-task abort边界；stale tasks完成后由token丢弃。A5不支持
  layer.json/extensions/public network，不属于本阶段遗漏。
- Upstream-owned files=`0`，A5 SGP=`0`，`.scenegis/upstream-patches.json`、SGP-0001/0002不变，
  new patch markers=`0`，generated status=`0`。

### Architecture review（首轮）

- Review status：`changes-requested`；A5与extension保持`active`。
- A5-R001：binary/public edge lists允许无序，但direct mesh按原序生成skirt；真实仓库fixture已证明west/east
  非单调，必须在Worker clone上按west S→N、south E→W、east N→S、north W→E canonicalize。
- A5-R002：vertex buffer创建后、index buffer创建前不在同一cleanup boundary；index allocation异常会泄漏
  candidate vertex buffer，必须补齐owned/shared原子回滚证据。
- A5-R003：Quantized URL provider的`copySubdomains`对非string/Array先调用`.slice()`并泄漏`TypeError`；应与
  Heightmap provider保持一致的`DeveloperError` preflight与caller-array clone。
- 修复只限上述三项及对应Specs/AgentDocs；不扩大public API、Worker entry、runtime语义或验证矩阵，不进入A6。

### Focused review 修复结果

- A5-R001 execution-fixed：Worker mesh task对四个edge clone按west S→N、south E→W、east N→S、north W→E
  canonicalize后生成skirt；真实仓库无序fixture与synthetic无序fixture锁定相邻edge pair、严格方向、无回折，
  TerrainData-owned arrays保持不变，既有upsample仍成功。
- A5-R002 execution-fixed：vertex/index/VA创建进入同一原子cleanup boundary；tile-owned index allocation失败
  保留原始异常，candidate vertex exactly-once destroy，shared map/ref和index counters恢复baseline。
- A5-R003 execution-fixed：provider在复制前验证subdomains类型；非法numeric代表稳定`DeveloperError`，caller
  array由provider clone持有。
- Focused复核：provider `5/5`、Worker `7/7`、mesh `6/6`、Quantized TerrainData `5/5`、upsampler
  `4/4`、terrain runtime `15/15`，`npm run build`均Exit 0。

### Architecture focused re-review

- Architecture逐项确认A5-R001～R003关闭，并独立复跑provider `5/5`、Worker `7/7`、terrain runtime
  `15/15`、official upstream audit与`git diff --check`，全部Exit 0。
- Canonical edge处理不修改TerrainData-owned arrays；GPU失败保持原始异常并只释放已取得资源；Provider错误类型
  与caller-owned array边界符合public契约。没有新增public API、Worker entry、upstream-owned diff或SGP。
- Review status：`approved`；A5状态改为`completed`，形成独立checkpoint后才可进入A6源码审计和phase planning。
