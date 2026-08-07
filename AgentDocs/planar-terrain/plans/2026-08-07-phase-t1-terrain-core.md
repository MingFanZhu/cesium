# 阶段计划：T1 平面地形 Core 契约

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- 总体计划（Parent plan）：
  [2026-08-07-planar-terrain-extension.md](2026-08-07-planar-terrain-extension.md)
- 阶段（Phase）：`T1-terrain-core`
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-07`
- 更新日期（Updated）：`2026-08-07`
- 相关讨论（Related discussions）：无；本阶段架构对话的稳定结论已提升到 ADR-0007
- 相关评审（Related reviews）：
  [T1 terrain Core review request](../reviews/2026-08-07-t1-terrain-core.md)（`approved`）
- ADR：
  [ADR-0007：平面地形 Core 契约与 Heightmap 兼容表示](../../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)
- SGP：无；本阶段禁止修改 upstream-owned file

## 目标

在不接入 Scene、Renderer 或 World 的前提下，实现平面地形后续阶段唯一的公共 Core
契约：

- `SceneGISPlanarTerrainProvider`
- `SceneGISPlanarTerrainData`
- `SceneGISPlanarHeightmapTerrainData`

阶段结束时，调用方应能定义与 canonical planar tiling scheme 匹配的 terrain provider，
并能用兼容 Cesium Heightmap buffer/structure 的数据对象完成米制高度解码、准确最值、
三角形插值和直接子瓦片 availability 查询。三个类型必须通过正式 engine root export、
types 和 API docs 暴露，同时不携带 ellipsoid、cartographic、mesh、Worker 或 GPU 语义。

## 非目标

- 修改 `SceneGISPlanarWorld` 或增加 `terrainProvider` 属性。
- 生成 terrain vertex/index、bounding volume、SSE、DrawCommand 或 GPU resource。
- 修改现有 flat surface、quadtree、tile、imagery drape、camera、picking 或 `tilesLoaded`。
- 实现请求状态机、retry、cancel、stale generation、cache、fallback 或 replacement。
- 实现 upsample 算法；T1 只保留 `wasCreatedByUpsampling` 数据标识。
- 实现 Terrain-RGB/Terrarium URL provider、image decode、GeoTIFF、runtime reprojection 或
  Sandcastle。
- 实现 NoData mask、稀疏 Level-0 coverage、partial extent、water rendering 或 normals。
- 读取或设计 Worker payload、Shader layout、mesh topology、skirt、resource budget 或 T2/T3
  私有类型。
- 修改任何 upstream-owned file、构建生成器或生成文件。
- 开始 T2 的设计或实现。

## 进入条件

- `planar-world` P1-P8 已完成并形成 checkpoint `93543c5a28`；根验证约束 checkpoint 为
  `14562040b2`。
- `planar-terrain` extension plan 已由项目负责人确认并激活，规划 checkpoint 为
  `fc569474cd`。
- 项目负责人已确认 T1 的 provider/data 分层、Heightmap compatibility、Level-0 root、
  ownership、availability 和错误边界。
- ADR-0007 状态为 `approved`，本 phase plan 状态为 `active`。
- Execution Agent 从 Architecture Agent 派工时给出的干净 T1 planning checkpoint 开始，
  留在 `feature/planar-terrain`，不另建阶段分支。
- Execution Agent 开始前重新读取根、engine、AgentDocs 的 `AGENTS.md`，以及
  Development Guide、Architecture、extension plan、ADR-0002、ADR-0003、ADR-0005 和
  ADR-0007。

## 当前源码事实

1. 当前官方基线为 Cesium `1.144`，提交
   `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
2. `SceneGISPlanarCoordinateSystem` 已固定 meters、X east、Y north、Z up；
   `SceneGISPlanarTilingScheme` 已固定 Level 0 `1 × 1`、northwest-origin XYZ、无 wrap 和
   `maximumSafeLevel`。
3. `SceneGISPlanarImageryProvider` 已验证 SceneGIS public structural interface、root export、
   JSDoc/types 和 structural `errorEvent` 的仓库惯例；T1 可以复用这种接口组织方式，不能复制
   imagery runtime。
4. 上游 `TerrainProvider` 的抽象职责包括 error、credit、tiling scheme、geometric error、
   geometry request 和 availability，但其完整语义面向 ellipsoid surface。
5. 上游 `TerrainData` 的 mesh/upsample 路径与 `Rectangle`、`Ellipsoid`、terrain encoding 和
   Worker 耦合；这些实现不能进入 T1。
6. 上游 `HeightmapTerrainData` 的 buffer/structure、north-to-south row order、SW→NE
   triangle interpolation、child mask 和可选 water mask 可以作为坐标无关的数据兼容面。
7. engine 会按现有生成链发现 SceneGIS public basename；生成的 root JS、`.d.ts`、API HTML
   和 SpecList 都不能手工修改或提交。

源码行号不是契约。Execution Agent 在实现前应先使用 codebase knowledge graph 重新确认
上述类型、依赖方向、public export/type generation 与 Spec discovery；只有图谱不足时才直接
搜索源码。

## 详细设计

### 公共类型关系

```text
SceneGISPlanarTerrainProvider
  └─ requestTileGeometry(...) → SceneGISPlanarTerrainData
                                  └─ implemented by
                                     SceneGISPlanarHeightmapTerrainData

SceneGISPlanarTerrainProvider
  └─ references → SceneGISPlanarTilingScheme
```

T1 不增加 World ownership。T2 才决定 World 如何接收 provider 和消费 TerrainData。

### `SceneGISPlanarTerrainProvider`

采用与现有 SceneGIS provider 一致的不可直接实例化 interface class。必需 getter/method 在
基类中保持抽象；availability 的两个可选方法提供 `undefined` 默认行为。

公共只读属性：

- `tilingScheme: SceneGISPlanarTilingScheme`
- `minimumHeight: number`
- `maximumHeight: number`
- `maximumLevel: number`
- `errorEvent`：只要求 readonly structural `addEventListener`/`raiseEvent` capability
- `credit: Credit | undefined`

公共方法：

```text
getLevelMaximumGeometricError(level)
requestTileGeometry(x, y, level, request)
getTileDataAvailable(x, y, level)
loadTileDataAvailability(x, y, level)
```

契约要求：

- Provider 全部高度和 geometric error 使用米。
- `minimumHeight`/`maximumHeight` finite 且有序；返回数据的准确范围不得超出它们。
- `maximumLevel` 为 `[0, tilingScheme.maximumSafeLevel]` 内整数。
- `getLevelMaximumGeometricError` 对有效层级返回 finite、non-negative 值，并随层级不增加。
- `requestTileGeometry` 返回 `Promise<SceneGISPlanarTerrainData> | undefined`；不允许同步返回
  TerrainData。
- `getTileDataAvailable` 为 tri-state；默认 `undefined`。
- `loadTileDataAvailability` 返回 `Promise<void> | undefined`；默认 `undefined`。
- Provider 构造后同步 ready，不增加 `ready`、`readyPromise`、`minimumLevel`、ellipsoid、
  projection、geodetic rectangle 或 upstream `TileAvailability`。
- Level 0 root 是首版 precondition。T1 interface 通过 JSDoc 明确；实际 concrete provider 和
  T2 attachment validation 在其所属阶段负责 fail-fast。

### `SceneGISPlanarTerrainData`

采用不可直接实例化的 Core interface class，公共只读属性为：

- `minimumHeight: number`
- `maximumHeight: number`
- `credits: Credit[] | undefined`
- `waterMask: Uint8Array | undefined`
- `wasCreatedByUpsampling: boolean`

公共方法为：

```text
interpolateHeight(extent, x, y)
isChildAvailable(thisX, thisY, childX, childY)
```

所有 concrete TerrainData 必须能够在自己的表面三角化上插值，因此未来格式不会迫使
Provider 或查询 API 改变返回类型。interface 不增加 buffer、mesh、encoding、destroy、
public upsample 或 Worker 方法。

### `SceneGISPlanarHeightmapTerrainData`

构造对象至少包含：

```text
buffer
width
height
childTileMask = 15
waterMask
structure
createdByUpsampling = false
credits
```

行为要求：

- `buffer` 是非 BigInt numeric TypedArray；构造成功后转移所有权且不复制。
- `width`、`height` 是至少为 2 的整数；首版允许矩形 sample grid。
- buffer 使用 north-to-south、west-to-east row-major，包含四条 tile edge。
- `structure` 使用 ADR-0007 的六个官方兼容字段和默认值；stride 必须覆盖一个完整 height，
  buffer length 必须与 sample count 和 stride 一致。
- raw elements 按 endian/multiplier 合并，再用 scale/offset 得到米制高度。
- 构造时扫描一次 decoded heights，拒绝 non-finite 结果并计算准确 min/max。
- `width`、`height`、准确 min/max、metadata 和 created flag 为 getter-only。
- 可选 `waterMask` 只接受 `Uint8Array`，可选 `credits` 使用 `Credit[]`；二者在 T1 不参与
  插值或渲染。
- T1 不暴露可写 raw height buffer，也不在任何操作后丢弃 buffer。
- NaN、Infinity 和 NoData 不进入 canonical TerrainData。

### 插值

`interpolateHeight(extent, x, y)` 使用 `SceneGISPlanarExtent`：

- `extent`、X/Y 的 programmer error 抛出 `DeveloperError`；
- finite outside position 返回 `undefined`；outer edges inclusive；
- X 从 west 到 east 映射 column，Y 从 north 到 south 映射 row；
- 精确 grid vertex 返回对应 decoded sample；
- cell 固定使用 SW→NE diagonal 的两个三角形做重心/线性插值；
- row/column last edge 必须稳定落在最后一个 sample，不产生越界；
- 不使用 bilinear interpolation，也不使用 epsilon 把 outside point 吸附进 extent。

### Child availability

`childTileMask` 是 `[0, 15]` 的整数，bit mapping 为 SW=`1`、SE=`2`、NW=`4`、NE=`8`。
`isChildAvailable` 只处理调用方给出的直接 child，使用 northwest-origin tile Y 判定 quadrant，
不使用 32-bit bitwise tile address 算法。非法、越界或非直接 child address 抛出
`DeveloperError`。

T1 只定义数据层语义，不实现 provider/mask 冲突的运行时状态机。T2/T3 消费时必须遵循：
任一明确 `false` 阻止请求，`undefined` 仍可尝试请求，Provider 与父数据不得给出相互矛盾的
明确结果。

### Ownership 与错误

- Provider 始终 caller-owned；T1 没有 owner 或 destroy 行为。
- TerrainData 是只读 CPU object，不持有 Request/GPU/Worker resource，也没有 `destroy`。
- Heightmap 构造成功后接管 buffer/waterMask；调用方不得继续 mutation。
- constructor/type/range/structure/address/query 错误使用英文 `DeveloperError` JSDoc 和实现。
- RequestScheduler throttling 的 `undefined`、Promise failure、retry 和 event reporting 必须在
  JSDoc 中区分；T1 不实现异步 runtime。

## 影响路径

### 允许新增或更新的 SceneGIS-owned 文件

- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarTerrainProvider.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarTerrainData.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarHeightmapTerrainData.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarTerrainProviderSpec.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarTerrainDataSpec.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarHeightmapTerrainDataSpec.js`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md`
- `AgentDocs/planar-terrain/**`

如最终 JSDoc 需要仅供类型生成的 SceneGIS-owned typedef 文件，Execution Agent 必须先回写
本计划说明必要性；不得为了组织 options 新增无行为的 public runtime class。

### 禁止修改

- 任何 `.scenegis/upstream-base.json` 记录的 upstream-owned file
- `.scenegis/upstream-patches.json`、`SGP-0001`、`SGP-0002` 或既有 patch marker
- `packages/engine/Source/SceneGIS/Scene/**`
- `packages/engine/Source/SceneGIS/Renderer/**`
- 现有 planar Core 类型的行为；只允许新类型引用它们
- widgets、Viewer、Sandcastle、E2E、Shader、Worker、build/release scripts
- 任何生成文件，包括 root exports、`.d.ts`、SpecList、API HTML 和 `Build/**`
- T2 及后续 phase 文件

若实现证明上述范围不足，Execution Agent 必须停止、记录源码事实和最小扩展建议，交回
Architecture Agent 裁决；不得自行修改 World/Renderer、创建 SGP 或扩大 phase。

## 实施步骤

1. 使用 codebase knowledge graph 重新确认上游 terrain interface、Heightmap decoding、
   SceneGIS public interface、根导出和 Spec discovery；记录与计划不同的真实源码事实。
2. 实现 `SceneGISPlanarTerrainProvider` interface 与 default unknown availability。
3. 实现 `SceneGISPlanarTerrainData` interface，固定只读 metadata、插值和 child availability
   责任。
4. 实现 `SceneGISPlanarHeightmapTerrainData` 的 Cesium-compatible structure decoding、
   ownership、validation、exact min/max 和 metadata。
5. 实现 SW→NE triangle interpolation 与 northwest-origin child mask 查询。
6. 增加三组专项 Core Specs；包含本地 EPSG:3857/Terrain-RGB-compatible structure fixture，
   但不发起网络请求。
7. 通过正常生成链验证三个 public types 的 root export、declarations 和 API docs；不手改或
   stage 生成物。
8. 运行本计划列出的最小充分验证，审计 diff、upstream ownership 和 generated status。
9. 回写实际 source-to-spec mapping、偏差、命令和结果，创建
   `AgentDocs/planar-terrain/reviews/2026-08-07-t1-terrain-core.md` pending review request。
10. 停止实现，不提交、不 push、不读取或设计 T2；等待 Architecture/code review。

## 验证要求

### 必须覆盖的 Specs

- Provider interface：不可直接实例化、required getter/method、default unknown availability、
  request return contract 的 representative mock。
- TerrainData interface：不可直接实例化、required metadata/method 和无 destroy/mesh surface。
- Heightmap default structure：Float 与 integer TypedArray、width/height、north/west sample order、
  exact min/max。
- Encoded structure：scale/offset、multiple elements、stride、big/little endian；至少一个
  Terrain-RGB-compatible local byte fixture。
- Interpolation：四角、outer edges、exact sample、SW→NE 两侧的非共面 cell、outside undefined。
- Availability：default/full/partial/empty child mask 与四个 northwest-origin direct children。
- Metadata：credits、waterMask、`createdByUpsampling` true/false。
- Errors：缺失/非法 buffer、dimension、length、structure、decoded non-finite、mask、extent、
  query coordinate 和非直接 child。
- Public API：从正式 engine root 入口导入三个类型，生成 declarations/API docs 可见。

测试以证明普通契约和关键方向为限，不枚举无收益的所有 TypedArray、所有 mask 数值或浮点
极端组合。T1 没有 WebGL、DOM、异步 runtime 或性能热路径，不增加相关验证。

### 必须运行的命令

```powershell
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainProvider"
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainData"
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarHeightmapTerrainData"
npm run build
npm run build-ts
npm run build-docs
npm run tsc
npx eslint "packages/engine/Source/SceneGIS/Core/**/*.js" "packages/engine/Specs/SceneGIS/Core/**/*.js"
npx prettier --check "packages/engine/Source/SceneGIS/Core/**/*.js" "packages/engine/Specs/SceneGIS/Core/**/*.js"
npx prettier --check --ignore-path .gitignore "AgentDocs/planar-terrain/**/*.md" "Documentation/SceneGIS/**/*.md"
npx markdownlint "AgentDocs/planar-terrain/**/*.md" "Documentation/SceneGIS/**/*.md"
git diff --check
```

Execution Agent 记录命令 exit code、专项 case 数和必要 warning。若 `includeName` 与最终真实
basename 不匹配，先修正命令并记录 source-to-spec mapping，不得把零命中当作通过。

不要求 `build-release`、全库 Specs、WebGL validation、Widget/Viewer/Globe 回归、Sandcastle、
E2E、像素、资源生命周期或性能测试；除非实现实际越过了本计划边界，此时应先停止并请求
Architecture 裁决，而不是自行扩大验证。

### 生成与所有权审计

- implementation diff base 使用 Architecture Agent 派工时给出的 T1 planning checkpoint。
- 三个 public type 必须出现在正式 engine root JS export、`packages/engine/index.d.ts`、
  `Source/Cesium.d.ts` 和 API HTML。
- 不得生成 public Scene/Renderer/Worker 类型，也不得泄露内部 buffer helper。
- upstream-owned files=`0`，T1 SGP=`0`，`.scenegis/upstream-patches.json` unchanged。
- T1 新增 `SCENEGIS_PATCH` marker=`0`。
- root export、declaration、SpecList、API HTML 和所有 Build output 只用于验证，final status=`0`。

## 风险与依赖

### 中风险：兼容数据表示被误解为复用球面 runtime

兼容范围只有 Heightmap buffer/structure、row order、child mask 和 triangle diagonal。任何
`Rectangle`、`Ellipsoid`、official mesh/upsample/Worker 引用都是 blocking deviation。

### 中风险：Encoded buffer 与实际高度范围不一致

必须基于 decoded meter values 计算 min/max，不能直接扫描 raw elements，也不能信任外部
metadata 绕过 finite validation。Terrain-RGB fixture 用来证明这条边界，不需要联网。

### 中风险：插值与后续 mesh 三角化分叉

T1 固定 SW→NE diagonal。T2 mesh 必须遵守 ADR-0007；若实现阶段发现必须改变，应先修订
ADR 和已有 Specs，不能在 renderer 内静默使用另一条 diagonal 或 bilinear height。

### 低风险：公开 metadata 的可变 TypedArray

JavaScript 无法冻结 TypedArray elements。ownership transfer 和 readonly-by-contract 必须写入
JSDoc；T1 不为 waterMask 或 buffer 引入逐次 defensive copy。

### 延迟风险：Sparse root、NoData 与 Worker

这些能力会改变 provider、fallback 或数据传输协议，必须留给出现实际需求的后续 phase。
Execution Agent 不为“以后可能需要”预留未批准的 public option 或 private state machine。

## 完成条件

- 三个 public Core 类型按 ADR-0007 实现，依赖方向不越过 Core。
- Heightmap 可直接描述 Cesium-compatible encoded buffer，并正确得到米制高度、最值和
  SW→NE interpolation。
- Provider Level-0、global height range、geometric error、request 和 tri-state availability
  契约在 JSDoc/types 中清楚表达。
- child mask、metadata、ownership 和错误边界具有最小充分自动化 Specs。
- root exports、types、API docs 和 scoped static checks 通过，生成文件未进入 diff。
- upstream-owned files=0、T1 SGP=0、manifest unchanged、new patch marker=0。
- Execution Agent 回写偏差与验证结果并创建 pending T1 review request，然后停止。
- Architecture Agent 完成 architecture/code review；全部 finding reviewer-confirmed fixed，
  phase 和 extension roadmap 状态更新完成。
- Architecture Agent 以中文提交信息把 T1 代码、Specs、ADR/Architecture 和 AgentDocs 形成
  独立本地 checkpoint；提交前不得讨论、激活或实现 T2。
- 不 push；T1 checkpoint 后停下与项目负责人讨论 T2。

## 偏差与结果

### 实际设计与路径

实现与 ADR-0007 和本 phase plan 一致，没有扩大公共契约或影响路径：

- `SceneGISPlanarTerrainProvider` 和 `SceneGISPlanarTerrainData` 使用现有 SceneGIS
  structural interface class 风格，不可直接实例化；availability 两个方法提供
  `undefined` 默认行为。
- `SceneGISPlanarHeightmapTerrainData` 是只读 CPU data object。构造器接管 numeric
  TypedArray 和可选 `waterMask`，克隆并冻结归一化后的私有 structure，构造期扫描 decoded
  meter heights 得到准确 min/max。
- Heightmap 解码遵循 Cesium-compatible endian/multiplier/scale/offset；插值严格使用 SW→NE
  triangle split；child mask 使用 northwest-origin address 和 SW=`1`、SE=`2`、NW=`4`、
  NE=`8`。
- 没有新增 private module、mesh、Worker、GPU、request runtime 或 T2 seam。

source-to-spec mapping：

| Source                                                                       | Spec                                                                            | Direct cases |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------ |
| `packages/engine/Source/SceneGIS/Core/SceneGISPlanarTerrainProvider.js`      | `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarTerrainProviderSpec.js`      | 4            |
| `packages/engine/Source/SceneGIS/Core/SceneGISPlanarTerrainData.js`          | `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarTerrainDataSpec.js`          | 3            |
| `packages/engine/Source/SceneGIS/Core/SceneGISPlanarHeightmapTerrainData.js` | `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarHeightmapTerrainDataSpec.js` | 10           |

总计 17 个 direct unique cases。没有 aggregate overlap。新增的第 10 个 Heightmap case 使用完整
EPSG:3857 extent 和本地 RGBA Terrain-RGB-compatible buffer（`stride=4`），锁定 decoded
min/max、north/west row/column 方向以及中心有限插值。

### 偏差

- 无 architecture/API/path 偏差；因此未改写已批准的 ADR-0007 或 Architecture durable
  contract。
- 开发期首次在 build 前直接执行 Provider suite 时，顶层聚合文件已发现新 basename，但
  engine root barrel 尚未生成，编译以 3 个 missing export 结束且没有运行用例。按仓库正常
  `npm run build` 生成链刷新后，三个专项 suite 均真实命中并通过。
- 开发期 `tsc` 首次发现 concrete function-style Core 文件中的局部 `@ts-check` 与仓库现有
  getter 构造模式冲突；移除该文件的局部 opt-in 后，正式 JSDoc declaration 仍完整生成，
  最终 `tsc` 通过。没有通过 `@ts-ignore` 或降低公共声明规避类型检查。

### 验证矩阵

| Command                                                                                                             | Result                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainProvider"`                                       | Exit 0；4/4 passed；15992 skipped                                                                                      |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainData"`                                           | Exit 0；3/3 passed；15993 skipped                                                                                      |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarHeightmapTerrainData"`                                  | Exit 0；10/10 passed；15987 skipped；T1-R001 focused rerun                                                             |
| `npm run build`                                                                                                     | Exit 0；engine/widgets/root unminified bundles generated successfully                                                  |
| `npm run build-ts`                                                                                                  | Exit 0；declarations generated；保留 Cesium 1.144 既有 TSD-JSDoc parent/type warnings，无新增 SceneGIS terrain warning |
| `npm run build-docs`                                                                                                | Exit 0；API HTML generated                                                                                             |
| `npm run tsc`                                                                                                       | Exit 0                                                                                                                 |
| `npx eslint "packages/engine/Source/SceneGIS/Core/**/*.js" "packages/engine/Specs/SceneGIS/Core/**/*.js"`           | Exit 0                                                                                                                 |
| `npx prettier --check "packages/engine/Source/SceneGIS/Core/**/*.js" "packages/engine/Specs/SceneGIS/Core/**/*.js"` | Exit 0                                                                                                                 |
| `npx prettier --check --ignore-path .gitignore "AgentDocs/planar-terrain/**/*.md" "Documentation/SceneGIS/**/*.md"` | Exit 0                                                                                                                 |
| `npx markdownlint "AgentDocs/planar-terrain/**/*.md" "Documentation/SceneGIS/**/*.md"`                              | Exit 0                                                                                                                 |
| `git diff --check`                                                                                                  | Exit 0                                                                                                                 |
| PowerShell root/types/API/ownership assertion relative to `0e7cef708d...`                                           | Exit 0；11 allowed changed paths；public symbols 在 engine/Cesium JS、d.ts、API HTML 中均命中；其他审计项均为 0        |

按阶段边界未运行 `build-release`、全库 Specs、WebGL、Widget/Viewer/Globe、Sandcastle、E2E
或性能测试；T1 没有触及这些运行时。

### 生成与所有权审计

- 正式 `packages/engine/index.js`、`packages/engine/index.d.ts`、`Source/Cesium.js`、
  `Source/Cesium.d.ts` 均生成三个 public type；declaration 进一步证明 readonly metadata、
  structural `errorEvent`、Promise terrain return 和 Heightmap options/structure shape。
- `Build/Documentation/SceneGISPlanarTerrainProvider.html`、
  `SceneGISPlanarTerrainData.html` 和 `SceneGISPlanarHeightmapTerrainData.html` 均存在。
- 最终 tracked/generated status=`0`；没有手工修改或提交 root barrel、declaration、SpecList、
  API HTML 或 Build output。
- 相对 implementation base `0e7cef708d23fe333ab83d8dfe3b84cbd7457469`，产品/测试 diff
  仅为六个获准 SceneGIS-owned Core/Spec 新文件和本阶段 AgentDocs 回写。
- upstream-owned files=`0`；T1 SGP=`0`；`.scenegis/upstream-patches.json` unchanged；新增
  `SCENEGIS_PATCH` marker=`0`。

### 剩余风险与交接

- Heightmap ownership 依赖调用方遵守构造成功后不再 mutation TypedArray 的契约；JavaScript
  无法冻结 TypedArray elements，这是 ADR-0007 已接受风险。
- T1 只定义 structural Provider；global range、canonical tiling identity、Level-0 root 和
  Promise return 的 concrete attachment/runtime fail-fast 属于后续已规划阶段，不在 T1
  预实现。
- T1-R001 已在唯一获准的 Spec 中补充完整 EPSG:3857 + RGBA Terrain-RGB deterministic fixture；
  产品源码无变化，Architecture Agent focused re-review 已确认 `fixed`。
- Review request：
  [2026-08-07-t1-terrain-core.md](../reviews/2026-08-07-t1-terrain-core.md)。T1 与 extension
  review 已 `approved`，无 unresolved finding；T1 状态为 `completed`。Architecture Agent 将
  本阶段代码、Specs、ADR/Architecture 和 AgentDocs 形成独立本地 checkpoint；提交后停下与
  项目负责人讨论 T2，不直接进入实现。
