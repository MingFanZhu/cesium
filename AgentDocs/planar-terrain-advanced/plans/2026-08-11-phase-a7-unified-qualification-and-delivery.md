# 阶段计划：A7 平面高级地形统一资格与交付

## 元数据

- Plan type：`phase`
- Status：`completed`
- Owner role：`execution`
- Architecture review：`confirmed`
- Architecture reviewer：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- Created：`2026-08-11`
- Updated：`2026-08-12`
- Parent plan：
  [总体计划：SceneGIS 平面高级地形](2026-08-10-planar-terrain-advanced-extension.md)
- Entry checkpoint：`0009fbd414e231a5f3d079aa9dc03159da63cad1`
- Related decisions：ADR-0024～ADR-0029；A7不改变既有架构契约，默认不新增ADR
- Related review：
  [A7 implementation/release-evidence review](../reviews/2026-08-11-a7-unified-qualification-and-delivery.md)（`approved`；
  A7-R001/R002 fixed，项目负责人人工验收通过）
- Related patch：None planned；预计 upstream-owned files=`0`、A7 SGP=`0`

## 阶段目标

以一个边界明确、可重复的本地真实Context资格场景，联合验证A1～A6已经分别完成的导航、模式、净空、Worker、
Heightmap、Quantized-mesh、smooth lighting、LOD与资源生命周期，并完成release build、installed package、升级文档和
项目负责人真实浏览器/GPU人工验收。A7默认只增加资格证据和交付文档，不重新设计或重写产品运行时。

## 进入阶段时的源码事实

- A1～A6均已完成Architecture review与独立checkpoint；A6 checkpoint为`0009fbd414`。
- `SceneGISPlanarReleaseQualificationSpec`是P8 flat/imagery release资格矩阵，包含120-frame warm、imagery churn、
  depth replay和生命周期。A7不得把terrain高级矩阵倒灌到该已完成阶段，也不重复其大规模计数。
- `SceneGISPlanarTerrainCesiumWidgetSpec`已有两个真实Context case，分别闭合Heightmap与Quantized provider → Worker →
  runtime → imagery/query/depth/lighting/销毁；A7缺少的是两条格式在同一交付场景中的替换、收敛和有限warm/churn闭环。
- `SceneGISPlanarTerrainWorkerTasksSpec`已经通过真实`TaskProcessor("SceneGISPlanarTerrainWorker")`验证development Worker、
  transferable、LERC与Quantized任务；A4/A5各自的error、stale、upsample与mesh语义仍由原focused Specs负责。
- `scripts/scenegis/verify-planar-packages.mjs`已经锁定engine/widgets/root公共inventory=`26/2/28`，并检查Worker source、
  development、release和tar路径、ESM/CJS、private declaration/API边界及broken-entry。A7只复跑，除非审计发现现有
  脚本遗漏已批准交付事实，否则不修改它。
- 唯一`scenegis-planar-terrain` Sandcastle已经提供EPSG:3857公开OSM+LERC、稳定`DirectionalLight`、Lighting、
  Mountain、Surface/Underground、Surface clearance和Home。公开网络不能成为自动化hard gate；metadata中旧的
  “geometric lighting”措辞需要按A6当前smooth/geometric分流事实纠正。
- 当前没有专门的advanced-terrain Playwright。既有真实input Specs、真实Context terrain Specs与项目负责人手工页面已
  覆盖本阶段目标；A7不为形式完整再复制一条E2E或增加workflow。

## 设计决定

### 1. 一条统一资格场景，而不是重复完整矩阵

新增`SceneGISPlanarTerrainAdvancedQualificationSpec`，使用本地确定性数据与真实WebGL Context。资格场景允许由少量
helper分段组织，但新增direct `it`默认保持一个，避免把A1～A6已覆盖的边界重新枚举。

该场景必须依次闭合：

1. local Heightmap/LERC provider经真实terrain Worker进入World，达到当前视图`tilesLoaded`；
2. surface模式下执行代表性pan/rotate/wheel或复用真实input入口，确认锚点、endpoint clearance与公开Z=0 pick职责未混淆；
3. lighting off/on后进入`unlit`/`smooth`，保持single terrain+imagery command、finite pixel/depth与command/VA资源身份；
4. 切到underground并在地形两侧使用已批准中键orbit语义，不能Home或执行surface clearance；
5. caller-owned provider替换为local Quantized-mesh，旧generation与GPU资源收敛，新内容继续使用同一Worker、surface、
   imagery、query、LOD与smooth normal契约；
6. 在Heightmap和Quantized稳定状态各执行有限warm frames，并在若干camera/LOD/lighting/mode变更后重新收敛；
7. 销毁Widget/World后，position/normal/index buffers、VA、shader、request/task/content计数按既有owner语义平衡，provider不被
   隐式销毁。

资格场景不得通过调用private promotion或伪造resident height绕过正常render门禁。可以读取private debug counter和command
identity作为测试证据，但不得把它们提升为公共API。

### 2. 性能门禁只检查收敛，不设置跨机器阈值

- 每种terrain格式采用`30`个稳定warm frames；camera/LOD/lighting/mode/provider churn采用`3`个有界round。
- Hard gate是selected/submitted与`tilesLoaded`可收敛、warm command/VA/shader与task/resource counter不持续增长、正常销毁平衡。
- 可以记录同机warm frame的粗粒度median/P95用于后续比较，但不得设置固定毫秒、FPS或“比基线快N%”阈值，也不得因单次
  噪声扩展为浏览器/driver矩阵。
- 已完成P8的120-frame/60-depth/多生命周期矩阵不在A7重复；A7只增加terrain-specific联合覆盖。

### 3. 自动化与人工验收分工

- 自动化只使用本地LERC、Heightmap、Quantized、imagery fixture，不访问公网。
- Quantized-mesh无需为Sandcastle寻找不稳定公网服务；它由Worker、provider、real Context、统一资格与package证据验收。
- 既有terrain Sandcastle继续作为唯一人工页面。只做必要的说明/状态文字修正，不增加terrain provider picker、不复制案例、
  不加入无界动画。
- Architecture review批准自动化交付后，由项目负责人在真实浏览器/GPU检查：公开LERC/imagery与Credit、console、Mountain与
  LOD移动、Lighting前后、surface三种锚点、clearance、underground上下侧与双向穿越、Home保持模式。
- 公网服务不可用只记录为external/best-effort；本地确定性自动化仍须全部通过。

### 4. 缺陷处理边界

A7若发现A1～A6契约内的真实回归，可以在本阶段作窄修复并补直接Spec，但必须在review中单列finding、影响路径和runtime
delta。不得借资格阶段增加新公共API、新terrain格式、新gesture、free-look、continuous collision、材质/阴影或通用normal
stitching。若修复需要大量Cesium upstream改动，则暂停并通知项目负责人；其他小型必要seam仍须遵守SGP纪律。

## 修改范围

### 默认允许

- 新增：
  `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainAdvancedQualificationSpec.js`
- 最小更新：
  `packages/sandcastle/gallery/scenegis-planar-terrain/{index.html,main.js,sandcastle.yaml}`
- 交付文档：
  `Documentation/SceneGIS/PlanarWorldGuide.md`、
  `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- 本扩展的phase、review、index与handoff文档。

### 仅在直接证据证明遗漏时允许

- `scripts/scenegis/verify-planar-packages.mjs`：只补已经批准的public inventory、Worker/package文件或private边界，不能新增
  发布体系。
- A1～A6现有focused Spec：只补统一资格暴露出的直接回归证据，不重排历史suite。
- SceneGIS-owned product runtime：只修复统一资格暴露的既有契约缺陷；必须在review中明确列出，默认预期为`0`。

### 禁止范围

- 修改upstream-owned product/build/test文件，除非资格缺陷没有SceneGIS-owned修复路径；任何例外必须先登记SGP。
- 新增GitHub workflow、第二个terrain Sandcastle、第二个terrain Worker、独立Shader/build seam或公网自动化fixture。
- 重跑全部Cesium Specs、建立浏览器/driver/FPS矩阵，或重复P8/C10已完成的大规模release qualification。
- 修改A1～A6公共API、terrain provider/data ownership、canonical tiling、public Z=0 pick、surface/underground模式或
  Worker task协议。

## Source-to-spec / delivery mapping

| 交付面                                          | 主要证据                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Heightmap/LERC → Worker → surface               | 新统一qualification + existing Worker/terrain Widget focused suites                             |
| Quantized → Worker → irregular mesh/surface     | 新统一qualification + existing Quantized provider/data/Worker/terrain Widget suites             |
| pan/rotate/wheel、surface/underground/clearance | 新统一qualification代表性闭环 + existing controller 47-case与terrain-navigation真实Context      |
| smooth/geometric/unlit、LOD与imagery            | 新统一qualification warm/churn + existing Worker/Shader/Surface/terrain Widget evidence         |
| task/GPU/provider lifecycle                     | 新统一qualification replacement/destroy + existing terrain runtime rollback/stale focused Specs |
| dev/release Worker与installed packages          | `build`/`build-release` + existing package smoke                                                |
| 公网页面与主观LOD/地下画面                      | 唯一terrain Sandcastle + 项目负责人人工验收                                                     |

## 执行步骤

1. 以本plan checkpoint为implementation base，记录`git rev-parse HEAD`并确认clean worktree。
2. 复用现有local fixture/helper建立一个真实Context资格case；不得复制大段已有Spec实现。
3. 锁定两种terrain格式、Worker、provider replacement、navigation/lighting/LOD、warm/churn与destroy闭环。
4. 仅记录有解释力的advisory timing和counter signature；若没有repeatable blocker，不修改product runtime。
5. 修正既有terrain Sandcastle的A6后说明，并完成一次本地页面装配检查；不把公网成功写成自动化通过。
6. 运行下列最小充分验证，回写精确case counts、环境、偏差和ownership。
7. 创建pending A7 review后停下；不得commit、push或自行把extension标为completed。

## 最小充分验证

### Focused Specs

- 新`SceneGIS/Widget/SceneGISPlanarTerrainAdvancedQualification`。
- `SceneGIS/Core/SceneGISPlanarTerrainWorkerTasks`。
- `SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget`。
- `SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget`。
- `SceneGIS/Scene/SceneGISPlanarCameraController`。
- 仅当qualification暴露surface/shader回归时再运行对应Surface/Shader suite；不默认重复全部A1～A6套件。

### Build、package与静态检查

- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run build-docs`
- `npm run tsc`
- `node scripts/scenegis/verify-planar-packages.mjs`
- `packages/sandcastle` gallery no-embedding discovery与`npm run build-sandcastle -- --no-embeddings`
- changed-scope ESLint、JS/Markdown Prettier、Markdownlint、`git diff --check`
- `node scripts/scenegis/audit-upstream-patches.mjs`

标准embedding若仍因Hugging Face metadata网络失败，只记录一次external failure，不重试；不增加workflow或网络规避代码。

### 人工验收

Architecture/code/release-evidence review批准后，项目负责人在现有`scenegis-planar-terrain`页面完成最终验收。人工结论是
A7和整个extension的completion gate；Execution不得以自动化或自己的截图代替。

## 退出条件

- 统一资格场景通过并证明Heightmap与Quantized共享当前Worker/surface/normal/navigation/lifecycle契约。
- 有界warm/churn稳定，无持续task/GPU/command分配增长；所有owned资源销毁平衡。
- build/release/types/docs/package/Worker路径闭环；generated files不进入status。
- terrain Sandcastle说明与当前smooth lighting、navigation/clearance边界一致；公网best-effort与本地hard gate分开记录。
- upstream-owned files与SGP均为`0`，或每个例外均有合法SGP/marker/manifest-only记录。
- Architecture review批准，项目负责人真实浏览器/GPU人工验收通过，A7与extension文档转为`completed`并形成独立中文提交。

## Execution handoff

- 允许开始A7实现与资格验证。
- 默认product runtime delta=`0`，不新增public API、ADR、SGP、workflow、E2E或第二个示例。
- 若发现窄契约缺陷，先在A7 review request中单列事实和拟修复范围；可以继续SceneGIS-owned窄修复，但大量Cesium
  upstream修改必须暂停通知项目负责人。
- 完成后回写phase results、精确命令/计数、timing性质、manual gate、ownership与generated状态，创建pending review并
  通知Architecture Agent；不commit、不push。

## 偏差与结果

### 实际影响路径与 source-to-spec mapping

| 类型                     | 路径                                                                                       | 结果                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 新增统一资格             | `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainAdvancedQualificationSpec.js`  | 唯一 direct case；本地 LERC URL provider 经真实 `decodeLerc`/Heightmap mesh Worker，随后同一 World 替换为本地 Quantized-mesh provider |
| focused test correction  | `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js` | 将固定 8 render frames 改为有界 `pollToPromise(world.tilesLoaded)`；A6 Worker 异步完成不再被错误等同于固定帧数                        |
| A7-R001 product fix      | `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js`           | 移除camera-facing normal翻转；smooth保持topology-up，geometric fallback归一到planar `+Z` hemisphere                                   |
| A7-R001 focused evidence | existing SurfaceShader/terrain Widget Specs                                                | shader直接锁定两种稳定方向；真实Context锁定同一坡面点上下观察像素、command/shader/resource identity                                   |
| A7-R002 product fix      | private terrain Worker tasks + SurfaceShader                                               | meter-metric world-axis normal生成；smooth shader只用`czm_viewRotation`作world-to-eye rotation                                        |
| A7-R002 focused evidence | existing Worker/Shader/terrain Widget/A7 qualification Specs                               | Heightmap/Quantized analytic EPSG:3857 normal、连贯lit neighborhood与warm/depth/resource回归                                          |
| Sandcastle metadata      | `packages/sandcastle/gallery/scenegis-planar-terrain/sandcastle.yaml`                      | 把旧 geometric-only 描述修正为 smooth terrain lighting + geometric-normal flat fallback                                               |
| durable docs             | `Documentation/SceneGIS/PlanarWorldGuide.md`、`PlanarWorldUpgradeChecklist.md`             | 记录 A7 资格协议、timing 非硬阈值和升级复核入口                                                                                       |
| AgentDocs                | 本 phase、extension/README/index 与 A7 pending review                                      | 实际结果、验证、ownership、人工门禁和 review handoff                                                                                  |

Product runtime delta为SceneGIS-owned terrain Worker normal metric与private shader transform窄修复；public API、Worker task kind/transfer shape、mesh positions、terrain runtime、navigation/controller均未修改。A7初始新增direct unique cases=`1`；R001/R002没有新增`it`，扩展既有Worker/Shader/terrain Widget/qualification cases。R002复核unique focused cases=`45/45`（Worker `8`、Surface aggregate `34`且含Shader `4`、terrain Widget `2`、qualification `1`）。

### 实际资格设计与偏差

- 统一 case 使用完整 EPSG:3857 extent、Level-0 actual cover和本地 257×257 LERC fixture。LERC 经公开 URL provider 和真实 TaskProcessor Worker decode，Heightmap/Quantized 都经现有 mesh Worker进入同一 Surface；同一个 World/provider generation 原子替换为仓库本地 quantized-mesh tile。
- 两种格式各执行 `30` 个 warm frames；每帧锁定 `tilesLoaded`、相同 command/VA/shader references、terrain debug counters及Surface buffer/VA/texture/command/shader allocation不增长。三轮 churn分别覆盖left pan、middle rotate和wheel + lighting切换，并在每轮后重新收敛。
- 资格 case同时锁定smooth/unlit pixel变化、本地imagery binding、resident height、terrain/window/depth与public Z=0 pick职责、surface clearance、underground双向middle-orbit、provider replacement后旧VA退出与最终buffer/index/VA reference balance。
- 与初始计划“LOD联合闭合”的布局偏差：没有把257×257 Level-0 LERC复制为四份Level-1 fallback mesh。初始诊断在通用5秒poll窗口内不能完成且显著放大资格成本，最终case保持单根actual cover并通过三轮camera convergence验证selection/readiness；multi-level LOD、four-child gate与upsample继续由既有terrain runtime/Widget focused suites负责。这不改变产品契约或验收结论。
- A7暴露一个test-only可靠性缺口：既有terrain-navigation real-Context fixture在A6异步Worker后仍假定固定8帧ready，连续两次得到`tilesLoaded=false`和undefined pick。修正为仓库既有有界readiness poll后稳定`1/1`；product runtime delta仍为0。
- Chrome 151 / Windows 10同机advisory measurement：30-frame Heightmap median `0.400 ms`、P95 `0.600 ms`；Quantized median `0.300 ms`、P95 `0.500 ms`。计时分辨率约0.1 ms，只作本机诊断，不作为自动hard gate；最终qualification runner case time在复跑中为`0.402～0.736 s`。

### 验证矩阵

| 命令                                                                                          | 结果            | 备注                                                                                           |
| --------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainAdvancedQualification"`  | Exit 0, `1/1`   | 大extent lit isolated-outlier `<=8`；warm/replacement/navigation/lifecycle继续通过             |
| `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTerrainWorkerTasks"`              | Exit 0, `8/8`   | 真实TaskProcessor transfer；Heightmap/Quantized大extent analytic world normal与input ownership |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"`           | Exit 0, `2/2`   | Heightmap/Quantized real Context regression                                                    |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidget"` | Exit 0, `1/1`   | 修正前固定8帧连续`0/1`，readiness correction后通过                                             |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"`               | Exit 0, `47/47` | A1-A3 navigation/clearance/crossing regression                                                 |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurfaceShader"`                  | Exit 0, `4/4`   | smooth不翻转；geometric显式归一到`czm_normal * +Z` hemisphere                                  |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarSurface"`                        | Exit 0, `34/34` | aggregate含Shader `4`；unlit/imagery/single command/depth replay与Surface资源回归              |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarTerrainCesiumWidget"`           | Exit 0, `2/2`   | 同一坡面点上下观察stable lit pixel；command/VA/shader/counter identity与destroy不退化          |
| `npm run build`                                                                               | Exit 0          | development build                                                                              |
| `npm run build-release`                                                                       | Exit 0          | release build                                                                                  |
| `npm run build-ts`                                                                            | Exit 0          | 仓库既有 TSD-JSDoc warnings；无A7新增warning                                                   |
| `npm run build-docs`                                                                          | Exit 0          | API docs生成                                                                                   |
| `npm run tsc`                                                                                 | Exit 0          | TypeScript validation                                                                          |
| `node scripts/scenegis/verify-planar-packages.mjs`                                            | Exit 0          | 26/2/28 inventory、Worker source/dev/release/tar、ESM/CJS/private/broken-entry通过             |
| `npm run build-gallery-no-embedding`（`packages/sandcastle`）                                 | Exit 0          | no-embedding，307 examples                                                                     |
| `npm run build-sandcastle -- --no-embeddings`                                                 | Exit 0          | Vite build；仅既有chunk/plugin timing warnings                                                 |
| scoped ESLint/Prettier/Markdownlint                                                           | Exit 0          | changed JS/YAML/Markdown                                                                       |
| `git diff --check`                                                                            | Exit 0          | 仅line-ending notices                                                                          |
| `node scripts/scenegis/audit-upstream-patches.mjs`                                            | Exit 0          | current delivery upstream-owned entries=0、generated status=0                                  |

### Ownership、生成与剩余风险

- 相对 implementation base `a0b412a7d2234d4247601c3e0e798ddd91f294c8`，产品源码改动=`2`：SceneGIS-owned private terrain Worker tasks与Surface shader builder；其余变更为SceneGIS Specs、唯一terrain Sandcastle metadata、durable docs与AgentDocs。
- Upstream-owned files=`0`；A7 SGP=`0`；`.scenegis/upstream-patches.json`、SGP-0001/0002与marker均未修改；新增`SCENEGIS_PATCH` marker=`0`。
- Public inventory保持engine/widgets/root `26/2/28`；无新增declaration/API。生成文件status=`0`。
- 未运行standard embeddings，也未访问公网。公开OSM/LERC成功、Credit、console、Mountain/LOD、Lighting、surface三手势/clearance、underground上下侧/双向穿越和Home保持mode仍由项目负责人在现有Sandcastle完成人工门禁。
- Architecture/code/release-evidence review曾于`2026-08-12`依据自动化证据批准。Reviewer独立复跑A7
  qualification `1/1`、terrain-navigation Widget `1/1`、`git diff --check`与official upstream audit；Level-0
  unified case与既有multi-level/four-child/upsample focused suites的证据拆分获接受。
- 随后项目负责人人工验收稳定复现A7-R001：Lighting开启时地下视角出现大面积黑暗碎块，关闭Lighting恢复。
  Architecture确认当前lit shader的camera-facing `faceforward`会在相机越过地表时翻转topology-up normal，与Globe
  terrain稳定outward normal语义不一致。Review已恢复为`changes-requested`；允许在A7内作SceneGIS-owned窄修复，
  补一个focused地表上下侧光照证据并同步ADR-0029/durable docs，不改变Worker normal协议、mesh、public API、
  World/Camera或build/upstream边界。
- Execution已移除camera-facing翻转：smooth直接使用Worker topology-up normal，geometric fallback只在derivative winding
  落入planar `-Z` hemisphere时显式翻转。Shader/Surface `34/34`、terrain Widget `2/2`与qualification `1/1`通过；
  同一非平坦地形点从上下两侧观察的lit RGBA neighborhood在每分量`<=8`容差内一致，且command/shader/terrain counters不变。
- A7-R001 focused修复经Architecture独立复跑Shader `4/4`、terrain Widget `2/2`、`git diff --check`与official
  upstream audit后确认关闭，review恢复为`approved`。
- 项目负责人再次人工复测在公开EPSG:3857/LERC Surface视角发现Lighting全图密集噪点，关闭Lighting后恢复；
  Architecture登记A7-R002并把review恢复为`changes-requested`。初步源码事实显示Worker在unit-local XY与meter Z上
  计算并oct量化normal，shader再经大尺度非均匀model transform解释，现有小extent fixtures未覆盖该精度边界。
- Execution须先以deterministic大extent Heightmap/Quantized fixture确认或推翻该根因；确认后统一到真实平面米制
  normal坐标空间并补一个大extent real-Context光照证据。若根因不成立则停止并回报，不得用禁用smooth lighting或
  增加噪声掩盖逻辑绕过。A7与extension保持`active`，不得commit、push或标记completed。
- Execution已确认并修复A7-R002：两个Worker topology在40075016.68557849米extent上输出fixed world-axis oct normal，
  decoded normal与analytic direction dot均`>0.9999`；shader用`czm_viewRotation`避免model inverse scale。Worker `8/8`、
  Surface `34/34`、terrain Widget `2/2`、qualification `1/1`通过；large-extent lit neighborhood outlier count`<=8`，
  warm command/VA/shader、imagery/depth与资源生命周期不退化。
- Architecture独立复跑Worker `8/8`、Surface/Shader `34/34`、terrain Widget `2/2`、A7 qualification `1/1`，并运行
  `npm run build`、changed-scope ESLint/Prettier/Markdownlint、`git diff --check`与official upstream audit，全部通过。
  项目负责人随后在公开EPSG:3857/LERC Sandcastle目视确认Lighting正确。A7-R002关闭，phase与extension完成。
