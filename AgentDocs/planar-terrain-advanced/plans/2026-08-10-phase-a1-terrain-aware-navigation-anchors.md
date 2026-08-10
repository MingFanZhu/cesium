# 阶段计划：A1 平面地形感知导航锚点

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`A1-terrain-aware-navigation-anchors`
- 状态（Status）：`completed`
- 负责人角色（Owner role）：`architecture`
- 执行角色（Execution role）：Execution Agent
- 架构评审（Architecture review）：`confirmed`
- 创建日期（Created）：`2026-08-10`
- 更新日期（Updated）：`2026-08-10`
- Extension plan：
  [SceneGIS 平面高级地形总体计划](2026-08-10-planar-terrain-advanced-extension.md)
- Architecture decision：
  [ADR-0024：平面地形感知导航锚点](../../../Documentation/SceneGIS/Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)
- Related review：
  [A1 implementation review](../reviews/2026-08-10-a1-terrain-aware-navigation-anchors.md)（`approved`）
- Implementation base：`1d93c1686b`（总体规划检查点）
- Branch：`feature/planar-terrain-advanced`
- SGP：预计 `0`

## 阶段目标

修复现有 planar controller 在非零 terrain/对象上仍使用 Z=0 gesture anchor 的根因。A1 为 left-drag
pan、middle-drag rotate 与 wheel zoom 建立同一 private anchor fallback chain，并让 pan/zoom 的后续
校正使用 anchor 自身高度。阶段结束后，三种 PC 手势在 flat、terrain、可见对象、大坐标和边界场景下
使用可预测锚点，同时保持 public World Z=0 picking、Home、target clamp、surface-side Camera profile 与
所有 terrain lifecycle 不变。

## 阶段边界

### In scope

- `SceneGISPlanarCameraController` 内的 private depth → terrain → Z=0 anchor resolver。
- Pan drag-start anchor 与固定 `Z=anchor.z` movement plane。
- Middle drag-start full Cartesian3 pivot 与现有 rotate math 的连接。
- Wheel pointer anchor 与固定 `Z=anchor.z` post-zoom correction。
- Depth capability/extent/fallback、gesture snapshot/cancel/release、四 frustum representative 与大坐标。
- 一个真实 Context non-flat terrain navigation closure。
- ADR、Architecture/Guide/UpgradeChecklist/DevelopmentGuide 与 AgentDocs 回写。

### Out of scope / 禁止范围

- 修改 `SceneGISPlanarWorld.pick`、`pickFromWindowPosition`、`pickTerrain` 或 terrain snapshot 公共/私有
  语义。
- 修改 `_SceneGISPlanarSurface`、terrain selection/request/mesh/cache/resource、imagery 或 ground/content
  runtime。
- 增加 navigation mode、underground、collision、clearance、防穿透、flight/tracking、touch 或 inertia。
- 修改 `_syncRig` 的 camera Z/pitch/roll recovery、Home、maximum range 或 center target Z=0 contract。
- 新增公共 API、Shader、Worker、build seam、Widget/Viewer product 修改或 Sandcastle 控件。
- 修改 upstream-owned file、创建 SGP 或扩大 `SGP-0001`/`SGP-0002`。若实现证明上述任一项不可避免，
  Execution 必须先回写 blocker 并交回 Architecture，不得自行扩大 A1。

## 已确认的源码事实

1. `SceneGISPlanarCameraController.js` 当前 `_pan`、`_rotate` 和 `_zoom` 分别在约 520、551、725 行调用
   `world.pickFromWindowPosition`；pan end 和 zoom correction 又调用 private `intersectPlane`，固定 Z=0。
2. `_rotate` 的 `positionForWindowAnchor` 已接受完整 `point.z`，并以 Camera world pose 和四 frustum slope/
   span 计算新 position；A1 不需要重写 rotate axes 或 frustum math。
3. `_syncRig` 与 `_applyTargetClamp` 使用 viewport center 的无限 Z=0 intersection，`_target.z` 固定为 0。
   这些属于 A2/A3 之前的 surface-side rig，A1 保留。
4. ControllerHost 在 `Scene.render` 的 current normal render 前更新 controller，因此 depth 与 terrain query
   snapshot 都来自最近成功 normal render；drag anchor 固定可避免手势中 LOD replacement 漂移。
5. `scene.pickPosition` 在 SCENE3D 返回 rendered world position；`useDepthPicking=false` 返回 undefined，
   depth texture unsupported 时必须通过 `pickPositionSupported` 预检。`pickTranslucentDepth=true` 会执行现有
   pick+depth pass。
6. `world.pickTerrain(ray)` 读取 reusable actual-cover snapshot、排除 skirt，并且查询不推进 selection、
   request、promotion、LRU 或 GPU；但当前 precise tile query 是线性 triangle traversal，不宜在已有合法
   depth 时重复执行。
7. `world.pick(ray)` 是 bounded、inclusive extent、forward-only Z=0 fallback；不能修改或放宽。
8. Cesium 1.144 upstream controller 的 `pickPosition` 比较 depth 与 Globe intersection；A1 采用同一
   “可见 depth + surface fallback”思想，但不引入 Globe/Ellipsoid/Camera.getPickRay。
9. 现有 controller Spec 已覆盖输入优先级、cancel/quarantine、四 frustum Home、边界 clamp、wheel 方向/
   速率、invalid pose recovery 和 no inertia；A1 只补能区分非零 anchor 的证据。
10. 现有 terrain Widget Spec 已闭合 `scene.pickPosition`、`world.pickTerrainFromWindowPosition` 与实际
    Float32 terrain mesh，可复用 fixture 思路但不把整个 T2-T6 大套件复制到 A1。

## 详细设计

### 1. File-scope anchor resolver

默认只修改
`packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`：

- 增加 file-scope `resolveNavigationAnchor`（最终命名可按源码风格微调）；
- 用 `SceneGISPlanarCamera.getWindowRay` 一次生成 ray；zero canvas 返回 undefined；
- depth path 只在 `scene.pickPositionSupported` 时调用 `scene.pickPosition`；接受 finite、inclusive extent
  内结果；不修改 Scene depth flags；
- depth miss 后调用 `world.pickTerrain(ray, scratch)`；terrain miss 后调用 `world.pick(ray, result)`；
- 结果 clone 到 caller result，不暴露 scratch，不创建 request/render，也不 catch programmer error；
- 复用 file-scope scratch。若 Execution 认为 cross-file module 确有必要，必须先在 plan 中记录理由，并
  保持 `_SceneGIS*`/`@private`/no-public-declaration；默认不拆文件。

Depth accepted 时 terrain call count 必须为 0，避免把 T4 linear triangle query 无条件放入 wheel hot path。
Depth non-finite 或 extent 外作为 miss，不扩大 world boundary。`pickTranslucentDepth` 的行为完全由 Scene
现有配置决定。

### 2. Anchor-height plane helper

在同一文件增加 private finite horizontal-plane intersection：

```text
t = (anchorHeight - ray.origin.z) / ray.direction.z
point = ray.origin + t * ray.direction
```

`direction.z === 0`、non-finite/negative `t` 或 non-finite point 返回 undefined；成功结果精确写回
`result.z = anchorHeight`。算术使用现有 `Math.hypot`/finite 风格，不通过 squared magnitude 引入可避免的
大坐标 overflow。该 helper 不修改 `_SceneGISPlanarCamera.intersectPlane` 的 Z=0 contract。

### 3. Pan

- 非 active left drag：从 aggregator 的 press/start position 解析一次 anchor，保存到 controller-owned
  `_panAnchor`；miss 时本帧 no-op。
- Active drag：end ray 与 `_panAnchor.z` 水平面求交；translation=`anchor-current`，因此正常结果 Z 分量
  为 0，不会在首次 terrain pan 时把 Camera 抬高/压低一个 terrain height。
- 继续执行既有 `_applyTargetClamp`；边界 clamp/no-home contract 不变。
- Release、feature disable、controller disable、zero canvas 和 middle priority 继续清除 `_panActive`；下一
  gesture 重新解析最新 anchor。

### 4. Rotate

- 非 active middle drag：使用共享 resolver 填充 `_rotatePivot`；成功时保留 press window anchor。
- Resolver miss 继续 clone `_target` 并使用 viewport center；不把 miss 变成异常或 Home。
- 后续 heading/pitch、axes、perspective distance、orthographic plane distance 和
  `positionForWindowAnchor` 保持现有实现；只证明非零 pivot 的投影在 gesture 后仍位于 press pixel。
- 当前 `scratchPosition.z > 0` guard、roll/pitch rules 和 target clamp 不在 A1 修改。

### 5. Zoom

- 增加 controller-owned reusable `_zoomAnchor`，删除现有每次 wheel 的 `new Cartesian3()` clone。
- 每个 wheel movement 在 pointer 解析 anchor；range/span 计算和 wheel exponential factor保持 P7 contract。
- 缩放后 pointer ray 与 `_zoomAnchor.z` 水平面求交，translation=`anchor-after`；不再固定与 Z=0 求交。
- Resolver miss 时不做 pointer correction，继续既有 center-range zoom；minimum/home maximum 和 frustum
  fields不变。

### 6. Durable contract 更新

Execution 同步：

- 在 ADR-0004/ADR-0010 增加 successor note，不重写历史 phase 事实；
- `Architecture.md` 明确 public Z=0 picks 保留、controller gesture anchors由 ADR-0024 接管；
- `PlanarWorldGuide.md` 说明三层 anchor fallback、depth/terrain时序和仍未支持 collision/underground；
- `PlanarWorldUpgradeChecklist.md` 增加 depth capability/cache、terrain snapshot、anchor-height plane 检查；
- `DevelopmentGuide.md` 增加简短 A1 implementation/review checklist；
- 回写本 phase plan、extension roadmap、README/plans index 与 review request。

## 影响路径

| 路径                                                                                                                     | 计划变化                                                                        | 所有权         |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------- |
| `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`                                                | 共享 resolver、horizontal plane、pan/rotate/zoom wiring与scratch reuse          | SceneGIS-owned |
| `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`                                             | deterministic source priority、三手势非零anchor、lifecycle/frustum/large-offset | SceneGIS-owned |
| `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js`                               | 新增一个focused real-Context terrain navigation closure                         | SceneGIS-owned |
| `Documentation/SceneGIS/Decisions/ADR-0004-*.md`、`ADR-0010-*.md`、`ADR-0024-*.md`                                       | historical successor与正式A1决定                                                | SceneGIS-owned |
| `Documentation/SceneGIS/Architecture.md`、`DevelopmentGuide.md`、`PlanarWorldGuide.md`、`PlanarWorldUpgradeChecklist.md` | durable rule、使用说明与升级检查                                                | SceneGIS-owned |
| `AgentDocs/planar-terrain-advanced/**`                                                                                   | phase结果、review与handoff                                                      | SceneGIS-owned |

预计不修改其他 product/spec/build/Sandcastle 路径。新增 Spec basename 由现有普通 JS/Spec discovery 发现；
不得手工提交生成的 SpecList。

## Spec 与验收设计

### Controller deterministic Specs

在既有 Widget/controller fixture 上增加少量能区分方案的 cases：

1. Depth priority：stub/spy 返回 in-extent nonzero rendered point；pan/rotate/zoom使用该点，且
   `world.pickTerrain` 未调用。
2. Terrain fallback：depth unsupported/undefined 时，真实或 instance-only terrain pick 返回 nonzero point；
   三种 gesture 至少各有一个 nonzero anchor closure。
3. Z=0 fallback：depth/terrain miss 保持既有 flat、miss和viewport-center rotate behavior；public
   `world.pickFromWindowPosition`仍返回Z=0。
4. Invalid depth：non-finite或extent外不污染anchor，继续terrain/Z=0；Camera mutation保持原子。
5. Pan：anchor投影在end pointer，Camera Z不因anchor height产生一次性跳变；drag内resolver只调用一次，
   release后下一drag重新解析。
6. Rotate：非零pivot在perspective和orthographic representative中保持press pixel，heading/pitch/axes和
   miss fallback不退化。
7. Zoom：非中心pointer在perspective/orthographic中保持非零anchor，range/span仍服从既有factor和clamp，
   frustum fields不变，reusable anchor identity稳定。
8. 一个`1e9`级world offset和一个负terrain height representative；不重复极端Number.MAX_VALUE矩阵。

可把相近断言合并到参数化case，不以每个assertion虚增direct case count。

### Real Context Spec

新增一个focused SceneGIS Widget Spec，使用本地确定性2×2/小网格Heightmap，不访问公网：

- normal render收敛后选取坡面内部非零高度点，证明`scene.pickPosition`、
  `world.pickTerrainFromWindowPosition`与expected Float32 surface闭环；
- 注册controller并执行一个真实input-pipeline或等价aggregator middle drag；
- `_rotatePivot`等于rendered/terrain point，rotation后该pivot投影仍落在press pixel tolerance内；
- 同一window的public`world.pickFromWindowPosition`仍为Z=0；
- anchor query前后terrain selection/request/promotion/LRU/GPU counters与command refs不发生A1新增mutation；
- webglStub capability branch只验证无异常/fallback，不冒充real depth通过。

不在A1重复完整terrain resource/destroy、lighting、imagery、ground/content或四frustum GPU矩阵。

## 实施顺序

1. 在 controller 增加 resolver/horizontal-plane/scratch，但先不改三种 gesture；补 source-priority Spec。
2. 接入 pan并验证anchor-height plane、drag snapshot和boundary。
3. 接入rotate并验证nonzero pivot与miss fallback。
4. 接入zoom、删除per-wheel allocation并验证pointer anchor/range/frustum。
5. 增加focused real-Context terrain navigation Spec。
6. 更新durable docs和AgentDocs，创建pending review request。
7. 运行最小充分矩阵并停止；不得进入A2。

## 最小充分验证

Execution 最终记录实际case count与命令结果，建议矩阵：

```powershell
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"
npm run build
```

另运行 changed-scope ESLint/Prettier、`AgentDocs/planar-terrain-advanced/**/*.md` 与受影响 SceneGIS docs 的
Prettier/Markdownlint、`git diff --check`、`node scripts/scenegis/audit-upstream-patches.mjs`。

不默认运行 build-release、build-ts、build-docs、tsc、Viewer/Globe/full engine、Sandcastle build或E2E，
因为A1不改public API/build/release/widgets/Sandcastle。若implementation实际扩大这些边界，先回写plan再增加
对应验证，不能把无关全量套件当作完成门槛。

## 完成条件

- 三种gesture共享一份获批resolver，没有分叉的临时source order。
- Valid rendered depth优先且不重复terrain scan；depth不可用时terrain→Z=0 fallback正确。
- Pan/zoom使用anchor-height plane，rotate围绕full 3D pivot；drag anchor lifecycle稳定。
- Public World Z=0 pick、terrain query、target clamp、Home、surface-side profile和input cancel契约不退化。
- Real Context non-flat terrain关闭项目负责人报告的middle pivot根因，且没有新增terrain/runtime mutation。
- Product diff只在SceneGIS-owned controller；upstream-owned files=`0`、A1 SGP=`0`、generated status=`0`。
- Focused自动化、build、static/docs与audit通过，review findings全部关闭。
- Architecture review通过后项目负责人完成现有Sandcastle人工复测并明确确认。
- A1 source、Specs、ADR/docs、AgentDocs/review形成独立中文本地提交；提交前不进入A2。

## 风险与停止条件

- 若真实depth与current ray在ControllerHost时序下可重复不一致，先记录fixture和事实，再决定是否需要
  distance comparison或frame synchronization；不得默默退回Z=0。
- 若`world.pickTerrain` fallback在真实wheel频率下成为可重复blocking hotspot，A1只记录并提出有界query
  优化，不提前进入A4 Worker或重写terrain query。
- 若非零anchor暴露现有`_syncRig`/target clamp/camera Z guard与terrain surface的冲突，属于A2/A3；A1只在
  不改变surface-side contract的范围修复anchor，否则停止交回Architecture。
- 若需要World/Surface/upstream/build修改或公共API，视为范围扩大，必须停止并重新裁决。

## Execution handoff

- 从base `1d93c1686b`的完整working tree开始实现；先核对没有用户/并发未提交改动。
- 只实现A1，不创建A2 plan、不修改A2-A7状态、不push。
- Implementation偏差、实际source/spec mapping、case counts、验证结果、ownership与剩余风险回写本plan。
- Ready后创建`AgentDocs/planar-terrain-advanced/reviews/2026-08-10-a1-terrain-aware-navigation-anchors.md`
  （`pending`），更新README/plans/reviews index并通知Architecture review。

## 偏差与结果

### 实际设计与影响路径

- `SceneGISPlanarCameraController.js`内增加file-scope `resolveNavigationAnchor`与
  `intersectHorizontalPlane`，没有拆分private module，也没有新增public API。
- Resolver只构造一次four-frustum ray；合法in-extent rendered depth命中后立即返回，miss后依次调用
  `world.pickTerrain`与`world.pick`。返回值clone到caller result，非finite结果不进入gesture state。
- Pan与rotate各自在drag start固定controller-owned full Cartesian3；pan movement使用`_panAnchor.z`。
  Wheel每次event解析pointer并复用新增`_zoomAnchor`，post-zoom correction使用anchor Z，不再分配临时
  `Cartesian3`。
- `_syncRig`、Home、`_target`、range与center clamp未修改；World、Surface、terrain runtime与upstream
  product diff均为0。

最终source-to-Spec mapping：

| Source                                                                    | Focused Specs                                                                              | A1 direct cases |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js` | `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`               | 4               |
| 同一controller与既有terrain/depth runtime的真实Context闭环                | `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js` | 1               |

Direct unique A1 cases=`5`。Controller suite另保留30个既有case；World与navigation Widget命令是回归
aggregate，不计入direct unique。

### 验证矩阵

| 命令                                                                                          | 结果                                                  |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"`               | Exit 0；34/34                                         |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget"` | Exit 0；1/1 real Context                              |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                          | Exit 0；20/20                                         |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"`        | Exit 0；4/4                                           |
| `npm run build`                                                                               | Exit 0；engine/widgets/root unminified bundles完成    |
| scoped ESLint与JS Prettier                                                                    | Exit 0；3个changed Source/Spec files                  |
| affected Markdown Prettier/Markdownlint                                                       | Exit 0；A1 AgentDocs与受影响SceneGIS durable docs     |
| `git diff --check`                                                                            | Exit 0                                                |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                            | Exit 0；delivery upstream-owned=0、generated status=0 |

Focused aggregate=`59` cases（34 controller + 1 A1 Widget + 20 World + 4 navigation Widget），其中A1
direct unique=`5`。

### 实现证据、偏差与风险

- Deterministic controller Specs锁定depth→terrain→Z=0顺序、合法depth时terrain call count=0、invalid/outside
  depth fallback、正负nonzero anchor、drag snapshot/release、perspective/orthographic、off-center pointer、
  `1e9`坐标与reusable wheel anchor identity。
- 新real-Context fixture使用本地2×2 Heightmap；non-flat sample的rendered depth与terrain query在`5e-3`
  tolerance内闭合，middle pivot保持press pixel，public window pick仍为Z=0，terrain debug counters与render
  command references零变化。该tolerance覆盖depth buffer重建误差，不改变产品数学。
- 旧extreme-frustum数学case显式stub depth miss，避免让非depth测试意外执行Scene depth render；产品
  fail-fast与frustum contract未改变。
- 无产品范围偏差：upstream-owned files=`0`、A1 SGP=`0`、manifest/SGP-0001/0002 unchanged、new patch
  marker=`0`、generated status=`0`。
- Remaining risk：anchor读取最近成功normal render的depth/terrain snapshot；transparent objects仍服从Scene
  `pickTranslucentDepth`配置。Collision、surface/underground mode与防穿透仍明确延期。
- Architecture独立复跑controller `34/34`、real-Context terrain-navigation Widget `1/1`及official
  upstream audit，均通过；Architecture/code review已`approved`，未发现blocking finding。
- `2026-08-10`项目负责人在现有Sandcastle完成middle pivot、pan与wheel人工复测并明确通过。A1全部完成
  条件已关闭，可形成独立本地提交checkpoint；A2尚未进入。
