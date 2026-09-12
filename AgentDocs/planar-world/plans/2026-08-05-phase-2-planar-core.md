# 阶段计划：P2 平面坐标与瓦片 Core

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- 总体计划（Parent plan）：
  [2026-08-05-planar-world-extension.md](2026-08-05-planar-world-extension.md)
- 阶段（Phase）：`P2-planar-core`
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-05`
- 更新日期（Updated）：`2026-08-05`
- 相关讨论（Related discussions）：无；结论已提升到 ADR
- 相关评审（Related reviews）：
  [P2 planar core review request](../reviews/2026-08-05-p2-planar-core.md)
- ADR：
  `Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md`
- SGP：无；本阶段禁止修改 upstream-owned file

## 目标

实现三个 SceneGIS-owned 公共 Core 类型，为后续平面 surface、provider、相机和
拾取提供唯一的坐标范围与瓦片寻址事实源：

- `SceneGISPlanarExtent`
- `SceneGISPlanarCoordinateSystem`
- `SceneGISPlanarTilingScheme`

阶段结束时，调用方应能用以米为单位的严格正方形世界范围和可选 CRS 标识创建
coordinate system，并能在不接触 ellipsoid、cartographic 或大地测量 rectangle 的
情况下完成单根 XYZ 四叉瓦片的范围计算与点寻址。

## 非目标

- 实现或修改 `SceneGISPlanarWorld`。
- 实现 tile node、quadtree traversal、surface renderer、SSE、LOD 或 cache。
- 创建 geometry、tile-local vertex、render origin、`modelMatrix` 或 GPU 资源。
- 修改相机、拾取、provider、栅格图层、Viewer 或 Sandcastle。
- 实现高程范围、terrain、重投影、EPSG 数据库或 CRS 规范化。
- 实现 Cesium `TilingScheme`，或复用 `WebMercatorTilingScheme`、
  `QuadtreeTile`、`Rectangle`、`BoundingRectangle`、`Cartographic`、
  `MapProjection` 和 `Ellipsoid` 作为公共平面契约。
- 修改 upstream-owned file、构建脚本、生成器或生成文件。
- 开始 P3 的设计或实现。

## 进入条件

- `P1-world-contract` 已完成 architecture/code review，状态为 `completed`。
- P1 已形成独立本地提交
  `10e7b42d4c`（`完成平面世界第一阶段主世界契约`）。
- `ADR-0002` 已由项目负责人批准。
- 项目负责人已审阅本书面计划；执行前由 Execution Agent 将本计划从 `draft`
  改为 `active`，并同步总体路线图和扩展索引。
- Architecture Agent 已把获批的 ADR、phase plan 和索引状态形成独立的 P2 planning
  commit；Execution Agent 从该干净检查点开始实现。
- 执行 Agent 已重新读取根目录、engine 和 AgentDocs 的 `AGENTS.md`，以及
  Development Guide、总体计划、ADR-0001、ADR-0002 和 P1 review。
- 当前分支仍为 `feature/planar-world`；不新建 P2 分支。

## 当前源码事实

1. 上游基线是 Cesium `1.144`，提交
   `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
2. `packages/engine/Source/Core/TilingScheme.js` 的契约包含 `ellipsoid`、
   `projection`、`rectangle` 以及 `Cartographic` 与 tile 的相互转换。
3. `WebMercatorTilingScheme` 仍将投影范围转换为球面经纬度，不是保持公开投影
   米制坐标的平面 scheme。
4. `packages/engine/Source/Scene/QuadtreeTile.js` 保存大地测量 `Rectangle`、
   cartographic cache，并具有 root X wrapping 和反经线语义。
5. `BoundingRectangle` 使用可变 `x/y/width/height`，不满足本阶段只读 min/max
   value object 和职责分离要求。
6. `Cartesian2` 与 `Cartesian3` 是可以复用的通用笛卡尔值类型。P2 点寻址输入
   使用 `Cartesian3`，可选输出 result 使用 `Cartesian2`。
7. engine 构建会按 basename 发现普通 JS 公共模块；P1 已验证
   `Source/SceneGIS` 下的唯一 basename 可以进入根 export 和类型生成。
8. P1 已修改的 upstream-owned files 是 `Scene.js` 和 `CesiumWidget.js`，由
   `SGP-0001` 跟踪。本阶段不得扩大这两个文件或该 SGP 的范围。

源码行号不是契约。Execution Agent 在实现前必须通过当前 code graph 重新确认
相关 Core 类型、根导出生成、Specs discovery 和 JSDoc/type generation 入口。

## 详细设计

### 公共类型关系

```text
SceneGISPlanarExtent
          ↓ owned by
SceneGISPlanarCoordinateSystem
          ↓ referenced by
SceneGISPlanarTilingScheme
```

P3 才增加以下所有权关系：

```text
SceneGISPlanarWorld
  ├─ owns → SceneGISPlanarCoordinateSystem
  └─ owns → SceneGISPlanarTilingScheme
                └─ references the same coordinate system
```

`SceneGISPlanarTilingScheme` 同时保持可独立构造，以供后续 provider 或离线
预处理使用。

### `SceneGISPlanarExtent`

构造契约：

```text
new SceneGISPlanarExtent({
  minimumX,
  minimumY,
  maximumX,
  maximumY,
})
```

行为要求：

- 四个输入和派生的 `width`/`height` 都必须是 finite number；有限端点产生
  Infinity span 时同样抛出 `DeveloperError`。
- 必须满足 `maximumX > minimumX` 和 `maximumY > minimumY`；零宽、零高、
  反向范围、`NaN` 和 infinity 均抛出 `DeveloperError`。
- 提供 getter-only 的 `minimumX`、`minimumY`、`maximumX`、`maximumY`、
  `width` 和 `height`。不增加 setter 或公共 mutation method。
- extent 允许矩形；正方形约束只由 coordinate system 施加。
- `clone(extent)` 返回一个独立的新 extent。
- `equals(left, right)` 比较四条边界；采用 Cesium value type 的 identity/
  undefined 兼容语义，不使用 epsilon。
- `contains(extent, position)` 检查有限 X/Y，四条外边界均 inclusive；Z 若存在
  不参与判断。
- 首版不增加 result 参数、center、intersection、union 或 conversion API。

只读是公共 API 保证，不要求 `Object.freeze`，也不得通过可写的
`BoundingRectangle` 暴露内部状态。

### `SceneGISPlanarCoordinateSystem`

构造契约：

```text
new SceneGISPlanarCoordinateSystem({
  extent,
  crs,
})
```

行为要求：

- `extent` 必须是有效的 `SceneGISPlanarExtent`。
- 构造时 clone extent；后续修改调用方原始对象或引用不得改变 coordinate system。
- 使用严格的 `extent.width === extent.height` 判断正方形；不使用 epsilon，不调整
  输入，也不接受矩形世界。
- `crs` 可以省略；提供时必须是长度大于零的 string。按原值保存，不 trim、
  uppercase、解析或验证 EPSG 内容。
- 只提供 getter-only 的 `extent` 和 `crs`。`extent` 本身也是只读 value object。
- 单位和轴向是文档化的固定语义：meters、X east、Y north、Z up；不增加对应的
  runtime options。
- 不增加 origin、center、projection、ellipsoid、axis order 或 Z range 字段。

### `SceneGISPlanarTilingScheme`

构造契约：

```text
new SceneGISPlanarTilingScheme({
  coordinateSystem,
})
```

公共只读属性：

- `coordinateSystem`
- `maximumSafeLevel`

`coordinateSystem` 必须是有效的 `SceneGISPlanarCoordinateSystem`；构造器保存并
公开同一个只读引用，不创建第二套坐标范围，也不允许通过 setter 替换。

公共方法：

```text
getNumberOfXTilesAtLevel(level)
getNumberOfYTilesAtLevel(level)
getTileSizeAtLevel(level)
tileXYToExtent(x, y, level)
positionToTileXY(position, level, result)
```

层级与索引要求：

- Level 0 为一个 root tile；Level L 的 X/Y tile count 都是 `2 ** level`。
- 禁止使用 `1 << level` 或其他 32-bit 位运算。
- level 必须是大于等于零、且不大于 `maximumSafeLevel` 的 integer。
- x/y 必须是大于等于零且小于当前 level tile count 的 integer。
- invalid type、非有限值、负数、fraction、越界值均抛出 `DeveloperError`。
- 世界坐标 X 向东、Y 向北；tile X 向东、tile Y 向南，origin 位于 northwest。
- 不支持 X 或 Y wrap。

瓦片边界必须从 root extent 直接计算：

```text
count = 2 ** level
size = coordinateSystem.extent.width

west  = minimumX + size * (x       / count)
east  = minimumX + size * ((x + 1) / count)
north = maximumY - size * (y       / count)
south = maximumY - size * ((y + 1) / count)
```

boundary index `0`/`count` 必须直接返回配置的 outer minimum/maximum，不能反算；
内部边界先计算 `index / count`，避免 `size * index` 的中间 overflow。相邻 tile 必须
调用同一个 helper，因此共享边为同一数值。

`tileXYToExtent` 每次返回新的 `SceneGISPlanarExtent`，不接受 result。相邻 tile
必须共享同一个数值边界，Level 0 必须精确返回 coordinate system 的完整 extent。

`getTileSizeAtLevel` 返回 `size / count` 的理想边长，不把浮点舍入后某个具体 tile
的 `extent.width` 当作全局 tile size。

### `maximumSafeLevel`

`maximumSafeLevel` 是寻址数学上限，不是数据源的业务最大层级：

1. Level 0 由精确保留的 outer boundary 保证可用；从 Level 1 开始最多检查到
   Level 52。
2. 每个 accepted level 必须保证全部 X/Y boundary 严格有序，首末 sampling 不能
   作为充分条件。
3. 对每个轴计算 `idealSpacing = size / count`。只有当其严格大于
   `ULP(size) + max(ULP(minimum), ULP(maximum))` 时才满足全域分辨率保证。
   `index / count` 在本契约中精确；上述 ULP 和是相邻 boundary 的 multiplication
   与 addition/subtraction 舍入误差差值的保守上界。
4. outer boundary 直接使用原始端点，并另外检查首末 outer-adjacent tile，覆盖
   span subtraction 舍入和 cancellation。
5. 首个不满足保证的 level 及所有更深 level 都拒绝；最后 accepted level 即为
   `maximumSafeLevel`。允许该上限保守，但 accepted level 内不得存在 collapse tile。
6. 每个寻址方法都拒绝更高 level；`tileXYToExtent` 还应防御性确认返回范围仍有
   正宽和正高。

Level 52 的硬上限保证 `count` 与 `count - 1` 仍处于本阶段允许的 safe-integer
寻址范围。大坐标配合极小 extent 可能使上限低于 52，必须由专项 Specs 锁定。

未来 provider/surface 可另有 `maximumLevel`，其值可以更低；P2 不增加这一字段。

### `positionToTileXY`

- `position` 的公共类型是 `Cartesian3`。X/Y/Z 必须是 finite number，但只有 X/Y
  影响 tile；不同 Z 的同一 X/Y 必须返回相同结果。
- extent 的四条 outer boundary 都在世界内。
- `maximumX` clamp 到最东列，`minimumY` clamp 到最南行，避免得到 `count`。
- 内部 X boundary 归东侧 tile；内部 Y boundary 归南侧 tile。
- 范围外直接返回 `undefined`，不 wrap，也不 clamp 到世界内。
- 未提供 result 时创建 `Cartesian2`；提供 result 时写入并返回同一对象。
- 不返回或创建 `Cartographic`、Cesium `Rectangle` 或 tile object。

### 精度与后续渲染边界

P2 的 extent 和 tile extent 保存调用方提供的完整 CRS/world 数值。不得为了精度
修改范围中心、建立 render origin，或把坐标转换为局部值。

P3 renderer 使用某个 tile 的完整 extent 生成 tile-local vertex，并通过
`modelMatrix` translation 放回完整世界坐标。该渲染策略不得反向污染 P2 的
coordinate 或 addressing contract。

## 影响路径

### 只允许新增或更新的 SceneGIS-owned 文件

- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarExtent.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarTilingScheme.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarExtentSpec.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarCoordinateSystemSpec.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarTilingSchemeSpec.js`
- `Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md`
- `AgentDocs/planar-world/**`

### 禁止修改

- 任何 `.scenegis/upstream-base.json` 已记录的 upstream-owned file
- `.scenegis/upstream-patches.json` 和 `SGP-0001`
- P1 的 `SceneGISWorld`、Scene/CesiumWidget 集成和 Specs
- Cesium Core `TilingScheme`、`WebMercatorTilingScheme`、`Rectangle`、
  `BoundingRectangle` 和 Scene `QuadtreeTile`
- build、release、Shader、Worker、Widget、Viewer、Sandcastle 和 E2E 文件
- 任何生成文件，包括 `packages/engine/index.js`、`packages/engine/index.d.ts`、
  `packages/engine/Specs/SpecList.js`、`Source/Cesium.js`、`Source/Cesium.d.ts` 和
  `Build/**`

若实现发现必须越过以上边界，Execution Agent 必须停止本阶段，记录 plan deviation
和源码证据，并交回 Architecture Agent 与项目负责人讨论；不得自行新增 SGP 或扩大
范围。

## 实施步骤

1. 重新索引或刷新 codebase knowledge graph，确认三个 basename 未冲突，并核对
   engine 公共导出、Specs discovery、JSDoc 和类型生成入口。
2. 确认工作树以获批的 P2 planning commit 为干净基线，把本计划和路线图状态更新为
   `active`。
3. 实现 `SceneGISPlanarExtent` 及其完整单元 Specs。
4. 实现 `SceneGISPlanarCoordinateSystem`，覆盖 extent clone、严格正方形、可选
   CRS 和错误路径。
5. 实现 `SceneGISPlanarTilingScheme` 的 level/count/size 和
   `maximumSafeLevel`，先用纯数学 Specs 锁定精度边界。
6. 实现 tile extent 和 position-to-tile addressing，覆盖 northwest-origin XYZ、
   outer/internal boundary ownership、无 wrap 和 result reuse。
7. 从 engine 根入口增加或调整公共 API Specs，验证三个类型确实由正常生成流程
   导出；不得手改生成 barrel。
8. 运行专项 Specs、build、build-ts、build-docs、tsc、静态检查和文档检查。
9. 审计本阶段 diff，确认没有 upstream-owned 或生成文件变化，并创建 P2 review
   request。Execution Agent 不提交、不 push，等待 Architecture Agent review。
10. Execution Agent 回写实际偏差、精确命令与结果；评审通过后将本计划和总体
    路线图更新为 `completed`，然后停在阶段边界，不进入 P3。
11. Architecture Agent 在 P2 review 通过后提交 P2 代码、Specs、ADR 和 AgentDocs；
    该阶段提交完成前不得讨论、激活或实现 P3。

## 验证要求

### 必须覆盖的 Specs

- extent：合法矩形、负坐标、getter-only、width/height、clone identity、equals、
  inclusive contains、finite/inverted/zero-size validation。
- coordinate system：输入 extent clone、无 CRS、本地 CRS、`EPSG:3857` 字符串、
  strict-square rejection、invalid CRS。
- tiling counts：Level 0/1/2、`2 ** level`、Level 32 以上不发生 bitshift overflow、
  `maximumSafeLevel`。
- tile extents：Level 0 完整 root、Level 1 四象限、northwest XYZ、Level 2
  代表 tile、相邻共享边和完整 outer boundary。
- coordinate fixtures：负且非零 origin、X/Y 绝对值不对称、EPSG:3857 量级、
  大坐标配合小 extent。
- point addressing：四角、中心、内部 X boundary 归东、内部 Y boundary 归南、
  `maximumX`/`minimumY` clamp、不同 Z、outside returns undefined、无 wrap。
- result：未提供 result 时返回新 `Cartesian2`；提供时复用 identity。
- errors：invalid coordinate system、invalid/nonfinite position，负数、fraction、
  nonfinite、越界 level/x/y，以及超过 `maximumSafeLevel`。
- precision：至少一个 coordinate system 的 `maximumSafeLevel < 52`，并证明该层
  可区分、下一层被拒绝。
- public API：至少一组 Specs 从 engine 根入口导入三个类型。

### 必须运行的命令

```powershell
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarExtent"
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarCoordinateSystem"
npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTilingScheme"
npm run build
npm run build-ts
npm run build-docs
npm run tsc
npx eslint "packages/engine/Source/SceneGIS/Core/**/*.js" "packages/engine/Specs/SceneGIS/Core/**/*.js"
npx prettier --check "packages/engine/Source/SceneGIS/Core/**/*.js" "packages/engine/Specs/SceneGIS/Core/**/*.js"
npx prettier --check --ignore-path .gitignore "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"
npx markdownlint "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"
git diff --check
```

Execution Agent 必须记录每条命令的 exit code、通过数量或必要的 warning 说明。
生成产物只用于验证，不得进入 Git diff。由于 P2 是纯 Core 数学，不要求完整 Specs、
WebGL、Sandcastle、E2E、像素或性能测试。

### Diff 与所有权审计

- 以获批的 P2 planning commit 作为 implementation diff base。
- P2 implementation diff 中只允许“影响路径”列出的 SceneGIS-owned 文件。
- upstream-owned files 数量必须为零；SGP 数量必须为零。
- 若 build 在工作树生成文件，验证后确认它们没有被跟踪为修改或 staged。

## 风险与依赖

- JavaScript number 在大坐标和深层瓦片下可能让相邻 boundary collapse；
  `maximumSafeLevel` 必须以实际 boundary formula 计算并由极端 fixture 锁定。
- strict-square 不提供 epsilon，调用方从外部数据计算 min/max 时可能需要先自行
  归一化；这是显式输入责任，不应在 Core 内静默修复。
- 内部 boundary 的 east/south ownership 容易因 `floor`、浮点舍入和 outer clamp
  顺序产生 off-by-one；测试必须使用 `tileXYToExtent` 生成的共享边反向寻址。
- 公开只读值对象会产生少量 extent 分配。P2 不为未测量的热路径引入 result mutation；
  P3 若发现实际瓶颈，应设计私有 cache，而不是破坏公共契约。
- 当前不提供 provider `maximumLevel`。后续数据源不得误用 `maximumSafeLevel` 表达
  数据可用性。

## 完成条件

- ADR-0002 与实际公共 API 一致，且保持 `approved`。
- 三个类型仅位于 SceneGIS-owned Core 路径，依赖方向符合 engine 约束。
- extent、coordinate system、tiling scheme 的全部详细契约有自动化 Specs。
- engine 根导出、生成声明和 API 文档验证通过，但生成文件未被提交。
- 所有必需命令通过，或仅保留已记录且与本阶段无关的既有 warning。
- P2 diff 没有 upstream-owned file、没有 SGP、没有 P1 行为变化。
- P2 architecture/code review 为 `approved`，没有 unresolved finding。
- Execution Agent 回写偏差和验证结果，将本计划、总体路线图和扩展索引更新为
  `completed`，并在进入 P3 设计前停止等待项目负责人。
- Architecture Agent 已将完成的 P2 代码和文档创建为独立本地提交；提交前不得
  进入 P3。

## 偏差与结果

### 实际设计

- `SceneGISPlanarExtent` 保存四条只读边界，派生 `width`/`height`，允许矩形；四条
  边界和两个 span 都必须 finite。`clone`、exact `equals` 和 inclusive `contains`
  均不引入 result mutation。
- `SceneGISPlanarCoordinateSystem` 严格使用 `width === height`，clone 并拥有 extent，
  保留可选 CRS 原字符串；`crs: null` 作为已提供的无效值抛出
  `DeveloperError`。
- `SceneGISPlanarTilingScheme` 保存同一个 coordinate system 引用，以 `2 ** level`
  建立单个 `1 × 1` root。tile extent 始终从 root extent 和整数 boundary index
  直接计算。
- boundary index `0`/`count` 直接保留原始 outer edge；内部按
  `size * (index / count)` 计算，避免可表示结果被中间 multiplication overflow。
- `maximumSafeLevel` 使用 documented ULP resolution bound 保守保证 accepted level
  的全部内部边界严格有序，并单独验证 outer-adjacent boundaries；不再使用首末
  sampling 作为全域充分条件。
- `positionToTileXY` 使用与 tile extent 相同的 boundary formula 做至多 52 次的
  整数边界二分；这样内部 X/Y 共享边稳定归东/归南，outer maximum X/minimum Y
  稳定 clamp 到末列/末行，不使用 epsilon、bitshift、wrap 或局部重定心。

实现没有偏离 ADR-0002，没有修改 upstream-owned file，也没有创建或复用 SGP。
首次 coordinate system Specs 使用 `10 + Number.EPSILON` 构造 strict-square 反例，
该值在数值 10 处舍入回 10；同时实现把 `crs: null` 当作缺省。该次运行得到 5/7，
随后 fixture 改为可表示的 `10.000000000000002`，并按“提供时必须为非空 string”
显式拒绝 `null`，最终 7/7 通过。

首次 architecture/code review 提出的 P2-R001 至 P2-R004 已修复：outer boundary
精确保留，内部 boundary 避免中间 overflow，safe level 改用全域 ULP 保守保证，
extent 拒绝 Infinity span，并按最终 runner 结果修正测试总数。ADR-0002 已同步修订，
不再把首末 sampling 视为充分条件。

### 最终影响路径

Source 与 Specs：

- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarExtent.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarTilingScheme.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarExtentSpec.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarCoordinateSystemSpec.js`
- `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarTilingSchemeSpec.js`

协作文档：

- `AgentDocs/planar-world/README.md`
- `AgentDocs/planar-world/plans/2026-08-05-planar-world-extension.md`
- `AgentDocs/planar-world/plans/2026-08-05-phase-2-planar-core.md`
- `AgentDocs/planar-world/reviews/README.md`
- `AgentDocs/planar-world/reviews/2026-08-05-p2-planar-core.md`

### 验证结果

| 命令                                                                                                                | 结果                                                                           |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarExtent"`                                                | Exit 0；9/9 success。                                                          |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarCoordinateSystem"`                                      | 最终 Exit 0；7/7 success；首次 5/7 的 fixture 与 `null` 语义已按上述记录修正。 |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTilingScheme"`                                          | Exit 0；21/21 success。                                                        |
| `npm run build`                                                                                                     | Exit 0；engine、widgets 与 Cesium unminified bundles 构建成功。                |
| `npm run build-ts`                                                                                                  | Exit 0；声明生成成功；输出仓库既有 TSD-JSDoc warnings，无 P2 新 warning。      |
| `npm run build-docs`                                                                                                | Exit 0；三个公共类型的 API HTML 生成成功。                                     |
| `npm run tsc`                                                                                                       | Exit 0。                                                                       |
| `npx eslint "packages/engine/Source/SceneGIS/Core/**/*.js" "packages/engine/Specs/SceneGIS/Core/**/*.js"`           | Exit 0。                                                                       |
| `npx prettier --check "packages/engine/Source/SceneGIS/Core/**/*.js" "packages/engine/Specs/SceneGIS/Core/**/*.js"` | Exit 0。                                                                       |
| `npx prettier --check --ignore-path .gitignore "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"`   | Exit 0。                                                                       |
| `npx markdownlint "AgentDocs/planar-world/**/*.md" "Documentation/SceneGIS/**/*.md"`                                | Exit 0。                                                                       |
| `git diff --check`                                                                                                  | Exit 0。                                                                       |

生成检查确认 engine 根 export、`packages/engine/index.d.ts` 和
`Source/Cesium.d.ts` 均包含三个公共类型；生成的 `positionToTileXY` 类型为
`Cartesian3` 到 `Cartesian2 | undefined`，`maximumSafeLevel` 为 readonly。
生成文件未进入 Git diff 或 status。

未运行完整 15810 Specs、WebGL、Sandcastle、E2E、像素和性能测试。P2 是无 DOM、
无 WebGL、无资源生命周期的纯 Core 数学；37 个专项 Specs 与公共 build/type/docs
链是本阶段的最小充分证据。

### 所有权、评审与剩余风险

- Implementation diff base：`2554e3882d`。
- Upstream-owned files：0。
- P2 SGP：0；`.scenegis/upstream-patches.json` 未修改。
- ADR：
  [ADR-0002](../../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)
  保持 `approved`。
- Review：
  [P2 planar core review request](../reviews/2026-08-05-p2-planar-core.md)
  为 `approved`；P2-R001 至 P2-R004 均已由 Architecture Agent 复核为 `fixed`。
- 剩余风险：strict-square 不使用 epsilon；大坐标的数学寻址上限可能低于 52；
  `maximumSafeLevel` 不是 provider 数据可用层级。上述行为均由契约和 Specs 锁定。

P2 plan 与总体 roadmap 已更新为 `completed`。Architecture Agent 将代码、Specs、ADR
和 AgentDocs 作为独立 P2 阶段提交；提交后停在阶段边界，与项目负责人讨论 P3，
不直接进入实现。
