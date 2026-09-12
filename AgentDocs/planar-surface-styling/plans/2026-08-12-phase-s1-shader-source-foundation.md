# Phase Plan: S1 Shader Source and Delivery Foundation

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [planar-surface-styling extension](2026-08-12-planar-surface-styling-extension.md)
- Phase: `S1`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-12`
- Updated: `2026-08-12`
- Related discussions: None
- Related reviews:
  [S1 shader source/delivery review](../reviews/2026-08-12-s1-shader-source-foundation.md)
- ADR: 新建 `Documentation/SceneGIS/Decisions/ADR-0030-scenegis-shader-source-and-delivery.md`
- SGP: None expected; upstream-owned diff 出现前必须停止并升级计划

## Objective

复用 Cesium 1.144 现有 GLSL-to-JS 构建链，在 `packages/engine/Source/Shaders/SceneGIS/**` 建立 SceneGIS-owned shader source root，把当前 SceneGIS 自有 planar Surface 与 planar Ground 的固定 shader 主体迁入 `.glsl`，同时保留 JS 对运行时 variant 的最小动态组合。该 phase 是行为等价的基础设施阶段，不增加 filter、terrain material 或环境效果。

## Non-goals

- 不增加或改变 `SceneGISPlanarImageryLayer` 公共属性。
- 不实现 height/slope/aspect/contour material，不改变 lighting 数学、normal 协议或 default pixels。
- 不修改 `scripts/build.js`、package manifest、`.gitignore`、生成的 Shader JS、engine index 或其他 upstream-owned file。
- 不迁移 Cesium upstream shader；不改 public planar Primitive 所复用的 Appearance/Primitive shader。
- 不抽象通用 shader DSL、include preprocessor、builtin registry 或运行时全局注册。

## Entry conditions

- Branch=`feature/planar-surface-styling`，base=`2086e5e42038dfdde23220dea8a33395445e6cd8`，working tree 在派工前仅含 Architecture 创建的本 extension AgentDocs。
- `planar-terrain-advanced` A7 checkpoint 与角色协议 checkpoint 已存在，predecessor extension completed。
- Architecture 已确认当前 shader/build/package 源码事实与 zero-upstream 方案。

## Current source facts

- `_SceneGISPlanarSurfaceShader.js` 有 unlit/geometric/smooth 三个固定 vertex source；fragment source 混合固定 main/lighting 与按 shown layer count 生成的 sampler、translation/scale、alpha declarations 和 composition statements。
- `_SceneGISPlanarGroundLineShader.js` 有 area vertex/fragment 与 line vertex/fragment 四个固定 source，并被 `SceneGISPlanarGroundPrimitive` 使用。
- `_SceneGISPlanarSurface.js` 以 layer count、lighting flag 与 normal mode 获取/缓存 ShaderProgram；本 phase 不改变 key 或 uniform map。
- `scripts/build.js#glslToJavaScript` 扫描 `packages/engine/Source/Shaders/**/*.glsl`，生成相邻 default-export JS；buildEngine 在 index/bundle 前调用转换。`packages/engine/.gitignore` 已忽略 `Source/Shaders/**/*.js`。
- 新增 `Source/Shaders/SceneGIS/**` 文件在 upstream baseline 中不存在，但超出现有默认 SceneGIS-owned root；因此本 phase 必须用 ADR-0030 与 Architecture ownership list 显式建立该根，不需要 SGP。
- Release/npm qualification 必须证明 source-generated imports 在 dev、release 与 installed tarball 都存在；只跑 source-level Spec 不足以关闭 phase。

## Detailed design

1. 在 `packages/engine/Source/Shaders/SceneGIS/PlanarSurface/` 与 `PlanarGround/` 下按职责放置 `.glsl`。文件 basename 全局唯一并使用 `SceneGIS` 前缀，避免 current flat shader export/index naming 冲突。
2. Surface 三个固定 vertex shader 各自成为 GLSL module。Fragment 采用一个固定 GLSL template/module 与明确、唯一的插入 token（或等价的窄组合 seam）；JS 只生成 per-layer declarations/composition 并替换该 token。不得让运行时读取文件或增加预处理器。
3. Ground area/line 的固定 vertex/fragment source 分别成为 GLSL module。现有 `_SceneGISPlanarGroundLineShader.js` 可以保留为 soft-private compatibility aggregator，也可以在调用方直接导入，但不得扩大 public surface；选择需保持最小 diff 和清晰职责。
4. `_SceneGISPlanarSurfaceShader.js` 保留 variant selection 与动态 layer composition。默认导出的现有字段/方法以及测试依赖的 soft-private shape 不应无理由改变。
5. 不提交 build 生成的相邻 `.js`；禁止编辑 engine `index.js/index.d.ts/Build/**/SpecList.js`。验证后清理/确认生成状态不进入 diff。
6. ADR-0030 记录 source root、现有 converter、generated JS、imports、index/export、dev/release/npm、ownership、升级检查点与替代方案。Architecture 增加精简的 ownership/build rule，并把该新根加入正式 owned-root 列表。
7. 本 phase 不创建 builtin、Material registration 或 side-effect import；shader strings 仍由显式模块 import 进入现有 ShaderProgram creation。

## Affected paths

### Allowed

- `packages/engine/Source/Shaders/SceneGIS/**`（只新增 `.glsl` source）
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundLineShader.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarGroundPrimitive.js`（仅当移除 aggregator import 确属最小方案）
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceShaderSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceSpec.js`（仅等价回归需要）
- 现有 planar Ground focused Spec（仅 shader source/import 等价证据需要；先定位精确文件）
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/Decisions/ADR-0030-scenegis-shader-source-and-delivery.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`（只记录 shader delivery 升级检查点）
- `AgentDocs/planar-surface-styling/**`

### Forbidden without Architecture re-approval

- `scripts/build.js`、`package.json`、`packages/engine/package.json`、任何 `.gitignore`
- `.scenegis/upstream-base.json`、`.scenegis/upstream-patches.json`
- `packages/engine/Source/Shaders/**` 中 SceneGIS 子目录以外的任何文件
- Surface/imagery/terrain public API、Worker tasks、mesh/normal、controller、World、Scene render loop
- 任何生成文件或 `Build/**`
- Sandcastle/E2E；S1 是基础设施等价阶段，不新增视觉功能

## Steps

1. Execution 复核派工时 branch/HEAD/status，并在 plan 记录任何并发差异；不得覆盖 Architecture AgentDocs。
2. 以 git/upstream base 证明所有新增 GLSL 不存在于 upstream；定位 Ground focused Specs 与 Surface imports/call path。
3. 新增 SceneGIS GLSL files，迁移固定 shader source；保留 Surface dynamic layer composition 和现有 variant/uniform contract。
4. 更新/补充 focused source assertions，证明 variant declarations、normal mode、ground depth clamp/gamma 等关键 shader 语义没有丢失。
5. 新建 ADR-0030，更新 Architecture ownership/build boundary 与 upgrade checklist。
6. 运行最小充分 Specs、dev/release/package/static/ownership checks，确认 generated JS 不在 status。
7. 回写本 phase 的实际路径、偏差、命令和结果；更新 extension roadmap/index；创建 S1 review request 文档或 handoff，并通知 Architecture ready-for-review。

## Validation

- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurfaceShader"`
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`
- 精确 Ground Primitive focused suite（Execution 定位后写回命令与 case count）
- 至少一个现有 real-Context terrain Widget/qualification focused suite，证明 generated shader imports、pixels、command/shader/resource warm identity 与 destroy balance不退化
- `npm run build`
- `npm run build-release`
- installed package/tarball focused check：证明 SceneGIS shader generated modules/imports 在 package 中可加载；优先扩展或复用 `scripts/scenegis/verify-planar-packages.mjs` 的最小无产品副作用检查，若该脚本需修改先回报 Architecture，因为它不在预批准路径
- changed-scope ESLint/Prettier；AgentDocs/ADR/Architecture scoped Prettier 与 Markdownlint
- `git diff --check`
- `node scripts/scenegis/audit-upstream-patches.mjs`
- `git status --short` 与 generated-file audit：任何相邻 Shader `.js`、index、Build 或 SpecList 不得进入交付 diff

不要求 S1 运行 full TypeScript/API docs 或 Sandcastle/E2E，因为没有公共 API/行为变化；若 package verifier 现有能力不足，Execution 必须先报告最小候选路径，不能自行扩大允许范围。

## Risks and dependencies

- Shader JS 是 build-time generated import target；直接运行未先生成的 source Spec 可能依赖仓库现有 generated state。验证必须从 clean/受控生成链证明，而不是依赖本机残留。
- Fragment template token 若可重复或与注释冲突，可能产生 silent malformed shader；focused Spec 必须证明恰好一次替换和全部 layer variants。
- GLSL basename 会进入 generated index/export；必须全局唯一并记录 soft-private/public-surface影响，不能把 shader module 宣布为公共 API。
- Release minification 会剥离普通注释；测试不得依赖 production shader comment 保留。
- Architecture 文档的新 owned root 是长期规则，ADR 必须包含官方升级 removal/recheck conditions。

## Completion criteria

- 所有批准的固定 Surface/Ground shader 主体位于独立 `.glsl`，JS 只保留必要动态 composition/selection。
- 当前 unlit/geometric/smooth、Ground area/line shader 行为、pixels、cache key、uniform 和资源生命周期等价。
- ADR-0030、Architecture ownership/build rule 与 upgrade checklist 一致。
- Dev、release、installed package 与 focused Specs 通过；generated files 未提交。
- Upstream-owned files=`0`、SGP=None，或出现偏差时已停止并经 Architecture 重新批准。
- Architecture/code review approved、所有 findings 关闭、需要的 manual gate 完成后，Architecture 创建中文本地 S1 checkpoint；此前不得进入 S2。

## Deviations and results

- Implementation status：`completed`；Architecture review=`approved`，无actionable finding；本地checkpoint=`04ac138b37295f328f3542f143b2f6b738a7e021`，未push。
- 实际新增8个source：
  - Planar Surface：`SceneGISPlanarSurfaceUnlitVS.glsl`、
    `SceneGISPlanarSurfaceGeometricLitVS.glsl`、`SceneGISPlanarSurfaceSmoothLitVS.glsl`、
    `SceneGISPlanarSurfaceFS.glsl`。
  - Planar Ground：`SceneGISPlanarGroundAreaVS.glsl`、`SceneGISPlanarGroundAreaFS.glsl`、
    `SceneGISPlanarGroundLineVS.glsl`、`SceneGISPlanarGroundLineFS.glsl`。
- Dynamic seam：Surface fragment只有一个`SCENEGIS_PLANAR_SURFACE_DYNAMIC_LAYERS` token；JS替换为
  per-layer uniforms与`sceneGISComposeLayers`。lighting/normal只由前置`SCENEGIS_LIGHTING`/
  `SCENEGIS_SMOOTH_NORMALS` compile-time defines选择；cache key、uniform map与runtime ownership不变。
- Ground保留原soft-private aggregator shape，只把四个字段改为显式generated module imports；public Primitive未改。
- 正式文档：新增ADR-0030，Architecture加入SceneGIS shader owned root/build rule，upgrade checklist加入
  converter/minifier/ignore/import/tar复核项。
- Focused Specs：SurfaceShader=`5/5`；Surface aggregate（含SurfaceShader）=`35/35`；Ground Primitive=`7/7`；
  A7 real-Context terrain qualification=`1/1`。
- Delivery：`npm run build`通过；`npm run build-release`通过；现有installed package verifier exit 0，真实打包安装后
  ESM/CJS加载通过；engine `npm pack . --dry-run`明确列出8个`.glsl`与8个generated `.js` tar entries。
- Static/audit：changed-scope ESLint、Prettier、Markdownlint、`git diff --check`通过；8个basename全局唯一；
  upstream audit通过，current delivery upstream-owned entries=`0`、generated status=`0`、SGP=None。
- 已解决偏差：首次dev build在engine/widgets完成后因根`index.js.map`短暂`EBUSY`失败，后续同命令完整通过；
  SurfaceShader首轮仍按旧内嵌source断言inactive branch不存在，改为验证compile-time defines后`5/5`通过；
  一次从repo root运行`npm pack packages/engine --dry-run`被npm误解为Git地址，改在engine目录运行
  `npm pack . --dry-run`后得到正确tar entry证据。以上均未扩大代码或允许路径。
- 未运行：full TypeScript/API docs、Sandcastle/E2E，符合S1无public API/视觉行为变化的明确非要求；package verifier
  复用当前既有declarations/docs做private/public边界检查。
- 剩余风险：inactive lighting branch存在于单一原始GLSL template并由WebGL preprocessor裁剪；real-Context已证明
  unlit/geometric/smooth实际compile/pixel。官方升级仍需按ADR-0030复核converter/minifier与package files。
- Architecture独立复核：Surface aggregate=`35/35`、Ground Primitive=`7/7`、A7 real-Context qualification=`1/1`；
  `npm run build-release`、installed package verifier、engine tar inventory、official upstream audit、case-sensitive
  shader basename audit与`git diff --check`通过。项目负责人manual gate不需要：S1没有新增视觉行为或公共API。
