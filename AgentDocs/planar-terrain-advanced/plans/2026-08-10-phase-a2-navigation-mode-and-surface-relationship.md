# 阶段计划：A2 平面导航模式与相机—地表关系

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`A2-navigation-mode-and-surface-relationship`
- 状态（Status）：`completed`
- 负责人角色（Owner role）：`architecture`
- 执行角色（Execution role）：Execution Agent
- 架构评审（Architecture review）：`approved`
- 架构评审人：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- 创建日期（Created）：`2026-08-10`
- 更新日期（Updated）：`2026-08-11`
- Extension plan：
  [SceneGIS 平面高级地形总体计划](2026-08-10-planar-terrain-advanced-extension.md)
- Architecture decision：
  [ADR-0025：平面导航模式与相机—地表关系](../../../Documentation/SceneGIS/Decisions/ADR-0025-planar-navigation-mode-and-surface-relationship.md)
- Related review：
  [A2 Architecture/code review](../reviews/2026-08-10-a2-navigation-mode-and-surface-relationship.md)
- Implementation base：`6657aac8fe1466cef6705e63d840ba32b930f367`（A1 completed checkpoint）
- Branch：`feature/planar-terrain-advanced`
- SGP：预计 `0`

## 阶段目标

A2 在不提前实现 collision 的前提下，把当前唯一的 surface-side Z=0 rig 提升为显式、可切换且能实际操作
terrain 两侧的 navigation profile。阶段结束后：

- `SceneGISPlanarCameraController.navigationMode` 以 `"surface" | "underground"` 表达应用 policy；
- mode 与 Camera 相对 resident terrain/Z=0 fallback 的 observed relationship 明确分离；
- surface 默认行为保持兼容，underground 能接纳合法的上侧/下侧 programmatic pose，并继续 pan/rotate/wheel；
- center rig/target clamp 能保留 actual terrain target Z，同时 public World Z=0 pick 不变；
- collision、clearance、防穿透、穿越与完整 recovery 仍由 A3 独立设计。

## 进入条件

- A1 implementation、Architecture review、项目负责人人工验收和中文 checkpoint
  `6657aac8fe1466cef6705e63d840ba32b930f367` 已完成。
- 当前 branch 为 `feature/planar-terrain-advanced`，planning 开始时 worktree clean。
- 已重新审计 `SceneGISPlanarCameraController`、private four-frustum Camera helper、
  `SceneGISPlanarWorld.getTerrainHeight/pickTerrain`、ControllerHost、Scene render order 与 Viewer readonly
  controller getter。
- ADR-0025 已由 Architecture 直接批准；本 plan 不需要再次等待项目负责人确认。

## 阶段边界

### In scope

- 既有 public controller 的 `navigationMode` constructor option/mutable property，精确 union 为
  `"surface" | "underground"`，默认 `"surface"`。
- Setter fail-fast、same-value no-op、held-input cancel/quarantine 与 Camera-zero-mutation 切换。
- Private Camera—surface relationship：resident terrain height → Z=0 fallback、signed side 与 no-mutation。
- Private mode-aware viewport-center target：actual-cover terrain → relationship horizontal plane，extent clamp 保留 Z。
- Surface above/down 与 underground above/down、below/up 的 pitch/roll/orbit profile。
- Programmatic Camera 在下一 gesture 被当前 mode 接纳或拒绝的明确行为。
- 一个 focused real-Context non-flat terrain above/below closure。
- Public types/API docs 与 ADR/Architecture/DevelopmentGuide/PlanarWorldGuide/UpgradeChecklist/AgentDocs 回写。

### Out of scope / 禁止范围

- Terrain clearance、continuous/swept collision、法向 push-out、防穿透、provider/LOD change recovery；这些全部留给 A3。
- 自动 surface ↔ underground mode switching，或把 Camera Z/terrain pick 当作 mode selector。
- Free-look、显式穿越 gesture、flight/tracking、touch、pinch、inertia、键盘或地下材质/透明/cutaway。
- 修改 public `SceneGISPlanarWorld.pick`、`pickFromWindowPosition`、terrain query/picking 或 A1 pointer anchor
  source priority/lifecycle。
- 新增 runtime enum export、`navigationModeChanged` Event、World/Scene property、Viewer constructor option、
  Widget/Home UI toggle或新 Sandcastle 控件。
- 修改 Surface/quadtree/terrain request/mesh/cache/resource、imagery、content/ground、Shader、Worker 或 build seam。
- 修改 upstream-owned file、创建/扩大 SGP。若实现证明这些路径不可避免，Execution 先记录 blocker 并交回
  Architecture，不得自行扩大 A2。

## 已确认的源码事实

1. Controller 当前 964 行，constructor 只有 `world`；public settings 为 `enabled`、三个 feature flag 与
   `homePadding`。状态切换已有 `_clearInputState`、held press quarantine 与 aggregator reset 契约。
2. `_syncRig` 只用 center ray 的 Z=0 intersection，拒绝 Camera Z≤0、positive/near-horizontal pitch、roll 与
   invalid axes；`allowHome=true` 时调用 `viewHome`。
3. `_applyTargetClamp` 与 private `clampTarget` 强制 target Z=0；`_rotate` 也拒绝新 Camera Z≤0。`getAxes`/
   `getHeadingPitch` 本身支持正 pitch，因此 below-side 不需要重写 world/local pose decomposition。
4. A1 pointer resolver 已按 rendered depth → terrain → bounded Z=0 工作。Pan/rotate drag 在 press snapshot，
   wheel逐event snapshot；水平面 helper允许正负高度且不分配 per-wheel Cartesian3。
5. `world.getTerrainHeight` 从 maximumLevel 向上查找 deepest resident direct/upsampled active mesh，extent外/
   flat/no-resident返回undefined；它不请求或更新LRU。关系查询不应无输入地每frame扩大该查找成本。
6. `world.pickTerrain` 查询最近normal render actual cover、双面且排除skirt；适合作为center surface target，
   但不能改变public `world.pick`。
7. `ControllerHost.update` 在 `Scene.render` 的 current normal render前执行；A2看到的是最近成功render的
   resident/query snapshot。合法 input内保持snapshot可避免LOD中途跳变。
8. Viewer 已在SGP-0002下创建唯一controller，并通过readonly `viewer.planarCameraController`暴露它；应用可直接
   设置新property，不需要修改Viewer/upstream。
9. Globe 的 `Scene.cameraUnderground` 由Cartographic camera height与loaded globe height计算，并与
   `enableCollisionDetection` policy分离；A2借鉴关系/策略分离，不复用其坐标或upstream state。
10. 现有package exact public inventory为engine/widgets/root `24/2/26`。新增controller member不会增加runtime
    export；不得为两个mode新增第25个engine export。

## 详细设计

### 1. Public `navigationMode`

- Constructor JSDoc 增加
  `@param {"surface"|"underground"} [options.navigationMode="surface"]`。
- Prototype property 使用相同 exact union，getter返回当前值；setter只接受两个lowercase值。
- Constructor在连接input或发生Camera/terrain mutation前验证。
- Invalid assignment在mode、Camera、frustum、input active state和World query前失败。
- Same-value assignment不调用 `_clearInputState`；different-value assignment取消pan/rotate/wheel并隔离仍按住的
  button，mode切换后必须真实release/new press才能开始新drag。
- 切换不调用`viewHome`、不修改Camera/frustum/target，不调用`getTerrainHeight`/`pickTerrain`。

A2不增加Event。应用同步赋值后可直接读取property；Viewer用户通过
`viewer.planarCameraController.navigationMode`使用。Planar Home继续只调用`viewHome(scene)`。

### 2. Private relationship

在controller file-scope增加无分配helper，输入live World和finite Camera world position：

- `world.getTerrainHeight(position)`返回finite number时采用resident `surfaceHeight`；
- undefined时采用`0.0`，覆盖no provider、flat、no resident和extent外；
- 计算finite signed distance并区分above/below/on-surface；
- observed side不读写`navigationMode`，也不创建public getter/event。

只在first synchronization和存在需要rig synchronization的真实input时计算；A2不为了维护idle public state而
每frame扫描maximumLevel。A3若需要programmatic collision的每frame检测，必须基于profiling和新phase明确扩展。

### 3. Mode-aware center target与clamp

将当前`getUnboundedCenterTarget`替换为mode-aware private resolver：

1. 生成一次center four-frustum ray；
2. 优先`world.pickTerrain(ray)`；
3. miss时与relationship `surfaceHeight`水平面做forward intersection；
4. 无法表示/平行/backward为普通miss；
5. clamp只限制X/Y到inclusive extent，并保留target Z。

Center resolver不调用`scene.pickPosition`。A1 pointer resolver继续允许对象depth成为gesture anchor；全局rig不会
因center前景Entity改变target/range。`_target`由成功sync写入，gesture内不随LOD改变；下一gesture重新sync。

若需要修改private `SceneGISPlanarCamera.clampTarget`，只能把它从“强制Z=0”收窄为“clamp X/Y、复制finite Z”，
并补其既有surface输入回归；不得扩大public API。

### 4. Surface profile

- 默认mode与现有Home保持`"surface"`。
- 成功center target必须位于Camera下侧；pitch继续`[-π/2, -5°]`，roll/axes规则不变。
- Invalid external pose的下一gesture Home recovery保留，避免A2改变现有应用行为。
- `viewHome`仍以extent center Z=0建立north-up/nadir fitted view并保持当前`navigationMode`值；在terrain
  scene的下一gesture，center target再同步到actual terrain。

A2不把上述检查误写成World永久“Camera必须高于terrain”的不变量，也不按resident height主动移动Camera。

### 5. Underground profile

- Center target在Camera下方：沿用negative pitch range。
- Center target在Camera上方：使用mirror positive pitch range`[+5°, +π/2]`。
- 合法above/down与below/up pose在`firstUpdate`/下一gesture被接纳，不调用Home；heading/roll/world axes保持。
- `_rotate`按当前rig side选择pitch clamp并保持Camera在pivot同一侧；不得保留hardcoded Camera Z>0 guard。
- Pan仍在A1 anchor Z平面平移；wheel仍围绕pointer anchor校正并以mode-aware `_target`计算range。
- `viewHome`在underground mode中仍是explicit surface-side home，但不更改mode；之后above-side gestures合法。
- On-surface、无forward target或近水平pose不当作正常碰撞并Home；普通input本帧不修改Camera。Finite/
  orthogonality/frustum错误继续fail-fast。

这提供可用的两侧orbit profile，但不承诺跨terrain穿越、clearance或free-look；这些是A3门禁。

### 6. Durable contract与公共生成结果

- ADR-0004/ADR-0024增加A2 successor说明，不改写历史A1事实。
- `Architecture.md`提升mode owner、string union、relationship fallback、两侧profile与A3边界。
- `DevelopmentGuide.md`把A1的Z=0 `_syncRig`阶段性规则改为A2 mode-aware检查清单。
- `PlanarWorldGuide.md`给出Viewer/CesiumWidget设置示例，明确Home与mode、collision尚未支持。
- `PlanarWorldUpgradeChecklist.md`增加mode/relationship/private terrain query升级项。
- Public runtime/types/API检查`navigationMode` member与exact string union；现有24/2/26 export集合保持不变。

## 影响路径

| 路径                                                                                                                     | 计划变化                                                                  | 所有权         |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------- |
| `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`                                                | public mode、private relationship、mode-aware rig/profile/input isolation | SceneGIS-owned |
| `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js`                                                | 仅在需要时让private target clamp保留finite Z                              | SceneGIS-owned |
| `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`                                             | public contract、switch、relationship、两侧pose/gesture与既有surface回归  | SceneGIS-owned |
| `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js`                               | 扩展一个真实terrain above/below mode closure                              | SceneGIS-owned |
| `Documentation/SceneGIS/Decisions/ADR-0004-*.md`、`ADR-0024-*.md`、`ADR-0025-*.md`                                       | successor与正式A2决定                                                     | SceneGIS-owned |
| `Documentation/SceneGIS/Architecture.md`、`DevelopmentGuide.md`、`PlanarWorldGuide.md`、`PlanarWorldUpgradeChecklist.md` | durable rule、用法与升级检查                                              | SceneGIS-owned |
| `AgentDocs/planar-terrain-advanced/**`                                                                                   | phase结果、review、roadmap与handoff                                       | SceneGIS-owned |

预计不修改World/Surface/Viewer/Widget product、package smoke、compatibility inventory、Sandcastle、E2E、build config或
`.scenegis/**`。若实际影响路径扩大，先回写plan与ownership，再执行相应最小验证。

A2-R003经Architecture授权后的实际范围窄扩为既有SceneGIS-owned
`packages/sandcastle/gallery/scenegis-planar-terrain/{index.html,main.js,sandcastle.yaml}`，仅补人工验收所需的mode
控件、profile状态和deterministic underground view；不改变上述product路径与公共契约。

## Spec 与验收设计

### Controller deterministic Specs

新增少量参数化cases，不追求极端矩阵：

1. 默认/constructor/property：默认surface、两个合法值、invalid constructor/assignment原子失败、same-value no-op。
2. Mode switch lifecycle：held left/middle被quarantine，wheel被取消；Camera/frustum/target/terrain spy在setter中
   完全不变，release/new press后才按新mode生效。
3. Relationship：positive与negative resident height各一个、no-provider/no-resident Z=0 fallback；observed side不
   改mode，query无request/LRU/runtime mutation。
4. Surface regression：above/down保持既有pitch/Home/boundary/range；invalid below/up仍按surface规则恢复。
5. Underground above：downward perspective representative与surface交互一致。
6. Underground below：programmatic below/up pose在一个perspective与一个orthographic representative中执行
   pan/rotate/wheel，不调用Home；positive pitch mirror clamp、finite axes、target Z与screen anchor稳定。
7. Mode-aware target：actual terrain优先，miss回relationship height/Z0，clamp保留Z；center前景depth不参与rig。
8. `viewHome`不更改mode；underground Home后above-side input仍可用。

相近断言合并到现有cases；direct unique count按实际新增`it`记录，不把扩展assertion重复计数。

### Real Context Spec

扩展现有本地non-flat Heightmap fixture，避免新增重复Widget suite：

- normal render收敛后建立terrain上方down-looking与terrain下方up-lookingpose；
- surface mode保持上侧路径，underground mode的下侧middle/一个pan或wheel representative不Home；
- center terrain target与`world.pickTerrainFromWindowPosition`/rendered surface闭环，public window pick仍Z=0；
- interaction前后selection/request/promotion/LRU/GPU/command refs无A2新增mutation；
- perspective为主要real Context证据；orthographic使用deterministic controller Spec，不复制GPU矩阵。

不在A2重复terrain resource destroy、imagery/content/ground、四frustum、大量boundary或性能soak。

## 实施顺序

1. 增加并验证public mode constructor/property与input transition；尚不改rig。
2. 增加private relationship与center target resolver，保留pointer anchor chain。
3. 让target clamp保留Z，并先恢复surface default regression。
4. 接入underground above/below mirrored pitch与rotate side guard。
5. 扩展focused real-Context terrain navigation closure。
6. 更新durable docs与AgentDocs，创建pending review request。
7. 运行最小充分矩阵并停止；不得进入A3。

## 最小充分验证

Execution 记录实际case count与命令结果，建议矩阵：

```powershell
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run build
npm run build-ts
npm run build-docs
npm run tsc
```

另运行changed-scope ESLint/JS Prettier、affected SceneGIS/AgentDocs Markdown Prettier与Markdownlint、
`git diff --check`、`node scripts/scenegis/audit-upstream-patches.mjs`，并断言：

- generated runtime/types/API中存在public `navigationMode`与exact string union；
- non-underscore public SceneGIS export集合没有因A2新增名称；
- generated files最终不进入status。

不默认运行build-release、installed package smoke、Viewer/Globe/full engine、Sandcastle build或E2E，因为A2不改
release/build/widgets/example路径。若implementation实际扩大边界，再增加对应验证，不反复运行无关全量套件。

## 偏差与结果

### 实际设计与路径

- Product runtime只修改
  `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`。新增exact string-union
  `navigationMode`、input isolation、resident-height fallback、terrain-first center target、Z-preserving XY clamp与
  mirrored below-side pitch/orbit guard。
- `_SceneGISPlanarCamera.js`未修改。计划允许的target-clamp变化在controller内完成，因为只有controller需要保留
  terrain target Z；这避免扩大private Camera helper现有Z=0调用语义。
- Camera-local relationship在每次rig sync中独立调用`world.getTerrainHeight(cameraPosition)`并回退Z=0；center
  resolver另行生成一次four-frustum ray，优先`world.pickTerrain`，miss时与该relationship平面求交。Surface
  admission同时要求camera位于local relationship上方；orbit pitch/side继续相对center target判断。
- Pan/rotate只在press/首movement同步relationship与center target；held movement只在snapshot target height做
  几何更新与XY clamp，不再查询terrain。Release/new press才采用新resident/actual-cover结果；wheel仍每event同步。
  Center rig不调用`scene.pickPosition`，idle `update`也不查询terrain。
- A1 pointer resolver保持depth→terrain→bounded Z=0顺序；pan/rotate/wheel继续使用full Cartesian3 anchor。
- Specs修改：
  `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`与
  `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js`。Controller新增6个
  direct `it` cases，既有public/source-order cases扩展断言；real-Context既有1个case扩展above/below closure。
- Durable docs采用Architecture预写的ADR-0025/ADR successor与指南变更，并修正PlanarWorldGuide支持矩阵中已被
  A2取代的旧`underground` unsupported条目。
- 初始计划不修改Sandcastle；项目负责人人工验收暴露A2-R003后，Architecture将范围窄扩到既有
  `scenegis-planar-terrain`。页面新增直接读写`viewer.planarCameraController.navigationMode`的
  Surface/Underground选择器、当前profile状态与deterministic Underground view。该view先显式切到
  `"underground"`，再以resident-only mountain center height（undefined回退0）放置镜像的below/up pose；
  Mountain view、Lighting与Home保留，Home不改变mode，页面明确surface地下pose的下一输入Home与A3 crossing边界。

### 验证矩阵

| 命令                                                                                          | 结果                                                      |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"`               | Exit 0，40/40；A2新增direct cases=6                       |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget"` | Exit 0，1/1 real Context；既有case扩展terrain上下两侧证据 |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidget"`        | Exit 0，4/4                                               |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                          | Exit 0，20/20                                             |
| `npm run build`                                                                               | Exit 0                                                    |
| `npm run build-ts`                                                                            | Exit 0；保留仓库既有TSD-JSDoc warning                     |
| `npm run build-docs`                                                                          | Exit 0                                                    |
| `npm run tsc`                                                                                 | Exit 0                                                    |
| generated runtime inventory script                                                            | Exit 0；engine/widgets/root=`24/2/26`                     |
| changed-scope ESLint与JS Prettier                                                             | Exit 0                                                    |
| affected Markdown Prettier/Markdownlint                                                       | Exit 0                                                    |
| `git diff --check`                                                                            | Exit 0                                                    |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                            | Exit 0；upstream-owned entries=0、generated status=0      |

Focused aggregate为65 cases（40+1+4+20）；A2 direct unique为6，Widget的1个case与既有cases中的新增断言不重复
计为direct case。

A2-R003 Sandcastle-only验证：`npm run build-gallery-no-embedding`（`packages/sandcastle`）Exit 0并处理307个
gallery examples；`npm run build-sandcastle -- --no-embeddings` Exit 0，仅有非阻断chunk/plugin timing warnings；
terrain Sandcastle scoped ESLint与JS/HTML/YAML Prettier均Exit 0。

### 生成、所有权与风险

- Generated declarations中constructor option与property均为`"surface" | "underground"`；API HTML显示相同
  exact union。A2没有新增basename/public export，non-underscore SceneGIS inventory保持24/2/26。
- Upstream-owned product files=`0`；A2 SGP=`0`；`.scenegis/upstream-patches.json`、SGP-0001/0002与既有
  marker未修改；generated files未进入status。
- 未运行build-release、package smoke、Viewer/Globe、E2E与全库Specs；A2-R003只触及既有Sandcastle人工
  入口，因此补跑一次no-embedding gallery discovery和Sandcastle build，不重复产品Specs/types/docs。
- 剩余风险：relationship只反映最近resident/actual-cover snapshot；A2不提供collision、clearance、防穿透、
  crossing或free-look。项目负责人已于`2026-08-11`通过更新后Sandcastle的surface/underground上下侧、平移、
  旋转和缩放人工复测。

## 完成条件

- Public mode owner、默认值、合法值、切换和无Event/无Viewer option决定与ADR-0025一致。
- Mode switch同步、原子、无Camera/terrain mutation，并隔离held input。
- Relationship明确使用resident terrain→Z0 fallback，不推断mode、不推进terrain runtime。
- Surface default回归；underground above/down与below/up三手势可用，合法下侧pose不Home。
- Center target使用terrain/relationship surface并保留Z，A1 pointer depth priority与public Z=0 pick不变。
- A2没有实现或伪装collision、clearance、防穿透、crossing/free-look。
- Public member进入runtime/types/API；export inventory不变；focused automation/build/types/docs/static/audit通过。
- Upstream-owned files=`0`、A2 SGP=`0`、generated status=`0`。
- Review findings全部关闭后，由Architecture形成独立中文本地提交；提交前不得进入A3。

## 风险与停止条件

- 若below-side稳定orbit必须引入free-look、terrain transparency或完整collision，停止并保留给A3，不在A2复制
  Cesium globe controller。
- 若mode-aware center target在ControllerHost时序下因terrain revision产生可重复gesture-start跳变，只记录
  精确fixture并固定一次gesture snapshot；不得增加每movement terrain重采样。
- 若resident height查询成为可重复idle hot-path，保持按需同步，不引入每frame public relation state。
- 若public string union无法正确生成types/API，先检查JSDoc/generator事实；不得手工编辑生成文件或以runtime enum
  规避，除非Architecture重新裁决公共inventory。
- 若需要World/Surface/Scene/Viewer/upstream/build修改，立即回写blocker并停止。

## Execution handoff

- 从base `6657aac8fe1466cef6705e63d840ba32b930f367`及本次A2 planning working tree开始；先核对只有已批准
  ADR/phase/durable-doc规划变更，没有用户或并发产品改动。
- 实现完整A2，不创建A3 plan、不修改A3-A7状态、不push。
- Implementation偏差、实际source/spec mapping、direct unique counts、验证、public生成结果、ownership与剩余风险
  回写本plan。
- Ready后创建
  `AgentDocs/planar-terrain-advanced/reviews/2026-08-10-a2-navigation-mode-and-surface-relationship.md`
  （`pending`），更新README/plans/reviews index并通知Architecture review。
- 若遇到上述停止条件，记录可复现事实并暂停；不要用Home、Z=0强制或隐式mode推断绕过。

## 完成记录

- Architecture确认A2-R001、A2-R002与A2-R003全部关闭，review状态为`approved`。
- 项目负责人于`2026-08-11`完成同一terrain Sandcastle人工验收并确认通过。
- A2 product、Specs、ADR/durable docs、Sandcastle与AgentDocs由Architecture形成独立中文本地checkpoint；
  A3只能从该clean checkpoint重新审计和建立phase plan。
