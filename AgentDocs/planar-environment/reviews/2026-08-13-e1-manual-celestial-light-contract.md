# E1 Review：手动天体方向与光照契约

## Metadata

- Status：`approved`
- Date：`2026-08-13`
- Phase：[E1 phase plan](../plans/2026-08-13-phase-e1-manual-celestial-light-contract.md)
- Reviewer：Architecture Agent
- Commit/push：None；working tree intentionally uncommitted
- ADR：`ADR-0033`
- SGP：None；upstream-owned files=`0`

## Review request

请复核以下contract与实现：

- Direction validation先按最大绝对分量scale再normalize；public observer-to-body方向与stable light负号、clone/no-op/
  failure atomicity一致。
- `connectedCallback`完整校验后才占用World registry，`firstUpdate`后才capture Scene light并请求一帧；active update只reassert
  同一light，不持续request render。
- Disable/re-enable/disconnect/World destroy使用reference-identity conditional restore；World与Environment均不拥有任何light。
- 同world独占包含disabled/尚未first-update，World destroy保留host marker直到caller remove；Moon在E1无visual/light consumer。
- Real Context像素与warm identity、installed package/types/API和local中文Sandcastle满足phase边界。

## Architecture findings

| ID      | Severity | Status | Owner role | Location                                                                                                                              | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Required disposition / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | -------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1-R001 | medium   | fixed  | execution  | `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js:423-439`；`SceneGISPlanarEnvironmentSpec.js:180-211`；Widget spec | 首次取得light authority没有触发request-render。`ControllerHost.update`在`Scene.render`的`shouldRender`判定之前调用；当request-render scene已经静止后才注册一个默认enabled Environment，或先以`enabled=false`注册再首次启用时，`firstUpdate`会把`scene.light`切到Environment light，但当前实现不调用`scene.requestRender()`。因此该轮`shouldRender`仍可为false，画面会继续显示旧light，直到相机/时间/其他无关mutation请求一帧。现有real-Context case从Scene初始`_renderRequested=true`开始，unit case还明确断言firstUpdate为零request，因而共同掩盖了该时序缺口。 | `firstUpdate`在全部验证成功、记录scene并取得authority后必须请求恰好一帧；稳定的后续`update`继续零request。增加真实ControllerHost/requestRenderMode时序证据：先让scene进入无待处理render的稳定状态，再覆盖late default-enabled registration或initially-disabled→enabled路径，证明首次host update在同一轮请求并发布Environment light，且下一稳定轮不重复request。同步修正unit expectation与ADR/Architecture/Guide中“首次authority acquisition也请求一帧”的契约；不得修改ControllerHost、Scene、Widget或扩大产品路径。 |

除E1-R001外，Architecture未发现Environment/World产品状态机、方向符号与robust normalization、conditional restore、
caller ownership、warm-resource、installed delivery、中文panel或文档边界finding。复核只要求上述窄修复；不重跑full suite、
E2E或无关terrain/styling矩阵。

## Execution response to E1-R001

- Product修复：`firstUpdate`全部validation成功、记录Scene并取得authority后恰好调用一次`scene.requestRender()`；任一validation
  failure仍零mutation/零request，后续stable `update`仍零request。
- Unit证据：首次authority request count=`1`，紧接reassert/update仍=`1`；active property mutation及normalized no-op计数同步更新。
- Real ControllerHost证据：existing Widget suite先让request-render Scene稳定到`_renderRequested=false`，再late
  `widget.addController(defaultEnabledEnvironment)`；首次host frame request count=`1`且`world._frameState.light`已是Environment
  light，下一stable frame仍=`1`。
- Contract修正：ADR-0033、Architecture、PlanarWorldGuide和phase handoff均明确首次authority acquisition、active mutation与
  re-enable请求一帧，stable update不请求。
- Scope保持：未修改ControllerHost/Scene/Widget Source/Surface；未增加测试入口，未运行broad suite/build/package/gallery。

## Architecture focused re-review

- `firstUpdate`保持connection、live World、registry、Scene/world identity与`SCENE3D`验证全部在状态写入之前；成功后严格按
  记录Scene、取得stable light authority、`scene.requestRender()`一次的顺序执行。任一validation failure仍不会写Scene、light
  或render request。
- Unit case锁定首次authority acquisition为一次request，紧接的stable `update`只reassert同一light且不追加request。
- Real ControllerHost case先让真实request-render Scene进入`_renderRequested=false`，late registration本身不请求；随后首次host
  frame在`shouldRender`判定前请求一帧，并在同一frame把Environment light发布到`world._frameState.light`。下一stable host
  frame不重复request。
- ADR-0033、Architecture与Guide对首次authority acquisition、active mutation、re-enable和stable update的描述已与实现一致。

E1-R001已关闭。Architecture未发现新的产品、测试、文档、ownership、delivery或scope finding；E1代码与自动化证据批准进入
项目负责人manual gate。manual gate通过前仍不得提交E1 checkpoint或进入E2。

## Exact changed paths

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarEnvironmentSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`
- `packages/sandcastle/gallery/scenegis-planar-environment/index.html`
- `packages/sandcastle/gallery/scenegis-planar-environment/main.js`
- `packages/sandcastle/gallery/scenegis-planar-environment/sandcastle.yaml`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0033-planar-environment-manual-celestial-light.md`
- `AgentDocs/planar-environment/**`（本plan/review/index/handoff writeback）

## Validation evidence

| Command / evidence                                                                                  | Result                                                                 |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarEnvironment"`                          | TOTAL 10 SUCCESS                                                       |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                                | TOTAL 22 SUCCESS                                                       |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget"`             | TOTAL 4 SUCCESS；含late registration request-render时序                |
| `npm run build`、`npm run build-release`                                                            | passed                                                                 |
| `npm run build-ts`、`npm run build-docs`、`npm run tsc`                                             | passed                                                                 |
| `node scripts/scenegis/verify-planar-packages.mjs`                                                  | passed；8/8 GLSL + 8/8 generated shader JS + S2/S3/E1 installed checks |
| `packages/sandcastle: npm run build-gallery-no-embedding`                                           | passed；308 examples                                                   |
| changed-scope ESLint/Prettier/Markdownlint、AgentDocs scoped checks、`git diff --check`             | passed                                                                 |
| `node scripts/scenegis/audit-upstream-patches.mjs`、exact status/generated/upstream ownership audit | passed；upstream-owned=0、generated=0、SGP=None                        |

`build-ts`输出既有upstream TSD-JSDoc warnings，但exit code=0，E1 declarations按字段验证通过。未运行full suite、E2E或
TerrainStyling regression：E1未修改Surface/shader/共享fixture，phase plan要求仅实际受影响时追加。

## Risks and manual gate

- ControllerHost callback failure仍可能在host内部留下预插入条目；Environment与World自身failure atomic，文档要求只注册合法构造对象。
- Authority是scene-wide，外部light写入会在下一active update被reassert；disable/remove会保留当前外部override。
- E1不显示Moon、不计算天文方向、不适配atmosphere/SkyBox。
- Architecture focused re-review已approved。项目负责人于`2026-08-13`验收中文Environment控制、真实公开terrain光照与
  平面相机交互并明确允许进入下一阶段；manual gate已关闭。E1可形成独立本地checkpoint，未push。
