# T5 阶段计划：通用 XYZ Heightmap Provider 与可执行 Terrain 案例

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- Parent extension：
  [SceneGIS 平面地形总体计划](2026-08-07-planar-terrain-extension.md)
- 负责人角色（Owner role）：`architecture` / `execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-08`
- 更新日期（Updated）：`2026-08-08`
- Planning checkpoint / implementation diff base：
  `16983856e605280c709ca14f55a0f630d465202f`
- 相关讨论（Related discussions）：项目负责人与 Architecture Agent 已审阅并批准本阶段完整设计；
  明确否决 EPSG:3857/ArcGIS 专用公共 provider，要求通用 XYZ provider 不解释 CRS，由应用保证
  world、imagery 与 terrain 数据一致；没有独立 open discussion
- 相关 ADR：
  - [ADR-0002：平面坐标与瓦片寻址契约](../../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)
  - [ADR-0005：平面栅格影像运行时与图层合成](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)
  - [ADR-0007：平面地形 Core 契约](../../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)
  - [ADR-0009：平面地形连续 LOD、上采样与缓存](../../../Documentation/SceneGIS/Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md)
  - [ADR-0011：坐标系无关的平面 XYZ Heightmap Terrain Provider](../../../Documentation/SceneGIS/Decisions/ADR-0011-planar-url-template-heightmap-terrain-provider.md)
- SGP：无；T5 禁止修改 upstream-owned file
- 相关评审（Related reviews）：
  [T5 review](../reviews/2026-08-08-t5-url-template-heightmap-provider.md)（`approved`）

## 阶段目标

在不修改 T1-T4 provider/runtime/query 契约的前提下，增加第一个可直接配置的 concrete planar
terrain provider，并用一个 Sandcastle 证明公开 URL terrain、既有 planar imagery、Viewer 与
navigation 的完整组装：

- public `SceneGISPlanarUrlTemplateHeightmapTerrainProvider` 只处理通用 XYZ/TMS URL、显式
  Heightmap payload 配置与 provider contract；
- provider 不绑定 EPSG:3857、ArcGIS、Mapzen 或其他服务，不读取 CRS、不创建 tiling scheme、
  不执行重投影；
- image/RGBA structure 与 LERC 均解码为现有
  `SceneGISPlanarHeightmapTerrainData`；
- 至少一个完全本地、确定性的 provider/request/decode fixture 成为自动化 hard gate；
- 唯一 `scenegis-planar-terrain` Sandcastle 复用此前 EPSG:3857 平面案例，并可选择合适的公开
  terrain source 做 best-effort 人工验证；
- 保持 no-provider flat path、T3 fallback/resource lifecycle、T4 query/picking 和 P4/P6 navigation
  不变。

T5 是 concrete provider 与示例阶段，不实现 sparse service metadata、通用 decoder callback、
terrain lighting、法线、Worker、GeoTIFF、Quantized Mesh、重投影、离线下载或地形选择器。

## 进入基线与依赖

- 分支：`feature/planar-terrain`。
- implementation diff base：
  `16983856e605280c709ca14f55a0f630d465202f`。
- T4 已完成 Architecture/code review并形成 clean local checkpoint；Execution 必须以该 commit 为
  T5 diff base，不把 T1、planar-world 或 upstream merge-base 当作本阶段 base。
- T1 已固定 provider/data、Heightmap encoded structure、edge-inclusive sample grid 与 ownership；T5
  concrete provider只能产生该公共 TerrainData，不增加隐式第二种 mesh topology。
- T2/T3 已拥有 request、decode result之后的 CPU/GPU resource、fallback、retry、generation、cache
  和 destroy；T5 provider不得复制这些 runtime state。
- T4 query/picking 读取实际 mesh或独立请求 provider；T5 不改变其返回语义。
- P5/P6 planar-world 已提供 URL imagery、Viewer、Credit 与 Sandcastle 组装启发；terrain 案例复用
  这些 public API，不增加底图/地形 picker。

## 当前源码与服务事实

### SceneGIS provider/data/runtime

- `SceneGISPlanarTerrainProvider` 是 synchronously-ready structural interface，要求 canonical
  tiling scheme、finite global height range、maximum level、error event、Credit、geometric error、
  Promise/undefined tile request 和 tri-state availability。
- `SceneGISPlanarHeightmapTerrainData` 接受 numeric TypedArray 和 Cesium-compatible `structure`，
  构造期扫描 finite min/max；row 顺序为 north-to-south、column 为 west-to-east，四边 sample必须
  对应 tile extent，mesh/query 使用固定 SW→NE triangle。
- `_SceneGISPlanarTerrain` 在 normal render 创建 `RequestType.TERRAIN`，把 Request传给 provider；
  scheduling `undefined`、reject、retry、terminal failure、ancestor/upsampled/flat fallback 和 stale
  generation都已存在。Provider不应内部再实现第二套 retry或 mesh cache。
- World setter要求 provider.tilingScheme 与 world.tilingScheme object identity；这是数据/world匹配的
  集成门禁，不需要 provider解释 `coordinateSystem.crs`。

### URL、image 与 LERC

- `SceneGISPlanarUrlTemplateImageryProvider` 已有 `{z}/{x}/{y}/{s}`、`xyz/tms`、subdomain、
  `Resource`、Credit 与 safe-address实现模式，但 imagery 的 texture Y flip不能直接复制到 CPU
  Heightmap。
- `getImagePixels` 通过 reusable canvas按 image自然 top-to-bottom顺序返回 RGBA
  `Uint8ClampedArray`；它依赖 browser DOM/CORS。若输入是 `ImageBitmap`，terrain provider需要明确
  exactly-once close。
- engine 当前已依赖 `lerc`，官方 Worker/I3S路径使用 `Lerc.decode(ArrayBuffer)` 获取 width、height、
  pixels、statistics和mask；T5无需新增 dependency或 Worker build seam。
- URL placeholder 的排列与 scheme无关；公开 ArcGIS tiled elevation URL 的路径是
  `tile/{z}/{y}/{x}`，仍可由通用 named placeholder表达。

### 公开案例候选

- ArcGIS Tiled Elevation规范规定标称 `2^n × 2^n` cell 的 elevation tile实际包含
  `(2^n + 1) × (2^n + 1)` samples，并与邻 tile共享边界；这与当前 edge-inclusive Heightmap契约
  一致：<https://developers.arcgis.com/documentation/tiled-elevation-service/>。
- 当前公开 WorldElevation3D Terrain3D endpoint提供 EPSG:3857、LERC、257×257 sample和 north-origin
  `tile/{z}/{y}/{x}`；这些值只写在 Sandcastle配置中，不进入 provider validation：
  <https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer>。
- 公开服务的授权、CORS、SLA和 metadata可变化，因此只能作为 best-effort人工案例。自动化必须
  stub `Resource` 和 LERC结果，不请求该 endpoint。
- 既有 OSM imagery案例已记录 visible Credit和 tile usage policy；T5可复用相同组装与访问边界，
  不复制 provider实现。

## 已确认设计

完整长期决定以 ADR-0011 为准。本节将其转换为执行边界。

### 1. Public concrete provider

新增：

```text
packages/engine/Source/SceneGIS/Core/
  SceneGISPlanarUrlTemplateHeightmapTerrainProvider.js
```

构造器同步完成，实例直接满足 `SceneGISPlanarTerrainProvider` structural contract。公共名称、
constructor options、properties和异常必须提供英文 JSDoc，并进入正式 engine/Cesium exports、types
和 API docs。

必需配置：

- `url: string|Resource`；
- `tilingScheme: SceneGISPlanarTilingScheme`；
- `maximumLevel`；
- `heightmapWidth`、`heightmapHeight`，均为至少 2 的 safe integer；
- finite ordered `minimumHeight`、`maximumHeight`；
- `format: "image"|"lerc"`。

可选配置：

- `urlScheme: "xyz"|"tms"`，默认 `xyz`；
- `subdomains`，语义与 planar imagery provider一致且复制 caller array；
- `credit: string|Credit`；
- `structure`，`image` format使用并按
  `SceneGISPlanarHeightmapTerrainData.Structure`规范化；
- finite non-negative `levelZeroMaximumGeometricError`。未给出时按 Level-0 tile edge与较疏 grid
  轴的 sample spacing乘固定 `0.25` quality推导。

`format="lerc"` 时拒绝有意义的 image-only `structure`，避免调用方误以为 LERC decoded float还会
执行 RGBA structure。`format="image"` 时必须保证 structure与 RGBA stride一致；最终是否允许安全
默认值由 Execution依据现有 TerrainData构造事实决定，但不得默默把 RGBA当单 channel连续数组。

公开 readonly properties至少包括 provider contract属性，以及便于审查的 `url`、`urlScheme`、
`heightmapWidth`、`heightmapHeight` 和 `format`。不要暴露 Resource、subdomain array、LERC result或
owned pixel buffer。

Provider不读取 `tilingScheme.coordinateSystem.crs`，不要求 `EPSG:3857`，不比较数值等价 scheme，
也不从服务 metadata创建 scheme。

### 2. URL address 与 Resource

`requestTileGeometry(x, y, level, request)` 必须在任何 fetch前验证：

- level为 `0..maximumLevel` integer；
- X/Y位于该 level的 canonical square tile count；
- template expansion和 TMS Y转换使用 safe arithmetic，不使用 `1 << level`；
- caller/runtime传入的 Request原样绑定到 derived Resource。

template values只包含 `{z}`、`{x}`、`{y}`、`{s}`；其他 `Resource` query/header配置由 caller提供的
Resource保留。subdomain选择必须 deterministic。`fetchImage`/`fetchArrayBuffer` 返回
`undefined` 时 provider同步返回 `undefined`，不得创建已决 Promise伪装为已调度。

### 3. Image Heightmap

`format="image"` 使用
`fetchImage({ preferImageBitmap: true, skipColorSpaceConversion: true })`，不传
imagery-specific `flipY:true`。RGBA channel是数值payload；禁用color-space conversion只在浏览器支持
对应ImageBitmap option时生效。构造期必须完整规范化并验证structure，以及
`width * height * stride`可表示性，静态错误不得触发fetch。
Promise成功后：

1. 验证 image width/height与显式 sample dimensions精确相等；
2. 使用 `getImagePixels` 取得独立 RGBA TypedArray；
3. 构造 `SceneGISPlanarHeightmapTerrainData`，传入 structure、Credit之外的 tile data和 child mask；
4. 若 image具有可调用 `close`，无论成功、decode失败或构造失败都只调用一次。

Image decode的第一 row必须仍是 north edge。Provider不对 pixel-center数据做隐式 half-pixel移动、
neighbor request、border duplicate或resample。

### 4. LERC Heightmap

`format="lerc"` 使用 `fetchArrayBuffer`，在 Promise链中调用 `Lerc.decode`：

- decoded结果必须有且仅有一个 numeric non-BigInt band；
- result width/height必须精确匹配显式配置；
- mask存在时必须证明每个 sample有效；statistics/noData或实际 pixels出现 invalid sample时 reject整
  tile；
- decoded TypedArray ownership转交给新的 `SceneGISPlanarHeightmapTerrainData`，使用单 element
  默认 structure；
- 不复制 ArcGIS provider、metadata builder、TileAvailability或 Worker代码。

LERC decode错误保持原始 cause可诊断，并通过 request Promise rejection进入 terrain runtime。
不要在 provider内 raise第二次 errorEvent或自行 retry。

### 5. Availability、child mask 与 geometric error

首版 concrete provider表示 full pyramid：

- `getTileDataAvailable` 对合法 `0..maximumLevel`地址返回 `true`，超过 maximum level返回
  `false`；非法 programmer input与 request address validation保持一致；
- `loadTileDataAvailability` 返回 `undefined`；
- tile `level < maximumLevel` 的 `childTileMask=15`，末级为 0；
- sparse service或公开 endpoint的缺 tile由 request failure和T3 fallback处理，不把
  service-specific Tilemap加入通用 API。

`getLevelMaximumGeometricError(level)` 使用 construction时固化的 Level-0 error除以 `2 ** level`，
必须 finite、non-negative、non-increasing。World现有 nominal error合成保持不变。

### 6. Ownership 与错误边界

- Provider caller-owned；World attach、replace、detach、destroy均不销毁 provider。
- Provider只拥有自身 Resource/config copies/Event/Credit reference，不创建长期 tile payload cache。
- TerrainData ownership在成功构造后交给请求结果和World runtime；provider不保留 buffer引用。
- Request、retry、stale generation、promotion、mesh、GPU和LRU继续由T3 runtime拥有。
- 构造/address错误使用 `DeveloperError`；network/CORS/image/LERC/data错误 reject request Promise。
- 一个 tile失败不能污染其他 tile或改变 provider全局 configuration。

### 7. Sandcastle

新增：

```text
packages/sandcastle/gallery/scenegis-planar-terrain/
```

案例复用现有 `scenegis-planar-viewer`/`scenegis-planar-imagery` 的 EPSG:3857 extent、OSM imagery、
Viewer、planar controller、visible OSM Credit和application-selected skybox。Terrain通过新的 generic
provider显式配置，不增加 terrain/basemap picker。

公开 terrain优先配置为符合 boundary-sampled Heightmap的 LERC XYZ endpoint，例如当前 ArcGIS
WorldElevation3D `tile/{z}/{y}/{x}`。案例必须显式写出：

- `format: "lerc"`、257×257、global height range、maximum level；
- 与 world同一 `world.tilingScheme`；
- visible terrain Credit与服务/数据来源链接；
- best-effort、CORS/服务可用性、无离线下载和只请求当前视图 tile的说明；
- 一个高差明显且不需要新增 camera API的初始视角，或在现有 public Camera能力无法稳定表达时保留
  `viewHome` 并把目标视角留给人工导航。

若 metadata/init或后续 tile失败，场景不得销毁或切换 world；应由现有 flat/ancestor fallback保持可
浏览，并提供清晰但不过量的失败提示。`sandcastle.yaml` 使用 SceneGIS/Terrain labels和
`development: false`。

### 8. Durable docs

更新 `Documentation/SceneGIS/Architecture.md` 与
`Documentation/SceneGIS/DevelopmentGuide.md`，提炼：

- URL-template terrain provider是 coordinate-agnostic；应用负责 CRS/tiling一致性；
- XYZ address、payload encoding和sample placement是三项独立契约；
- boundary-inclusive samples、image/LERC格式、full-pyramid availability和provider ownership；
- 公开 Sandcastle是 best-effort，自动化禁止公网依赖。

不把具体公网 URL、当前服务 metadata或临时人工结果提升为永久架构规则。

## 修改范围

### 允许的产品与测试路径

- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProvider.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProviderSpec.js`
- 如确有直接 WebGL closure需要，可最小修改现有
  `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidgetSpec.js`
- `packages/sandcastle/gallery/scenegis-planar-terrain/**`
- `Documentation/SceneGIS/**`
- `AgentDocs/planar-terrain/**`

测试 fixture必须位于 `packages/engine/Specs/SceneGIS/**`。不得把第三方公网 tile、large binary、
本机缓存或 secret提交进仓库；优先 stub Resource与 `Lerc.decode`返回的确定性小型数组。

### 禁止范围

- `packages/engine/Source/Core/**`、`packages/engine/Source/Scene/**`、
  `packages/widgets/Source/**` 等 upstream-owned product files；
- `_SceneGISPlanarTerrain`、mesh、quadtree、surface、shader、camera、Viewer或picking行为修改，除非
  发现 T1-T4 blocking defect并立即停下请求架构裁决；
- `.scenegis/upstream-patches.json`、SGP-0001、SGP-0002；
- Worker、Shader build、第三方 dependency、通用 projection、ArcGIS metadata/Tilemap、离线缓存；
- 手工编辑或提交任何 generated root、types、Build、SpecList或 Sandcastle build output。

## 执行步骤

1. 以 T4 checkpoint执行 clean diff/status和 ownership baseline检查，确认没有并发未知改动。
2. 实现 public generic provider与精确 JSDoc，不先修改 renderer/runtime。
3. 增加 focused Core Specs，先锁定 constructor/address/ownership，再覆盖 image和LERC Promise链。
4. 用 deterministic stub完成 provider output与现有 TerrainData的闭环；只在必要时增加一个现有
   terrain Widget代表性集成用例。
5. 新增唯一 Sandcastle，复用已有 planar assembly；人工核对公开服务后记录 endpoint事实、Credit、
   CORS和失败降级，不把公网变成 automated hard gate。
6. 更新 Architecture/DevelopmentGuide、phase plan results、extension/index handoff，并创建 pending
   T5 review request。
7. 运行最小充分验证、public generation断言与 ownership audit后停止；不得进入T6。

## 自动化验收

### Provider direct cases

至少证明：

- constructor options、Resource/subdomain input ownership、readonly properties与 structural interface；
- XYZ/TMS、placeholder任意顺序、safe level/address、Request identity和scheduler `undefined`；
- image dimensions、north-first row、multi-channel structure、ImageBitmap exactly-once close；
- LERC single band、dimensions、mask/NoData、decoded finite heights和TerrainData ownership；
- child mask、full-pyramid availability和geometric error curve；
- sync fetch throw、Promise rejection和decode failure不留下 provider mutation；
- full EPSG:3857 coordinate values作为一个代表 fixture，但 provider不读取CRS字段。

边界组合以证明上述契约为限，不追求无收益穷举。

### Integration 与兼容

- 一个 deterministic provider→World→terrain代表性闭环，证明 concrete provider可被现有World接受；
- 若复用现有 Widget fixture，证明 terrain与imagery仍合成同一command、warm/depth replay没有新的
  provider request/decode mutation；不重跑 T2-T4 已覆盖的完整渲染矩阵；
- no-provider flat path只在本阶段实际触及其代码时复跑；预计 provider-only实现无需重复完整Surface、
  Quadtree、Camera、Viewer或Globe套件。

### 构建、文档与示例

计划命令矩阵：

```text
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProvider"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"  # 仅实际修改/增加时
npm run build
npm run build-ts
npm run build-docs
npm run tsc
changed-scope ESLint / Prettier
npx prettier --check --ignore-path .gitignore "AgentDocs/**/*.md" "Documentation/SceneGIS/**/*.md"
npx markdownlint "AgentDocs/**/*.md" "Documentation/SceneGIS/**/*.md"
git diff --check
node scripts/scenegis/audit-upstream-patches.mjs
```

Sandcastle只运行与新增案例相关的 no-embedding gallery/build检查；已知标准 embedding若仍仅因外部
Hugging Face metadata失败，必须如实记录，不要求反复重试。人工打开案例检查一次：terrain起伏、
imagery贴合、PC导航、visible Credits、无重复 console error，以及公开服务失败时仍有明确 fallback。

### Public generation 与 ownership

- engine/Cesium root JS、`packages/engine/index.d.ts`、`Source/Cesium.d.ts` 和 API HTML能找到 public
  provider及精确 option unions；无 private LERC wrapper泄漏；
- generated files与Build/SpecList不进入 git status；
- upstream-owned files=`0`、T5 SGP=`0`、new `SCENEGIS_PATCH` markers=`0`，manifest和既有SGP不变；
- 当前阶段所有变更都位于本计划允许路径。

## 完成门槛与停止条件

T5 只有同时满足以下条件才可提交 review：

- generic provider公共 API、image/LERC decode、full-pyramid availability和ownership契约实现；
- deterministic local tests通过且不访问公网；
- `scenegis-planar-terrain` 可执行案例完成，公开数据只作为best-effort配置并显示Credit；
- 最小 build/types/docs/static/ownership矩阵通过；
- Architecture/DevelopmentGuide、phase results、extension/index和pending review request回写完整；
- 未修改 upstream-owned file、未进入 T6。

出现以下任一情况必须立即停止并请求 Architecture裁决：

- 需要修改 T1-T4 runtime、Shader、Worker、build generator或 upstream-owned file；
- 候选公网数据只有 pixel-center raster，必须 neighbor fetch/resample才能满足边界契约；
- LERC mask/NoData需要新的局部填洞或多源合并策略；
- 需要把 service metadata、token discovery、Tilemap或projection加入generic public API；
- 公开服务政策、CORS或授权不允许稳定案例。此时自动化和local fixture仍可继续，但不得伪造公网
  acceptance。

## 结果与交接

- 当前状态：T5 implementation、focused fixes与Architecture focused re-review均已完成；
  `T5-R001`～`T5-R003`全部由reviewer确认为`fixed`，phase状态为`completed`。未push、未进入T6。
- Review：
  [T5 review](../reviews/2026-08-08-t5-url-template-heightmap-provider.md) 状态`approved`。

### 实际设计与影响路径

- 新增 public `SceneGISPlanarUrlTemplateHeightmapTerrainProvider`。Provider克隆 caller `Resource`与
  subdomain array，保留 canonical tiling identity、Request、query/header、Credit reference与独立
  `Event`；源码不读取 `.crs`。
- Image模式要求调用方显式提供 `stride=4` 的 RGBA-compatible structure；构造期完整验证
  scale/offset、positive multiplier、boolean endian与可表示buffer length。数值RGBA请求显式设置
  `skipColorSpaceConversion:true`，自然 north-to-south row order不传`flipY`；可关闭 image在
  dimensions、pixel extraction、TerrainData construction成功/失败路径均exactly once close。
- LERC模式直接使用既有 `lerc` dependency；要求单 numeric non-BigInt band、精确dimensions、完整
  valid mask、finite/ordered statistics、无NoData/非finite sample，并把decoded TypedArray直接交给
  `SceneGISPlanarHeightmapTerrainData`。两种格式都拒绝超出provider global range的decoded height。
- Default Level-0 error取X/Y两轴中较疏sample spacing的`0.25`；full pyramid availability与
  child mask固定为中间层`15`、末层`0`。Fetch同步throw、Promise rejection和LERC cause保持原错误；
  provider不retry、不raise第二次event、不持有tile payload。
- Global `provider.credit`只由Surface提交；generic provider没有per-tile attribution，因此不复制到
  `TerrainData.credits`。
- `scenegis-planar-terrain` 显式组装EPSG:3857 World、OSM imagery、application-selected Earth
  skybox和公开ArcGIS LERC terrain；两个Credit visible，失败文案说明ready ancestor/flat fallback、
  CORS/服务SLA和禁止prefetch/bulk/offline边界。
- 最终产品/Spec/示例路径：
  - `packages/engine/Source/SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProvider.js`
  - `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProviderSpec.js`
  - `packages/sandcastle/gallery/scenegis-planar-terrain/{index.html,main.js,sandcastle.yaml}`
- Durable docs更新：`Documentation/SceneGIS/Architecture.md`、
  `Documentation/SceneGIS/DevelopmentGuide.md`；阶段ADR、plan/index/review均位于既有允许路径。
- 未修改现有 terrain Widget Spec，因此按计划未运行该 suite；provider→World→TerrainData闭环置于
  focused Core Spec，避免重复真实WebGL矩阵。

### Source-to-Spec mapping 与 direct cases

| Source / responsibility                                                              | Spec                                                       | Direct unique cases |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------: |
| constructor、readonly structural contract、Resource/subdomain ownership、error curve | `SceneGISPlanarUrlTemplateHeightmapTerrainProviderSpec.js` |                   2 |
| XYZ/TMS/template/Request/scheduler与address fail-fast                                | 同上                                                       |                   3 |
| Image RGBA structure、north-first row、dimensions与exactly-once close                | 同上                                                       |                   3 |
| LERC band/dimensions/mask/statistics/NoData/finite/global range与ownership           | 同上                                                       |                   2 |
| full pyramid/child mask、sync/async/decode failures、EPSG:3857 World closure         | 同上                                                       |                   3 |
| **Direct unique total**                                                              | 1 focused suite                                            |              **13** |

### 验证矩阵

| 命令 / 检查                                                                                       | 结果                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarUrlTemplateHeightmapTerrainProvider"` | Exit 0；`13/13`，suite真实命中                                                                                                                                        |
| `npm run build`                                                                                   | Exit 0                                                                                                                                                                |
| `npm run build-ts`                                                                                | Exit 0；仅仓库既有TSD-JSDoc warnings                                                                                                                                  |
| `npm run build-docs`                                                                              | Exit 0                                                                                                                                                                |
| `npm run tsc`                                                                                     | Exit 0                                                                                                                                                                |
| scoped engine/Sandcastle ESLint                                                                   | Exit 0                                                                                                                                                                |
| scoped product/Spec/Sandcastle Prettier                                                           | Exit 0                                                                                                                                                                |
| broad `AgentDocs/**/*.md` + SceneGIS docs Prettier                                                | Exit 1；仅两个未修改模板README已有格式差异                                                                                                                            |
| scoped `AgentDocs/planar-terrain/**/*.md` + `Documentation/SceneGIS/**/*.md` Prettier             | Exit 0；作为changed-scope替代证据                                                                                                                                     |
| scoped planar-terrain/SceneGIS Markdownlint                                                       | Exit 0                                                                                                                                                                |
| `git diff --check`                                                                                | Exit 0；仅Git提示五个既有tracked文档未来可能LF→CRLF                                                                                                                   |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                                | Exit 0；current delivery upstream-owned entries `0`，generated status `0`                                                                                             |
| `npm run build-gallery-no-embedding --workspace=packages/sandcastle`                              | Exit 0；processed `306` examples                                                                                                                                      |
| `SANDCASTLE_NO_EMBEDDINGS=1 npm run build-sandcastle`                                             | Exit 0；Vite仅报告plugin timing与large chunk warnings                                                                                                                 |
| standard embedding `npm run build-gallery --workspace=packages/sandcastle`                        | Exit 1；既有外部Hugging Face tokenizer metadata fetch失败；未重试                                                                                                     |
| public export/type/API assertions                                                                 | engine/Cesium root JS各1命中且runtime import成功；两份d.ts各1命中并含精确format/urlScheme unions与readonly fields；API class page存在；private LERC wrapper type命中0 |

Focused review fix后复核：provider suite保持`13/13`（Exit 0）；`npm run build`、changed-scope
ESLint/Prettier、planar-terrain与SceneGIS Markdownlint、`git diff --check`、upstream audit均Exit 0。
本轮JSDoc/public shape未变化，按review边界未重复build-ts/build-docs/tsc/gallery。

### 公开案例与人工事实

- 一次性读取官方service metadata确认当前服务为EPSG:3857、LERC、single band、LOD `0..16`、标称
  256 tile；一次Level-0 tile只读检查返回`257×257`、single band、0 invalid samples，未保存公网tile、
  cache或binary到仓库。
- 8090服务可达，但当前有效Sandcastle入口为根路径；旧
  `/Apps/Sandcastle2/index.html?id=...` 返回404。内置浏览器拦截localhost，Chrome控制连接不可用，
  因此terrain起伏、imagery贴合、PC导航、visible Credits和console的GPU人工画面检查未执行，不能
  写成通过；留给review环境按best-effort案例复核。
- 自动化没有访问OSM、ArcGIS或其他公网；所有provider fetch/decode均为本地stub。

### Ownership、生成与剩余风险

- implementation diff base：`16983856e605280c709ca14f55a0f630d465202f`。
- upstream-owned product/test/build files=`0`；T5 SGP=`0`；manifest、SGP-0001/0002 unchanged；new
  patch markers=`0`；T1-T4 runtime、Shader、Worker、Widget/Viewer均未修改。
- generated roots、types、API HTML、Build与SpecList只生成验证，`git status`命中`0`。
- 公开service仍有CORS、授权、availability与SLA风险；generic provider无法验证caller数据CRS、
  neighboring shared edge或服务sparse coverage。257×257 main-thread LERC decode/mesh成本留待T6
  measured profiling；本阶段不据此引入Worker或runtime优化。
- Architecture首轮review独立复跑focused provider suite `13/13`并确认公开service metadata与案例
  配置一致；发现image numeric payload未禁用color-space conversion、静态image structure验证延迟到
  fetch之后，以及global provider Credit被重复写入每个TerrainData三项问题。Execution已逐项修复；
  focused provider仍为`13/13`，参数化constructor case覆盖全部静态structure字段且fetch调用为0。
- Architecture focused re-review独立确认三项修复，复跑provider `13/13`、build与最小static/ownership
  矩阵均通过；T5没有unresolved finding。
- 下一步：Architecture Agent形成T5独立本地提交检查点，然后与项目负责人讨论并细化T6；T6尚未
  激活或派工。
