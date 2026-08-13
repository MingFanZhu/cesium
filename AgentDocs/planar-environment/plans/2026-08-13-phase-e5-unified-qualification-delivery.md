# Phase Plan: E5 Unified Qualification and Delivery

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [planar-environment extension](2026-08-13-planar-environment-extension.md)
- Phase: `E5`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-13`
- Updated: `2026-08-14`
- Predecessor checkpoint: E4=`b9dd353e1d`
- Related review: implementation时新建
  `../reviews/2026-08-13-e5-unified-qualification-delivery.md`
- ADR: None expected；E5不新增产品或长期架构契约
- SGP: None expected；只复核既有`SGP-0003`和E1-E4 delivery

## Objective

E5不新增环境能力，而是将E1 manual light、E2 astronomical directions、E3 visible bodies与E4 atmosphere/SkyBox作为
一个可交付整体收口。阶段只补当前证据中真正缺失的dev/release本地浏览器公共路径，复跑已固化的installed-package、
build/types/docs与最小real-Context环境资格，统一Guide/UpgradeChecklist和AgentDocs交接，并完成整个
`planar-environment`扩展的review、ownership/generated审计和checkpoint。

## Non-goals

- 不新增或修改public Environment/SkyBox/World API、astronomy算法、light authority、renderer/shader、composition、
  native conflict、underground或resource ownership。
- 不重复E1-E4已通过的全部unit、projection、native Clock、four-frustum、candidate failure、Context replacement、
  sampler/terrain或大规模warm矩阵；只保留一个联合浏览器场景与现有Widget aggregate。
- 不新增第二个E2E文件、第二套qualification suite、Sandcastle、网络fixture、asset、performance threshold、CI workflow、
  tag、publish或push。
- 不把`ImageryLayer.dayAlpha/nightAlpha`、shadow、cloud、fog、weather或物理天空散射纳入本扩展。
- 不开始前序扩展遗留项审计或Viewer简化入口设计；它们在E5 checkpoint之后作为独立工作进行。

## Entry conditions and source facts

- Branch=`feature/planar-environment`，base/checkpoint=`b9dd353e1d`；工作树仅有项目负责人自有未跟踪
  `Test/地形.html`，Execution不得读取、修改、暂存或提交。
- E1-E4均有独立checkpoint、approved review与项目负责人manual gate；E4 package verifier已固化12/12 GLSL与
  12/12 generated shader modules以及E1-E4 public runtime/declarations/API。
- `SceneGISPlanarEnvironmentCesiumWidgetSpec.js`现有10个real-Context cases，已经联合覆盖astronomical direction、
  native Clock、visible bodies、atmosphere、local SkyBox、terrain/imagery、underground、native conflict、pick/depth和warm
  identity。E5不再新增同层产品case，除非E2E暴露确定产品缺陷。
- `Specs/e2e/scenegis-planar-release.spec.js`已有local blocked-network Viewer/world/filter/Material/picking/navigation/destroy
  场景，可在同一场景上增加Environment Controller与generated local cubemap，不需要新fixture或第二个browser入口。
- Windows上的literal `npm run test-e2e-release`仍有POSIX `release=true`脚本限制；允许使用仅当前PowerShell进程设置
  `release=true`后调用同一Playwright config/spec的等价命令，并如实记录。端口占用属于环境阻断，不得终止未获授权服务。

## Detailed design

### Dev/release joint browser qualification

- 只扩展现有`planar Viewer qualifies local imagery...`case。创建一个caller-owned
  `SceneGISPlanarEnvironment`并通过既有`viewer.addController`注册；使用显式project-origin、固定JulianDate和
  astronomical mode，开启Sun/Moon、atmosphere并使用六个generated local square canvases构造caller-owned
  `SceneGISPlanarSkyBox`。
- 保持公网完全阻断和现有local imagery/terrain/filter/Material路径。实际render后断言Environment registry/light authority、
  effective directions、visible bodies/atmosphere执行、single World identity、pick/depth/navigation和无外网请求；只做稳定状态/
  command/resource计数断言，不加入脆弱整屏截图。
- 至少一次host Clock或固定time mutation必须在同一stable light/body/atmosphere resources下改变effective direction，且不替换
  flat Surface tile/command/shader/VA或imagery binding/texture。该existing E2E没有terrain provider，因此真实terrain mesh identity
  继续由现有Widget aggregate证明；E5浏览器只做公共bundle路径联合闭环。
- Browser qualification必须设置`scene.rethrowRenderErrors=true`，避免Scene吞掉environment command的真实compile/draw错误。
- Destroy顺序固定：remove Environment controller、clear SkyBox reference、证明SkyBox仍live，再由caller在WebGL Context销毁前
  destroy SkyBox，最后destroy Viewer-owned World；验证Environment/World/Viewer均不拥有caller SkyBox。不得修改production
  ownership来迁就测试。

### Existing qualification and installed delivery

- 复跑现有Environment Widget aggregate `TOTAL 10 SUCCESS`，不增加用例；失败时只调查直接回归。
- 运行build/release/types/docs/tsc与现有package verifier。Verifier应继续要求12/12 GLSL、12/12 generated modules、
  bare ESM/CJS、E1-E4 runtime/declarations/API/private hiding；没有确定缺口时不修改脚本。
- Direct `Test/平面环境.html`已经通过最终E4中文视觉gate，E5不再修改页面或重复manual visual；只把项目负责人E1-E4验收结论
  作为扩展整体manual evidence写入交接。

### Documentation and extension closure

- 仅更新`PlanarWorldGuide.md`与`PlanarWorldUpgradeChecklist.md`的联合资格映射和最终升级检查，不重写ADR-0033..0036。
- 创建E5 review并更新extension/phase/review indexes。所有finding必须closed、accepted或有明确后继链接；不得用删除历史文档表示完成。
- Architecture review通过后，由Architecture把E5与整个extension标为`completed`并创建独立中文checkpoint；随后才开展前序大型
  扩展遗留项审计。

## Allowed paths

- `Specs/e2e/scenegis-planar-release.spec.js`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `AgentDocs/planar-environment/**`

Read-only validation targets:

- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Test/平面环境.html`

Conditional only after Architecture amendment:

- 若E2E或installed verifier暴露确定性缺口，Execution先回报证据；Architecture书面更新allowlist后才可修改对应现有Spec或
  `scripts/scenegis/verify-planar-packages.mjs`。任何product Source/Shader缺陷必须停止并重新确认，不得在E5直接修复。

## Forbidden paths

- `packages/engine/Source/**`、`packages/widgets/Source/**`、public API、Shader、renderer、Worker、Surface、terrain、imagery、
  Material、camera controller与native Scene/Widget/Viewer源码。
- `Test/地形.html`、`Test/平面环境.html`产品示例修改、legacy Sandcastle、package manifests、Playwright/server config、
  build/gulp/Vite core、workflow、`.scenegis/**`。
- Generated shader JS、index/declarations/SpecList/API HTML、`Build/**`、tarball、node_modules或任何发布产物。

## Validation boundary

Required:

1. `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget"`；确认现有aggregate仍为
   `TOTAL 10 SUCCESS`，不扩大suite。
2. Dev与release使用同一`Specs/e2e/scenegis-planar-release.spec.js`；运行前只读确认端口。Release在Windows可用
   process-local `release=true`等价命令。必须断言public network attempts=`0`。
3. `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`。
4. `node scripts/scenegis/verify-planar-packages.mjs`，记录12/12 GLSL、12/12 generated modules及E1-E4 installed contract。
5. Changed-scope ESLint/Prettier/Markdownlint、AgentDocs scoped checks、`git diff --check`。
6. `node scripts/scenegis/audit-upstream-patches.mjs`与exact status；expected E5 upstream-owned=`0`、SGP=None、
   generated status=`0`。

Not required:

- Full Jasmine suite、E1-E4所有unit/private suites、Sandcastle gallery、public-network success、performance timing case、
  unrelated terrain/content/styling suites或新的manual visual gate。
- Architecture重复执行已由Execution完成的browser/build矩阵；Architecture只review code/evidence与扩展状态。

## Completion criteria

- 同一blocked-network local browser场景在dev/release bundle下通过公开Viewer/World/Controller入口联合消费E1-E4能力，并保持
  pick/depth/navigation、resource/ownership/destroy与零公网请求。
- Existing real-Context Widget、build/release/types/docs/tsc与installed verifier全部通过；12+12 shader delivery和公共
  declarations/API保持。
- Guide、UpgradeChecklist、phase/extension/review indexes与实际结果一致；E1-E5没有open finding/discussion或无owner后续项。
- E5 upstream-owned=`0`、SGP=None、generated status=`0`；项目负责人自有`Test/地形.html`未读取、修改、暂存或提交。
- Architecture/code/release-evidence review通过后创建E5独立local checkpoint，把`planar-environment`标为`completed`；未push、
  未publish。

## Execution results and handoff

- Existing first blocked-network Viewer case已扩展为公开bundle联合路径：caller-created/registered Environment使用显式WGS84
  origin、固定native host Clock与astronomical mode，开启Sun/Moon、atmosphere并安装六个generated local square canvases的
  caller-owned SkyBox；原有imagery filter、Material、pick/depth、wheel/Home与network-zero断言均保留。
- E2E在首帧前启用`scene.rethrowRenderErrors`，验证World registry、stable light authority/effective directions和四类environment
  resources。时间变更保持light、body/atmosphere/SkyBox commands、flat Surface tile/command/shader/VA与imagery binding/texture
  identity；真实terrain mesh由existing Widget aggregate覆盖。Cleanup严格为remove Environment→clear reference→caller在live Context destroy SkyBox→destroy
  Viewer/World→caller destroy Material，并检查browser/page/console errors。
- Existing Environment Widget aggregate=`TOTAL 10 SUCCESS`；`build`、`build-release`、`build-ts`、`build-docs`、`tsc`均通过；
  installed verifier通过12/12 GLSL、12/12 generated modules及E1-E4 runtime/declarations/API/private hiding。
- Dev/release E2E最终通过：owner授权Architecture临时停止PID 23592 root service并确认8080/8081释放。Corrected focused headed
  dev命令1/1 passed（case 2.9s），Windows process-local `release=true`同一config/project/spec/grep命令1/1 passed（case 2.1s）；
  两者均排除timing case，并通过`externalAttempts=[]`和page/browser/console error=0断言。Architecture负责恢复root service。
- E5实际delivery为9个allowlist paths；upstream-owned=0、SGP=None、generated=0。用户自有未跟踪`Test/地形.html`未读取、
  修改、暂存或纳入delivery。未运行full suite、E1-E4 unit/private matrices、Sandcastle、public network或timing case。
- Architecture最终review与dev/release E2E gate均通过；root development service已恢复并验证，phase与extension随本地checkpoint完成。
- 首次authorized dev执行进入测试体后因新增test-evidence错误失败：flat world没有terrain provider，selected tile不存在
  `terrainEntry`，但E2E无条件读取`tile.terrainEntry.activeContent.mesh`。Architecture登记E5-R001并批准只删除不适用的mesh
  snapshot/assertion；产品、config和server均未修改，修正后重新执行同一focused dev/release case。
- E5-R001修正后的exact commands/results：
  - dev：`npm run test-e2e -- Specs/e2e/scenegis-planar-release.spec.js --grep "planar Viewer qualifies" --headed`，1 passed。
  - release：PowerShell process-local `release=true`后运行同一Playwright config/chromium/spec/grep/`--headed`，1 passed；未将
    POSIX-only npm script伪报为literal pass。
