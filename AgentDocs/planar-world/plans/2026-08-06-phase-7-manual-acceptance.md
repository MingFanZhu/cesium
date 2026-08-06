# 第七阶段计划：手工验收与平面导航修正

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- Parent plan：
  [SceneGIS 平面世界总体计划](2026-08-05-planar-world-extension.md)
- Phase：`P7-manual-acceptance`
- 负责人角色（Owner role）：`architecture`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-06`
- 更新日期（Updated）：`2026-08-06`
- 相关讨论（Related discussions）：项目负责人在 P6 checkpoint 上进行的手工验收
- 相关评审（Related reviews）：
  [P7 manual acceptance review](../reviews/2026-08-06-p7-manual-acceptance.md)（`approved`）
- ADR：
  `Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md`
- SGP：无；P7 upstream-owned product files=`0`

## 目标

在 P6 checkpoint `b25691eba82317df870af20c948cd40bc8d92cf3` 上关闭项目负责人
手工验收发现的导航体验缺陷，并建立“自动化验证通过后仍必须由项目负责人复测”的阶段
门禁：

1. mouse wheel 的物理方向与 Cesium 默认 Globe 场景一致，向前滚动放大、向后滚动缩小；
2. wheel zoom 的默认量级参考当前 Cesium Globe controller，不再出现每格只有约百分之一的
   迟缓缩放；
3. center ray 到达 coordinate-system extent 外或 pitch 接近当前 `-5°` 上限时，不得
   隐式调用 `viewHome`；
4. extent 继续约束 navigation target，但越界只进行连续的 boundary correction，不执行
   home reset；
5. EPSG:3857 Sandcastle 显式演示可选 skybox，使倾斜视角下的场景环境完整；
6. 修复完成并通过 Architecture/code review 后，由项目负责人重新执行人工验收，确认交互
   体验后才允许完成 P7。

P7 是功能验收与缺陷修正阶段。原总体计划中的性能、生命周期、升级审计和发布验收顺延到
P8，避免把交互修复与发布资格工作混入同一 checkpoint。

## 非目标

- 不实现高程 terrain、terrain provider、terrain mesh、影像贴地高程或 camera collision。
- 不实现地下导航、穿越 `Z=0`、地下 pitch 语义或地下拾取策略。
- 不把“Camera 永远必须位于 `Z=0` 上方”提升为 `SceneGISPlanarWorld` 的永久不变量；
  P7 只保留当前 surface-side camera controller 的能力限制，后续地下模式可以替换这一
  navigation profile。
- 不实现 touch、pinch、惯性、damping、flight 或新的 programmatic camera API。
- 不新增公开的 `zoomFactor`、`maximumMovementRatio`、minimum/maximum range 等调参 API。
- 不允许 navigation target 自由离开 extent；若后续人工验收认为 boundary clamp 本身仍
  影响体验，应回到 Architecture discussion，而不是由 Execution Agent自行放宽。
- 不自动为任意自定义 CRS 或任意 `SceneGISPlanarWorld` 创建 Earth skybox、Sun、Moon 或
  atmosphere。
- 不开始性能热路径重写、生命周期压力验收、Cesium upstream upgrade、发布打包或 P8。
- 不修改 upstream-owned file，不新增或扩大 SGP。

## 进入条件

- P1 至 P6 已完成 Architecture review，并分别形成独立本地 checkpoint。
- 当前基线为 P6 checkpoint
  `b25691eba82317df870af20c948cd40bc8d92cf3`，工作树在建立本计划前为 clean。
- 项目负责人已经在 `scenegis-planar-imagery` 中确认以下事实：
  - mouse wheel 向前滚动没有放大；
  - zoom 速度显著慢于 Globe；
  - 浏览到 extent 边界以及 pitch 接近侧视时会复位；
  - 当前示例没有 skybox；
  - terrain 可以延期；
  - 越界时接受 target boundary clamp，但不接受 home reset；
  - Camera 位于平面下方属于未来地下模式，不能被记录为平面世界永久非法状态。
- 项目负责人已于 `2026-08-06` 明确批准本计划；Architecture review 已改为
  `confirmed`，Execution Agent可以在本计划边界内开始实现。

## 当前源码事实

### Wheel 方向与速度

1. `ScreenSpaceEventHandler.handleWheel` 将标准 browser `WheelEvent.deltaY` 转换成与旧
   `wheelDelta` 相同的符号：物理向前滚动经过归一化后为正值。
2. `CameraEventAggregator.listenToWheel` 把该正值转换为
   `movement.endPosition.y = 7.5 * radians(delta)`。
3. legacy `ScreenSpaceCameraController.handleZoom` 将正 `diff` 作为 zoom-in，按当前
   distance、`zoomFactor = 5.0`、canvas height 和 `maximumMovementRatio = 0.1` 计算移动量。
4. 当前 `SceneGISPlanarCameraController._zoom` 使用
   `exp(movement.endPosition.y / 1200)` 并直接乘以 perspective range 或 orthographic span。
   因此真实向前 wheel 会增大 range，方向与 Globe 相反；普通 wheel 的单次比例也远小于
   Globe。
5. 当前 controller Spec 直接注入 `-120` 并把它声明为 zoom-in，没有经过真实 browser
   event normalization，因此锁定了错误符号而未发现集成问题。

### Boundary 与隐式 home

1. `_syncRig` 当前调用 public `world.pickFromWindowPosition(center, ...)`。该 API 按 ADR-0004
   必须执行 bounded surface pick，center hit 位于 extent 外时返回 `undefined`。
2. `_syncRig` 把 bounded miss 与 invalid pose 合并处理，并在 gesture 前调用 `viewHome`。
   这与 ADR-0004 已确认的“navigation 使用 unbounded `Z=0` intersection，之后只 clamp
   target”不一致。
3. `_applyTargetClamp` 已通过 private unbounded ray/plane intersection 做 boundary
   correction。P7 应统一 rig synchronization 与该数学语义，不能改变 public bounded pick。
4. `_syncRig` 对 `MINIMUM_PITCH`/`MAXIMUM_PITCH` 使用严格比较。Camera axes 分解在恰好
   `-5°` 附近可能产生微小 floating-point drift，导致合法的 clamp 边界被误判并 home。
5. planar surface 已经是 double-sided，public mathematical pick 与 rendered-depth pick
   也不是只能从 `+Z` 一侧工作。当前 `position.z > 0` 和负 pitch 只属于现有 surface-side
   controller profile，不得扩散成 world、surface 或 picking 的通用限制。

### Skybox

1. P1 明确禁止 non-Globe world 自动继承 Earth environment，但保留显式
   `CesiumWidget` `skyBox` option。
2. P6 Viewer planar allowlist 继续允许显式 `skyBox`，因此核心能力已经存在，不需要新的
   world API 或 upstream seam。
3. 当前 `scenegis-planar-imagery` 与 `scenegis-planar-viewer` 都没有传入 `skyBox`，所以
   人工案例在倾斜视角下只显示 scene background。

## 详细设计

### 1. Wheel 符号与 Globe 量级

wheel factor 使用 normalized viewport movement，而不是固定 raw exponent：

```text
diff = movement.endPosition.y - movement.startPosition.y
ratio = clamp(diff / canvas.clientHeight, -0.1, 0.1)
factor = exp(-5.0 * ratio)
```

- `diff > 0` 是 Cesium-normalized wheel forward，必须得到 `factor < 1` 并 zoom in。
- `diff < 0` 必须得到 `factor > 1` 并 zoom out。
- `5.0` 与 `0.1` 对齐当前 Globe controller 的默认 `zoomFactor` 和
  `maximumMovementRatio` 量级；P7 不公开它们。
- symmetric clamp 防止异常 wheel delta 导致 exponential overflow，同时保持正反方向的
  确定性。
- perspective 继续只改变 center-range 并保持 frustum fields；orthographic 继续等比例
  修改 span/off-center sides。
- pointer anchor、precision-safe minimum、dynamic home maximum 和 no-inertia contract 保持。
- zero-sized canvas 仍不得进行除法或 Camera/frustum mutation。

Specs 必须通过真实 `WheelEvent`/`ScreenSpaceEventHandler`/`CameraEventAggregator` 链路证明
物理方向，不能只继续调用 private movement fixture。direct movement Specs 可以保留用于极值和
数学边界，但不得作为方向的唯一证据。

### 2. Rig synchronization 与 boundary correction

`_syncRig` 使用 private four-frustum window-ray helper，并与无限 `Z=0` plane 求交：

1. center ray 具有 finite、forward plane intersection 时，该交点是 prospective navigation
   target，即使 XY 位于 extent 外也不触发 home。
2. prospective target 位于 extent 外时，使用现有 inclusive extent clamp 计算 correction，
   整体平移 Camera，使实际 center target 落在最近边界；保持 heading、pitch、roll、range 和
   frustum fields。
3. regular gesture 中到达边界后允许 extent 外 background 继续可见，但 target 不越界，
   不执行 home，也不产生不连续的 north-up/nadir reset。
4. public `SceneGISPlanarWorld.pickFromWindowPosition` 继续是 bounded surface API；不得为了
   controller 修复而允许 extent-outside public hit。
5. pointer-anchored pan/rotate/zoom 在发生 boundary correction 时仍以 target constraint
   优先，允许 pointer anchor 停止严格跟随；没有 correction 时保持原 anchoring contract。

### 3. Pitch 边界与当前 surface-side profile

- 内部状态继续 clamp 到 `[-PI/2, -5°]`。
- 从 Camera axes 重新分解 pose 时，使用仅覆盖 numerical round-trip drift 的 angular
  tolerance 判断上下限，然后再 clamp 回精确边界；不得用大 tolerance 接受真正越界姿态。
- 在 `-5°` 边界连续输入、release/new gesture、wheel 和 pan 时不得 home 或抖动。
- 当前 controller 仍不允许 Camera 穿越或停留在 `Z=0` 下方；若调用方把 Camera 外部修改到
  当前 profile 无法表达的平面下方姿态，当前版本可以安全回到 surface-side home。
- 上述规则只能写为 `SceneGISPlanarCameraController` 当前 profile 的限制。不得在
  `SceneGISPlanarWorld`、surface、tile、imagery 或 picking contract 中增加“negative Z
  永久非法”的校验，确保后续地下模式可以复用 double-sided surface 与 world coordinates。

### 4. 显式 skybox 示例

- 两个 EPSG:3857 Sandcastle 都通过现有 constructor option 显式传入
  `Cesium.SkyBox.createEarthSkyBox()`，使 CesiumWidget 与 Viewer 两条路径都可人工验收。
- 示例应说明这是应用选择的 environment，不是 EPSG:3857 或 planar world 的隐式默认。
- 不创建 `SkyAtmosphere`，不声称实现 `Globe` atmosphere，也不改变 surface lighting。
- 自动化测试不得依赖远程 OSM tile 或新的外部 skybox URL；使用 Cesium 随包资源和既有
  no-embedding Sandcastle build。

### 5. 人工验收门禁

Execution Agent 完成实现和自动化验证后必须停止，不得自行把 P7 标记 `completed`，也不得
进入 P8。Architecture Agent完成 code review 后，由项目负责人至少复测：

1. `scenegis-planar-imagery`：向前 wheel 放大、向后 wheel 缩小；普通连续滚动速度与 Globe
   主观接近，没有过慢或单次跳跃过大。
2. 从 nadir 逐步 middle-drag 到 `-5°` 附近，继续 pan、wheel、release/new gesture，不发生
   home reset。
3. 将 center target 推到 extent 四边和四角，继续相同与切向操作；target 贴边、背景可以
   出现，但 Camera 不复位。
4. Home 操作仍能显式恢复 north-up/nadir 全图。
5. `scenegis-planar-imagery` 与 `scenegis-planar-viewer` 在倾斜视角可见显式 skybox，OSM
   attribution 保持可见，console 没有新增 warning/error。

人工发现必须记录 expected/actual、复现步骤、browser/GPU、console stack 和可重复性。违反
P1-P7 已确认契约的 finding 必须修复；新能力请求进入后续 Architecture discussion；无法在
当前阶段可靠修复的事项必须由项目负责人明确接受或延期。

## 影响路径

### 允许修改

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`
- 必要时：
  `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`
- 必要的 SceneGIS-owned Widget/integration Specs，用于真实 DOM wheel 路径
- `packages/sandcastle/gallery/scenegis-planar-imagery/**`
- `packages/sandcastle/gallery/scenegis-planar-viewer/**`
- `Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md`
- 与 P7 状态、review 和交接直接相关的 `AgentDocs/planar-world/**`

### 禁止修改

- 所有 upstream-owned product files，包括 `Scene.js`、`CesiumWidget.js` 和 `Viewer.js`
- `.scenegis/upstream-patches.json`，除非 Architecture Agent先裁决新的 upstream seam；本阶段
  默认没有该权限
- P3 surface/quadtree/tile geometry、SSE 和 cache contract，除非新的复现证明它们直接导致
  P7 finding；发生时必须暂停并请求 Architecture decision
- P5 imagery provider/layer/request/composition contract
- generated files，包括 package root exports/types、`Build/**` 和 SpecList
- terrain、underground、touch/inertia、P8 performance/release 实现

## 实施步骤

1. Execution Agent复现真实 DOM wheel 的正负链路，并建立修复前失败的 integration Spec。
2. 按 viewport-normalized exponential 公式修正 perspective/orthographic wheel direction 与
   默认量级，补齐 small delta、large delta、minimum/home clamp 和 pointer anchor Specs。
3. 将 `_syncRig` 从 bounded public pick 改为 private unbounded center-plane intersection，并
   复用 target boundary correction；补齐 edge/corner/outside-center no-home Specs。
4. 为 pitch round trip 加入窄 numerical tolerance，补齐 `-5°` 连续多 gesture no-home Specs，
   同时保留真正 invalid external pose 的 current surface-side recovery。
5. 在两个 EPSG:3857 Sandcastle 中显式安装 Earth skybox，并保持 world/provider/credit 组装
   显式可见。
6. 更新 ADR-0004，记录 browser wheel 符号、Globe-calibrated exponential scale、bounded
   public pick 与 unbounded controller intersection，以及 surface-side restriction 不是 world
   永久不变量。
7. 运行 focused 与回归验证，回写完整 source-to-spec mapping、命令、结果和 ownership audit，
   创建 pending P7 review request 后停止。
8. Architecture/code review 通过后，由项目负责人执行人工复测；只有人工门禁通过或 finding
   被明确处置后，才能完成、提交 P7。

## 验证

### 自动化行为

- real DOM/browser-normalized wheel forward/back：perspective 与 orthographic 均验证方向。
- one-notch representative wheel：相对 range/span 变化量接近设计公式，并明显高于旧约 1%
  行为；small trackpad-like delta 保持连续，huge delta 被 ratio cap。
- pointer hit/miss、boundary correction、minimum/home maximum、四 frustum fields 和
  no-inertia 保持。
- center target 在四边、四角以及 prospective unbounded hit 位于 extent 外时不调用
  `viewHome`；Camera pose 保持 finite，target 最终位于 inclusive extent。
- pitch 到达 `-5°` 后跨多个 update、release/new gesture、pan/wheel 均不 home；真正超出
  tolerance、valid parallel/below-plane/invalid roll 仍走既有 home recovery；non-finite 或
  degenerate Camera axes 保持 P4 `DeveloperError` fail-fast contract。
- public bounded mathematical pick、depth pick 和 outside-extent background contract 不变。
- explicit skybox 在 CesiumWidget/Viewer 路径被保留；default non-Globe world 仍不得自动创建
  Earth environment。

### 回归命令

Execution Agent必须依据当前 runner 的实际入口记录精确命令和计数，至少覆盖：

- P4 private camera helper、`SceneGISPlanarCameraController`、World 与 navigation Widget Specs；
- P1 world/CesiumWidget environment Specs；
- P6 planar Viewer、HomeButton/ViewModel Specs；
- upstream `ScreenSpaceEventHandler`、`CameraEventAggregator`、
  `ScreenSpaceCameraController`、`CesiumWidget`、`Viewer` 的相关回归；
- SceneGIS WebGL aggregate，确认 render/depth/pick/imagery 没有回归；
- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run build-docs`
- `npm run tsc`
- no-embedding Sandcastle gallery/build；标准 embedding 若仍因外网 metadata 失败，必须如实
  记录，不能声明通过
- scoped ESLint、Prettier、Markdownlint 和 `git diff --check`

### Ownership 与生成物

- 相对 P6 checkpoint 的 upstream-owned product diff 必须为 `0`。
- P7 SGP 数量必须为 `0`，现有 `SGP-0001`、`SGP-0002` 文件和 manifest 不得改变。
- SceneGIS-owned source 中新增 `SCENEGIS_PATCH` marker 必须为 `0`。
- generated files、Build output 和 SpecList 的 git status 必须为 `0`。

### 人工验收

自动化和 review 通过后，最终以本计划“人工验收门禁”中的五项由项目负责人复测。人工验收
结果必须回写本计划与 P7 review；仅由 Execution Agent自行观察不能替代该门禁。

## 风险与依赖

- 不同鼠标和 trackpad 的 raw delta/mode 不同；必须以 Cesium 已归一化后的 aggregator 语义
  为边界，并保留真实 DOM 链路测试。
- 近水平 pitch 会放大 plane intersection 距离和 floating-point error；P7 保留 `-5°` 上限，
  只消除误复位，不借机放宽到更接近零。
- boundary correction 可以牺牲 pointer anchoring。当前优先级仍是 target extent constraint、
  finite pose 和连续不 home。
- `SkyBox.createEarthSkyBox()` 是 Earth starmap 的应用选择，不代表 CRS、terrain 或 atmosphere
  能力；自定义应用仍可传入自己的六面资源或 `false`。
- 未来地下模式需要重新定义 Camera side、pitch、surface visibility、pick priority 和可能的
  terrain collision。P7 不得把当前 `+Z` controller profile写入更低层 contract。

## 完成条件

- wheel 方向、速度、boundary reset 和 near-side pitch reset 四项人工 finding 均具有修复、
  自动化回归和 Architecture review 证据。
- 两个 EPSG:3857 示例显式展示 skybox，且没有改变 non-Globe world 的默认 environment。
- terrain 与地下模式仍明确延期，没有伪装为已支持。
- upstream-owned files=`0`、P7 SGP=`0`、generated status=`0`。
- P7 review 为 `approved`，项目负责人完成复测并明确接受交互结果。
- phase plan、extension plan、索引和 review handoff 更新为 `completed`。
- Architecture Agent使用中文提交信息创建独立本地 P7 checkpoint；不 push，并停下讨论 P8。

## 偏差与结果

### 实际实现

- 产品源码仅修改
  `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`：wheel 使用计划固定的
  viewport-normalized exponential 公式；`_syncRig` 使用 four-frustum center ray 与 private
  unbounded `Z=0` intersection，并复用 inclusive target correction；pitch 分解只接受
  `CesiumMath.EPSILON10` 的 round-trip tolerance，随后 clamp 回精确边界。
- Source-to-spec mapping：`SceneGISPlanarCameraController.js` ->
  `SceneGISPlanarCameraControllerSpec.js`。该 Spec 最终为 `30` 个 direct cases，相对 P4 的
  `25` 个新增 `5` 个聚焦 case：真实 DOM wheel normalization、small/huge normalized scale、
  perspective/orthographic 四边/四角 outside-center gesture correction、`-5°`
  wheel/pan/release/new-gesture no-home，以及 tolerance 外 pitch 的 gesture-triggered home。
- 两个 Sandcastle 的 `main.js` 均通过已有 constructor option 显式传入
  `SkyBox.createEarthSkyBox()`；对应 `sandcastle.yaml` 明确它是 application-selected
  environment。未创建 `SkyAtmosphere`，未改变任意 planar world 的默认环境。
- ADR-0004 追加 P7 amendment，区分 bounded public picking 与 controller private unbounded
  intersection，并记录真实 wheel 链路、公式和 surface-side profile 边界。
- 实现与确认计划一致；没有修改 private camera helper、World、surface、imagery 或 public API。

### 自动化验证

所有 gulp test 命令串行运行；substring aggregate 只作为 runner 证据，不重复计算 direct
unique cases。

| 命令                                                                                              | 结果                                                                              |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"`                   | Exit 0，`30 SUCCESS`                                                              |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCamera"`                             | Exit 0，`38 SUCCESS`（包含 controller aggregate）                                 |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                              | Exit 0，`14 SUCCESS`                                                              |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"`            | Exit 0，`4 SUCCESS`                                                               |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISWorldCesiumWidget"`                       | Exit 0，`16 SUCCESS`                                                              |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarWorldCesiumWidget"`                 | Exit 0，`1 SUCCESS`                                                               |
| `npm run test -- --webglValidation --includeName "SceneGIS/Scene/SceneGISPlanar"`                 | Exit 0，`120 SUCCESS`；覆盖 mathematical/depth pick、surface 与 imagery aggregate |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarImageryCesiumWidget"`               | Exit 0，`9 SUCCESS`                                                               |
| `npm run test -- --includeName "SceneGIS/SceneGISPlanarHomeButton"`                               | Exit 0，`7 SUCCESS`（包含 ViewModel overlap）                                     |
| `npm run test -- --includeName "SceneGIS/SceneGISPlanarHomeButtonViewModel"`                      | Exit 0，`4 SUCCESS`                                                               |
| `npm run test -- --includeName "SceneGIS/SceneGISPlanarViewer"`                                   | Exit 0，`18 SUCCESS`                                                              |
| `npm run test -- --includeName "Core/ScreenSpaceEventHandler"`                                    | Exit 0，`148 SUCCESS`                                                             |
| `npm run test -- --includeName "Scene/CameraEventAggregator"`                                     | Exit 0，`16 SUCCESS`                                                              |
| `npm run test -- --includeName "Scene/ScreenSpaceCameraController"`                               | Exit 0，`73 SUCCESS`                                                              |
| `npm run test -- --includeName "Widget/CesiumWidget"`                                             | Exit 0，`75 SUCCESS`                                                              |
| `npm run test -- --includeName "Widgets/Viewer"`                                                  | Exit 0，`82 SUCCESS`                                                              |
| `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run build-docs`、`npm run tsc` | 全部 Exit 0                                                                       |
| `npm run build-gallery --workspace=packages/sandcastle`                                           | Exit 1；外部 Hugging Face tokenizer metadata fetch 失败，未写成通过               |
| `npm run build-gallery-no-embedding --workspace=packages/sandcastle`                              | Exit 0，发现 `305` 个 examples                                                    |
| `SANDCASTLE_NO_EMBEDDINGS=1 npm run build-sandcastle`                                             | Exit 0；仅 plugin timing 与 chunk-size warnings                                   |

最终 scoped ESLint、JavaScript/Sandcastle/Markdown Prettier、Markdownlint 与
`git diff --check` 均 Exit 0；只有 Git 的既有 LF/CRLF working-tree warning。

Initial review focused fixes 后再次运行 controller `30 SUCCESS`、Camera aggregate
`38 SUCCESS`、World `14 SUCCESS`、navigation Widget `4 SUCCESS`、`npm run build` 与
`npm run build-docs`，均 Exit 0。Architecture focused re-review 独立复跑前四项与
`npm run build`，结果均一致，并确认 P7-R001 至 P7-R004 为`fixed`、review 为`approved`。
项目负责人随后确认人工复测通过。

### 人工验收结果

项目负责人于 `2026-08-06` 确认本计划五项浏览器/GPU 门禁全部通过：

1. wheel 向前放大、向后缩小，连续缩放速度可接受；
2. 接近 `-5°` 后继续 pan、wheel、release/new gesture 不发生 home reset；
3. center target 到达四边和四角后继续操作不发生 Camera 复位；
4. Home 仍可显式恢复 north-up/nadir 全图；
5. 两个 EPSG:3857 示例的 skybox、OSM attribution 和 console 表现可接受。

本次人工复测没有产生新的 finding。terrain 仍延期，地下模式仍是未来独立能力，不属于
P7 已支持范围。

### Ownership、门禁与剩余风险

- 相对 P6 checkpoint `b25691eba82317df870af20c948cd40bc8d92cf3`，upstream-owned
  product files=`0`；P7 SGP=`0`；`.scenegis/upstream-patches.json`、SGP-0001/0002 hunks
  未改变；SceneGIS-owned 新 patch marker=`0`；generated/Build/SpecList status=`0`。
- 自动化、Architecture/code review 和项目负责人浏览器/GPU人工复测均已通过。P7、roadmap
  和 extension index 已更新为 `completed`，由 Architecture Agent创建独立本地 checkpoint；
  不push，也不进入P8。
- OSM best-effort 网络内容和标准 embedding 的外部 metadata 可用性仍是已接受风险。
