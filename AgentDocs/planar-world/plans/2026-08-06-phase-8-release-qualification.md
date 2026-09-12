# 第八阶段计划：性能、生命周期与本地交付验收

## 元数据

- 计划类型（Plan type）：`phase`
- 状态（Status）：`completed`
- Parent plan：
  [SceneGIS 平面世界总体计划](2026-08-05-planar-world-extension.md)
- Phase：`P8-release-qualification`
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-06`
- 更新日期（Updated）：`2026-08-07`
- 相关讨论（Related discussions）：P7 完成后的 P8 范围讨论；项目负责人明确不增加
  GitHub Actions workflow，也不建设正式发布流水线
- 相关评审（Related reviews）：
  [P8 release qualification review](../reviews/2026-08-06-p8-release-qualification.md)（`approved`）
- ADR：复核 ADR-0001 至 ADR-0006；P8 默认不新建 ADR，只有长期契约发生变化时才暂停并
  交回 Architecture Agent 裁决
- SGP：审计既有 `SGP-0001`、`SGP-0002`；P8 预期 upstream-owned product files=`0`、
  新增 SGP=`0`

## 目标

以 P7 checkpoint `b9f3fca6c11252a77dd558ac69b172acffab7b78` 为功能基线，对当前
Planar World 首版能力进行本地、可重复的资格验收与必要硬化，而不是继续增加功能：

1. 建立具有多个可见瓦片、零/单/双本地图层和相机移动的确定性性能 fixture，补足当前
   单瓦片 warm-frame 证据；
2. 用结构化资源计数、缓存上界和重复构造/销毁 soak 验证 CPU/GPU/请求/DOM/controller
   生命周期不会持续增长；
3. 在相同机器和浏览器的 release build 上记录 P7 与 P8 的 CPU frame-time 基线，识别明显
   热点或回归，但不制造跨机器的绝对 FPS 门槛；
4. 增加可本地运行的 upstream patch/SGP 审计和私有 Cesium 依赖清单，为以后同步官方版本
   提供可执行检查点；
5. 验证 `cesium`、`@cesium/engine`、`@cesium/widgets` 的本地打包产物确实包含 SceneGIS
   public API、types 与 API docs，同时继续隐藏 private roles；
6. 增加不依赖 OSM 或其他远程服务的 Planar World E2E，并分别覆盖开发构建与 release
   构建；
7. 编写首版使用与升级维护文档，明确支持矩阵、已知限制、资源 ownership、credits 和后续
   terrain/underground 边界；
8. 完成 Architecture/code review 后形成独立的本地 Git checkpoint，不 push、不打 tag、
   不发布 npm。

P8 是当前 `planar-world` extension 的收尾阶段。P8 完成表示“当前首版范围已通过本地交付
验收”，不表示 terrain、地下模式、touch 或任意 CRS 数据生态已经实现。

## 非目标

- 不实现 terrain、terrain provider、terrain mesh、camera collision、地下导航或地下
  picking policy。
- 不实现 touch、pinch、惯性、flight、reprojection、非米制坐标、非正方形 extent 或
  planar base-layer picker。
- 不修改 P7 已由项目负责人接受的 wheel、boundary、pitch 与显式 skybox 行为，除非 P8
  fixture 证明存在确定性 correctness regression。
- 不以“性能优化”为名改变 public API、瓦片 XYZ 规则、SSE 语义、imagery fallback、
  picking contract、layer ownership 或 controller input mapping。
- 不承诺跨机器、跨浏览器或跨 GPU 可比较的绝对 FPS；不把 `performance.memory` 或一次
  Chrome profile 当成精确泄漏证明。
- 不使用 OSM、Hugging Face metadata、Cesium ion 或其他公网服务作为 P8 自动化门禁。
- 不执行 Cesium upstream upgrade、merge/rebase，也不修改版本号、lockfile、package
  dependency 或发布 metadata。
- 不新增 `.github/workflows/**`，不修改现有 workflow，也不建设自动发布流水线。
- 不修改 upstream-owned product/test/build files，不扩大 `SGP-0001`、`SGP-0002`，不新增
  SGP。若实际需要任一项，Execution Agent 必须停止并请求 Architecture decision。
- 不把 private debug counter 提升为 public API；资格测试所需 instrumentation 保持
  SceneGIS-private，并且不得进入生成声明或 API HTML。
- 不为了得到更漂亮的数字进行大规模 quadtree、imagery cache、renderer 或 Viewer 重写。
  若基线显示需要架构级重构，应记录 finding 并拆分后续阶段。

## 进入条件

- P1 至 P7 都是 `completed`，相关 review 均为 `approved`。
- 项目负责人已经完成 P7 browser/GPU 人工复测，并接受当前 PC 导航、边界、倾斜视角、
  imagery 与 skybox 行为。
- 当前分支为 `feature/planar-world`；P7 checkpoint 为
  `b9f3fca6c11252a77dd558ac69b172acffab7b78`，建立本计划前工作树 clean。
- terrain 与地下模式继续延期，不能作为 P8 blocker，也不能由 Execution Agent顺手实现。
- 项目负责人于 `2026-08-06` 确认 P8 可以开始，并明确不增加 workflow；本计划只要求本地
  可重复命令和证据。
- Architecture Agent 已完成当前源码、测试、构建、package 和 SGP 入口发现，并将本计划
  设为 `active/confirmed`。
- Execution Agent 开始前必须重新读取根、AgentDocs、engine/widgets/Sandcastle 相关
  `AGENTS.md`，以及 `Architecture.md`、`DevelopmentGuide.md`、总体计划、ADR-0001 至
  ADR-0006、P3/P5/P6/P7 plan/review 和本计划。
- Execution Agent 必须优先使用 code graph 重新确认当前调用关系；图谱仍不能发现
  SceneGIS symbol 时，记录该事实后才回退到 `rg` 和直接读取。
- 第一项执行动作必须是在没有产品源码改动的 P7 基线上采集 baseline。不得先优化再反推
  基线，也不得把 P8 新测试的首次结果冒充 P7 历史数据。

## 当前源码事实

### Renderer、quadtree 与 imagery

1. `_SceneGISPlanarSurface` 当前拥有 shared quad buffer、vertex array、按 shown-layer count
   缓存的 shader、transparent texture、render state、per-tile command 和 render-pass command
   reference。normal render 完成选择后缓存精确 command references，pick/depth pass 只重提，
   不重新选择瓦片。
2. `_SceneGISPlanarSurface._debug`、`_SceneGISPlanarQuadtree._debug` 和
   `_SceneGISPlanarImagery._debug` 已记录 tile、command、buffer、vertex array、shader、
   request、texture、binding、submission、eviction 和 destroy 等累计计数。这些是 private
   implementation evidence，不是 public API。
3. P3 warm Spec 当前主要使用一个 selected tile，证明相同下一帧没有新的 persistent
   tile/command/buffer/shader；P5/P6 还证明单个局部 imagery fixture 的 request、texture、
   binding、shader 和 command identity 稳定，但尚未形成多瓦片、多图层、长序列资格 fixture。
4. `_SceneGISPlanarQuadtree.selectTiles` 当前每次 normal render 建立 traversal stack 和 child
   address objects；`trim` 建立 candidates array 并排序。`_SceneGISPlanarTileImagery` 在祖先
   fallback 查找时也会创建临时 address objects。这些是待测热点，不等于已经确认的缺陷。
5. quadtree resident cache 使用 `Map`、protected selected keys 和确定性 LRU；trim 后允许
   `tileCacheSize` 之外继续保留当前受保护瓦片。验收上界必须表达为 cache budget 加当前
   protected set，不能错误要求绝对小于 `tileCacheSize`。
6. imagery runtime 以 per-layer cache 管理 request/texture/refcount，支持 stale-generation、
   cancel、READY ancestor fallback、hide/remove 和 exactly-once release；provider 本身由调用方
   ownership，不随 layer/world 自动销毁。
7. surface、imagery 和 navigation 已有 single-Context、防止 late request revive、cache
   eviction、depth replay、Viewer rollback 与 exactly-once destroy 的聚焦 Specs，但没有重复
   多周期的 World/Widget/Viewer soak。

### 构建、发布与 E2E

1. 根 `package.json` 已提供 `build`、`build-release`、`build-ts`、`build-docs`、`tsc`、
   `release`、`test-e2e` 和 `test-e2e-release`。P8 不通过修改该 upstream-owned manifest
   增加快捷 script。
2. `buildRelease` 会构建 engine/widgets 和根 Cesium unminified/minified bundle；`release`
   还会运行 types 与 docs。生成文件必须只用于验证并保持不进入 git status。
3. 根 package 通过 ESM `Source/Cesium.js` 和 CJS `index.cjs` 暴露 API；engine/widgets
   workspace package 通过各自 `index.js`/`index.d.ts` 暴露 API。
4. 现有 `.github/actions/verify-package/script.sh` 会 smoke CJS/ESM 和安装后的 tarball，但没有
   SceneGIS public/private assertion；它属于 upstream-owned 路径，P8 不修改它。
5. `Specs/e2e` 使用固定 `960x540` viewport，可按 `release` 环境选择
   `Build/CesiumUnminified/Cesium.js` 或 `Build/Cesium/Cesium.js`。当前没有
   `Specs/e2e/scenegis-*.spec.js`。
6. 两个现有 Planar Sandcastle 使用公开 OSM，是人工演示而非确定性性能、生命周期或 E2E
   fixture。标准 embedding build 可能因 Hugging Face metadata 网络失败；既有
   no-embedding build 是可重复的本地替代证据。

### Upstream patch 与升级敏感点

1. `.scenegis/upstream-base.json` 固定 Cesium `1.144`、commit
   `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
2. `SGP-0001` 为 high-risk patch，覆盖 `Scene.js` 与 `CesiumWidget.js` 的 primary-world
   lifecycle slot；`SGP-0002` 为 high-risk patch，覆盖 `Viewer.js` 的 planar integration。
3. 当前没有自动检查“相对 upstream base 的所有 upstream-owned diff 都已登记”、marker
   pair/ID、manifest path、SceneGIS-owned product marker、生成文件边界的 SceneGIS 脚本。
4. Planar renderer 依赖 Cesium private/current renderer semantics，包括 `Buffer`、
   `VertexArray`、`ShaderProgram.fromCache`、`DrawCommand`、`RenderState.fromCache`、`Texture`、
   `ContextLimits`、`FrameState.passes`、command list、credit 和 frustum near/far fitting。
5. navigation 依赖 current `Camera`/four-frustum behavior、`CameraEventAggregator` 及其 P4 已
   记录的 private update seam；widgets 依赖当前 HomeButton/Knockout/createCommand 和
   Viewer construction/destroy 顺序。这些依赖需要维护清单和对应回归入口，但 P8 不复制或
   公共封装全部上游实现。

源码行号、当前 debug 字段集合和 runner case 数都不是长期契约。Execution Agent 若发现上述
事实已经不成立，必须先在本计划“偏差与结果”中写明，再由 Architecture Agent 判断是更新
计划还是暂停阶段。

## 详细设计

### 1. 资格 fixture 与证据分层

P8 使用三类证据，不能互相冒充：

1. **确定性 hard gate**：SceneGIS Specs/E2E 中的 exact counter delta、identity、cache bound、
   lifecycle ordering、pixel/depth/pick 和 public API assertion；失败即 P8 失败。
2. **同机 comparative gate**：P7 与 P8 release build 在相同 browser/GPU/viewport/fixture 下的
   CPU submission timing。超过警戒线必须调查，但不得因跨机器噪声写成普通 CI assertion。
3. **人工 profile evidence**：Chrome Performance/Memory 等工具用于解释热点；只保存环境、
   操作、摘要和结论，不向 AgentDocs 提交 trace、heap snapshot 或大型日志。

所有 fixture 必须满足：

- 不访问公网，不依赖 OSM、ion、embedding model 或 wall-clock animation；
- viewport、device scale、Camera、frustum、time、extent、maximum level、SSE、cache size、
  layer order、alpha 和 provider response 固定；
- imagery 使用同步或可控异步的本地 synthetic provider，并能精确控制 ready、failure、late
  settle 和 cancellation；
- benchmark 使用 `build-release` 产物；correctness Specs 可以使用开发构建；
- 至少一个 surface fixture 在稳定态具有不少于 `16` 个 selected/submitted tiles，且
  Execution Agent 把实际 deterministic visited/culled/selected/submitted/resident 数冻结为
  Spec evidence，不能继续只用 Level 0 单瓦片代表性能；
- 不新增 public benchmark API。若需要汇总 private counters，可增加 SceneGIS-private test
  helper 或 read-only debug snapshot，但必须验证其不出现在 generated declarations/API HTML。

### 2. 性能场景与量化门槛

| 场景               | 固定操作                                                                                     | Hard gate                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bare warm          | 多瓦片相机固定，完成首次 render 后连续 `120` 个 normal frames                                | visited/culled/selected/submitted 每帧保持 fixture 预期；created tile/command/buffer/VA/shader 与 resident count 全部零 delta                                           |
| Imagery warm       | 两个本地 shown layers，所有 desired tile READY 后连续 `120` frames                           | request/texture/binding/shader/command/tile 零 delta；layer order、alpha、pixel 与 credit 保持；`tilesLoaded===true`                                                    |
| Camera/cache churn | 固定 keyframes 覆盖 zoom levels、四边和四角，完整序列重复至少 `5` 次                         | 每帧 resident `<= tileCacheSize + protectedTileCount`；request/texture/cache ref 有界；回到 warm keyframe 后状态收敛，不存在逐轮单调增长                                |
| Pick/depth replay  | 一次 normal render 后重复至少 `60` 次 pick/depth pass                                        | 只允许对应 replay submission counter 增加；selection/SSE/tile/request/texture/binding/command/buffer/VA/shader 和 protection/LRU 均零 delta；command refs identity 不变 |
| Layer churn        | add/show/hide/remove 两个 local layers，包含 pending、READY、terminal failure 和 late settle | 每个 binding/ref/texture exactly once release；stale result 不 revive；provider 不被 world 销毁；最终 cache 回到预期基线                                                |

CPU timing 使用以下统一 protocol：

1. release build、固定 `960x540` viewport 和同一 browser/GPU；关闭 DevTools recording 之外的
   干扰，并记录 OS、Node、browser、GPU、devicePixelRatio 和 commit；
2. 每个 timing scenario 先 warm up `120` frames，再采样 `300` frames，独立重复 `5` 次；
3. 记录每次 median、P95 和 max CPU frame/submission time，再汇总 run medians；不得把 GPU
   completion time、display refresh FPS 与 CPU submission time混为一项；
4. 在产品代码修改前先采集 P7 checkpoint；P8 candidate 使用完全相同 protocol；
5. candidate 的 aggregate median 或 P95 相对 P7 恶化超过 `15%` 视为 investigation warning。
   该警戒线不直接写入跨机器自动化 test，但必须解释为 fixture variance、测量噪声或真实
   regression；无法解释时不得通过 P8 review；
6. 只有在至少 `4/5` 次同机 paired runs 方向一致，或 hard counter 明确消除了 persistent
   allocation/resource churn 时，才可在文档中宣称性能改善。

`performance.memory`、forced GC 或 heap snapshot 仅在当前 Chromium 环境可用时作为补充。
P8 的泄漏 hard gate 由 live object/resource/cache counters、exact destroy 和重复 soak 收敛
给出，不以不可移植 heap 数值替代。

### 3. 生命周期 soak

生命周期验收分为 lightweight owner-cycle 与 real WebGL cycle：

- 使用可控 Scene/Context fixture 重复至少 `50` 次 World/surface/imagery 构造、frame、layer
  churn 和 destroy，覆盖 destroy-before-first-frame、warm destroy、pending request late
  resolve/reject、upload failure、cache eviction 与 double destroy；
- 使用真实 WebGL `CesiumWidget`/planar `Viewer` 分别重复至少 `8` 次 construct-render-destroy。
  数量保持在浏览器 context limit 内，不用一次创建大量并发 Context；
- 每轮结束必须证明 shared buffer、VA、shader、transparent texture、imagery texture、tile
  binding 和 registered controller exact once release；destroyed world 不再接受 frame/pick；
- Viewer 每轮 controller host count 恢复构造前 baseline，planar controller 在 world/Scene
  destroy 前 disconnect，owned DOM child 被移除，legacy input 状态不泄漏到下一轮；
- provider ownership 保持 P5 contract：world/layer 释放 cache/request/texture，但不主动 destroy
  caller-owned provider；
- late async completion 不创建新 texture、不重新加入 cache、不 raise 到已销毁 owner；
- cycle 结束后的 live counters、resident/cache entries、pending requests 和 DOM/controller
  baseline 不得逐轮单调增长。

若 real WebGL context 本身在当前 runner 中产生已知浏览器级缓存或延迟释放，Execution Agent
必须把 SceneGIS-owned exact counters 与浏览器现象分开记录；不得简单把浏览器进程 RSS 当成
SceneGIS 泄漏，也不得忽略 SceneGIS 自有计数的不平衡。

### 4. 允许的热点修复

Execution Agent 先建立 baseline 和 failing/diagnostic evidence，再修改产品源码。允许的 P8
优化只包括保持 P1-P7 observable contract 的局部改动，例如：

- 复用 traversal stack、selected/result array 或内部 address scratch，减少 normal-frame
  transient object；
- 避免没有 eviction pressure 时建立和排序 trim candidates；
- 复用 imagery ancestor lookup scratch 或其他不跨 async boundary 的临时对象；
- 补充仅测试可见的 live/high-water counters，证明 cache/resource 收敛。

每项产品修改必须具备：修改前基线、source-to-spec mapping、正确性回归、资源生命周期证据和
同机 timing/counter 结果。以下任一情况必须暂停而不是继续优化：

- 改变 traversal order、visible tile selection、SSE、LRU/protection、fallback ancestor、
  request scheduling 或 rendered pixels；
- 需要新的 public option/API、Worker、Shader protocol、dependency 或 upstream hook；
- 需要修改 upstream-owned file、existing build/e2e config、package manifest 或 SGP；
- 性能收益只能通过删除 correctness/lifecycle checks 或放宽 cache/resource bound 得到；
- 需要跨多个既有 subsystem 的重构。此类工作记录为 P8 finding，由 Architecture Agent决定
  是否另建后续 phase。

P8 没有“必须修改产品源码”的指标。若当前实现满足 hard gates 且 timing 没有无法解释的回归，
只增加资格证据、审计和文档也可以完成本阶段。

### 5. Upstream/SGP 自动审计

新增 SceneGIS-owned `scripts/scenegis/` 本地脚本，至少提供一个可直接由 `node` 执行的
upstream patch audit。脚本不得修改仓库，应在失败时非零退出，并输出简洁、可定位的结果：

1. 读取并校验 `.scenegis/upstream-base.json` 与 `.scenegis/upstream-patches.json` schema、
   base commit 可解析、patch ID 唯一、status/risk/marker mode 合法；
2. 以 upstream base tree 判定 upstream-owned path，而不是只按当前目录名猜测；
3. 相对 base 的每个 upstream-owned modified/deleted/renamed path 都必须由一个有效 SGP
   登记；manifest path 必须确实存在于 base，并与当前 diff 一致；
4. `paired` 文件内每个 `SCENEGIS_PATCH_BEGIN <id>` 与对应 END 数量、顺序和 ID 配对，且 ID
   必须声明该文件；无法注释的 diff 才允许 `manifest-only`；
5. SceneGIS-owned product/test/script path 不得包含 patch marker。Architecture/AgentDocs 中的
   规范语法示例不作为违规 product marker；
6. manifest 的 decision、tests、removal condition 等必填字段存在，引用路径可解析；
7. 已知 generated paths、Build output 和 SpecList 不得进入 staged/working-tree delivery diff；
8. 输出 upstream-owned files、SGP IDs、marker counts、SceneGIS-owned additions 和 generated
   status 摘要，供 review 直接引用。

P8 还应新增一份维护者升级清单，列出：private symbol/semantic dependency、SceneGIS wrapper、
风险等级、对应 Specs、官方升级后要复核的行为。至少覆盖 renderer command/pass/context、
Camera/four-frustum/input、Viewer construction/destroy、SGP-0001 和 SGP-0002。清单是升级准备，
不是本阶段实际升级报告。

### 6. Package smoke 与 public/private 边界

P8 使用 SceneGIS-owned script 或独立测试验证本地 release/package 产物；不修改 root/workspace
`package.json` 或现有 verify-package action：

- 运行 build/release/type/doc generators 后，在临时目录生成并检查 root、engine、widgets
  tarballs；临时安装不得改动仓库 lockfile/node_modules ownership，也不得留下 tracked 文件；
- root ESM 与 CJS（当前 package contract 支持处）、engine ESM、widgets ESM 都能导入各自
  SceneGIS public symbols；安装 tarball 后重复代表性 import，防止只在源码 workspace 可见；
- engine public surface 至少包括 `SceneGISWorld`、Planar extent/coordinate system/tiling
  scheme/world/controller、imagery provider/URL provider/layer/collection；
- widgets public surface 至少包括 Planar HomeButton/ViewModel，root `cesium` 同时暴露 engine
  与 widgets public API；生成声明包含 Viewer `world`/`planarCameraController` contract；
- `_SceneGISPlanarSurface`、quadtree、tile、tile imagery、imagery runtime、private camera helper
  以及 private debug types 不得出现在 public exports、`.d.ts` 或 API HTML；
- package smoke 不要求实际 WebGL Context，但至少构造并验证不需要 DOM/WebGL 的 Core 和
  provider/layer API；浏览器构造由 Specs/E2E 负责；
- 生成物只用于验证，结束时 generated status 必须为 `0`。

### 7. 本地 E2E

新增 `Specs/e2e/scenegis-*.spec.js`，复用现有固定 viewport 与 dev/release bundle 选择。E2E
应通过 `cesium.html` 或经源码确认的等价本地入口组装一个小型 Planar Viewer：

- 使用 deterministic local imagery，不加载 OSM 或其他公网资源；
- 断言 `scene.world` identity、`scene.globe===undefined`、planar controller registration、
  `tilesLoaded`、代表性 center/outside pixel、bounded mathematical pick 和 depth pick；
- 发送真实 wheel/mouse event，至少证明 wheel forward 改变 Camera range 的方向正确，Home
  能恢复；不重复 P4/P7 全部手势矩阵；
- destroy Viewer 后断言 controller/world lifecycle 完成且 page 没有新增 error；
- 同一 Spec 分别用开发 bundle 和 release bundle 执行。截图可以作为补充，但 GPU-sensitive
  screenshot 不应取代数值、pixel 和 lifecycle assertion。

P8 不新增面向用户的第三个 Sandcastle。若 Execution Agent 需要交互 profile 页面，可以在
SceneGIS-owned test fixture 中实现，或提出 development-only Sandcastle 偏差；后者必须先由
Architecture Agent确认，避免把性能工具混入公共 gallery。

### 8. 文档交付

新增或完善以下 SceneGIS-owned 文档：

1. Planar World 使用指南：创建 extent/coordinate system/world，`CesiumWidget` 与 Viewer
   入口、imagery layer/provider 组装、PC navigation、home、mathematical/depth picking、destroy
   ownership、credits、部署和最小完整示例；
2. 支持矩阵与限制：严格正方形、米制、SCENE3D-only、一个 Level 0、无 reprojection、无通用
   picker、当前无 terrain/underground/touch/inertia；Earth skybox 是应用选择而非默认；
3. 性能与调参说明：`maximumScreenSpaceError`、`tileCacheSize`、layer 数与 draw/texture 成本，
   只记录已经实测的行为，不提供未经验证的万能配置；
4. 升级维护清单：SGP、private dependency、build/types/docs/package/E2E 回归步骤；
5. troubleshooting：CRS/tiling scheme identity mismatch、extent 外 bounded pick、remote imagery
   CORS/SLA、第二 Context/world reuse、destroyed object 和 Viewer option conflict。

通用且长期有效的新规则才提升到 `Architecture.md` 或 `DevelopmentGuide.md`。单机 benchmark
数字、P8 命令结果和临时 finding 只写入本 plan/review，不污染长期规范。

## 影响路径

### 允许修改

- `packages/engine/Source/SceneGIS/**`，仅限测量证明必要的局部优化或 private instrumentation
- `packages/engine/Specs/SceneGIS/**`
- `packages/widgets/Source/SceneGIS/**`，仅限测量或 lifecycle finding 直接需要；默认不改
- `packages/widgets/Specs/SceneGIS/**`
- `Specs/e2e/scenegis-*.spec.js` 以及仅供该 SceneGIS E2E 使用的 SceneGIS-owned fixture
- `scripts/scenegis/**`
- `Documentation/SceneGIS/**`
- `AgentDocs/planar-world/**`

### 禁止修改

- upstream-owned product files：`packages/engine/Source/Scene/Scene.js`、
  `packages/engine/Source/Widget/CesiumWidget.js`、
  `packages/widgets/Source/Viewer/Viewer.js` 以及 upstream base 中的其他既有文件
- `.scenegis/upstream-base.json`、`.scenegis/upstream-patches.json` 和既有 SGP hunks；P8 对其
  只读审计
- root/workspace `package.json`、lockfile、gulp/build/release/e2e config 和现有
  `.github/actions/**`
- `.github/workflows/**`
- `packages/sandcastle/gallery/**`，除非 Architecture Agent针对必要的 development-only
  profile fixture 另行批准；既有 OSM 示例不作为 P8 自动化 fixture
- generated files：`packages/engine/index.js`、`packages/engine/index.d.ts`、
  `packages/engine/Build/**`、`packages/engine/Specs/SpecList.js`、`Source/Cesium.js`、
  `Source/Cesium.d.ts`、`Specs/SpecList.js`、`Build/**`
- terrain、underground、touch/inertia、reprojection、public performance/debug API 和 P9 内容

新增其他路径、修改任一禁止路径或引入 dependency 时必须先暂停并交回 Architecture Agent。

## 实施步骤

1. Execution Agent 在 P7 product baseline 上建立环境记录并采集 multi-tile bare/imagery steady
   与 motion CPU timing；把 protocol 和原始摘要回写本计划，不提交大型 trace。
2. 补齐 deterministic multi-tile、multi-layer、cache churn、depth replay hard-gate Specs；先证明
   当前结构计数和 cache bound，再决定是否需要 product optimization。
3. 运行 profile，按本计划“允许的热点修复”实施最小修改。每项优化独立记录 before/after、
   correctness 和 lifecycle evidence；没有可证明收益时不修改产品源码。
4. 增加 lightweight `50` cycles 与 real WebGL Widget/Viewer `8` cycles lifecycle soak，覆盖
   pending/late imagery 和异常回滚。
5. 新增只读 upstream/SGP audit script，并针对 clean manifest、unregistered upstream diff、
   marker mismatch、SceneGIS-owned marker 和 generated delivery path 建立 self-test/fixture。
6. 新增 release/package smoke，在临时目录验证 root/engine/widgets 的 installed tarball public
   imports、types/docs 与 private absence。
7. 新增 deterministic local Planar E2E，串行执行 dev 与 release bundle；不得依赖公网。
8. 编写 Planar World 使用指南和升级维护清单；只把稳定通用规则提升到架构/开发规范。
9. 运行完整 P8 focused、P1-P7 regression、build/type/docs/package/E2E、format 和 ownership
   矩阵；记录 exact commands、case counts、timing protocol、结果和已知环境限制。
10. 创建 `AgentDocs/planar-world/reviews/2026-08-06-p8-release-qualification.md` pending review
    request，更新 plan/index/handoff 后停止。Execution Agent 不提交、不 push、不把 extension
    标记 completed，也不开始新阶段。
11. Architecture Agent执行 code/release evidence review；finding 修复后再次 review。只有 review
    为 `approved`，才能将 P8 与 extension 标记 `completed` 并创建中文本地 checkpoint。

## 验证

### P8 focused hard gates

- multi-tile bare warm、two-layer local imagery warm、camera/cache churn、pick/depth replay 与 layer
  churn 全部满足“性能场景与量化门槛”。
- lightweight `50` cycles 与 real WebGL Widget/Viewer `8` cycles soak 全部收敛；资源、请求、
  controller、DOM 和 ownership assertion 通过。
- upstream/SGP audit 正常仓库 Exit 0；每一种故意破坏 fixture 都应非零退出并指出对应路径/ID。
- release/package smoke 对源码 workspace 与 installed tarballs 都通过；public symbols/types/docs
  可见，private symbols/types/docs 不可见。
- SceneGIS E2E 在 dev 与 release bundle 均通过，且无公网请求依赖。
- P7/P8 timing protocol 完整；超过 `15%` 的 warning 均有可复核处置，不存在无法解释的明显
  regression。

### 回归矩阵

Execution Agent 必须按当前 runner 实际入口记录精确命令、SUCCESS/SKIPPED 数和退出码，至少
覆盖：

- P3 tile/quadtree/surface 与 WebGL aggregate；
- P4 private camera helper、controller、World 和 navigation Widget；
- P5 provider/layer/collection/private imagery/imagery Widget；
- P6 HomeButton/ViewModel/Viewer；
- P7 controller、World 与 navigation Widget；
- P1 world/CesiumWidget、upstream `Scene`、`Globe`、`CesiumWidget`、`Viewer`、Camera/input
  相关代表性回归；
- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run build-docs`
- `npm run tsc`
- `npm run test-e2e` 与 release bundle 的等价现有命令；Windows shell 若不能直接执行 package
  中的 POSIX-style env assignment，记录并使用语义等价的 PowerShell/Node invocation
- local package pack/install smoke
- no-embedding Sandcastle gallery/build；标准 embedding 若仍因外部 metadata 失败，必须如实
  记录，不得声明通过
- scoped ESLint、Prettier、Markdownlint 和 `git diff --check`

只运行必要的上游 aggregate；不得为了数字好看重复累计 overlapping substring cases。direct
unique P8 cases 与包含既有 Specs 的 aggregate 必须分开报告。

### Ownership 与生成物

- 相对 P7 checkpoint 的 upstream-owned product/test/build diff 必须为 `0`。
- P8 新增 SGP=`0`；既有 `SGP-0001`、`SGP-0002` manifest 与 hunks unchanged。
- SceneGIS-owned product/test/script 新增 patch marker=`0`。
- generated/Build/SpecList status=`0`；临时 package/timing/profile artifacts 不进入 git。
- `scripts/scenegis` audit 与 Architecture 人工抽查结论一致。

## 风险与依赖

- browser CPU timing、GPU scheduling、JIT、thermal state 和后台进程会造成噪声。P8 用 fixed
  fixture、warmup、五次重复和结构计数降低误判，但不声称得到通用硬件 benchmark。
- 当前 debug counter 只覆盖显式 persistent object/resource，不自动捕获全部短生命周期 JS
  allocation；Chrome profile 用于发现此类热点，但正确性门禁仍依赖 deterministic tests。
- 多 Context soak 可能触发浏览器自身的 context limit 或延迟释放。必须串行、限制 real WebGL
  cycle 数，并将浏览器现象与 SceneGIS exact resource counter 区分。
- renderer、Camera 与 Viewer private semantics 是官方升级风险。P8 可以建立清单和审计，不能
  保证未来 Cesium 版本无需修改。
- installed tarball smoke 依赖本地 npm 行为和当前 package layout；应使用临时目录并避免
  外部 registry。若 npm 仍尝试联网，应先确认所有 workspace tarball/dependency 都被本地
  提供，再记录真正的外部 blocker。
- OSM availability、CORS 和 tile policy 继续只属于人工示例风险；P8 local fixture 不能证明
  公网 SLA。
- 标准 Sandcastle embedding 的外部 metadata failure 与既有 TSD-JSDoc warnings 必须如实
  区分为 existing/external signal，不得掩盖新的 SceneGIS warning。

## 完成条件

- 五个性能 hard-gate 场景、两个层级的 lifecycle soak、dev/release E2E 和 local package smoke
  全部通过。
- P7 与 P8 release timing 使用相同 protocol；没有无法解释的 `>15%` regression warning。
- 每项实际热点修改都有 before/after 和 correctness/lifecycle evidence；没有架构级重构混入
  P8。
- Planar World 使用指南、支持矩阵、调参说明、troubleshooting 与升级依赖清单完整。
- upstream/SGP audit Exit 0，并能正确拒绝未登记 diff、marker mismatch 和 generated delivery。
- upstream-owned files=`0`、P8 SGP=`0`、existing manifest/hunks unchanged、generated status=`0`。
- P1-P7 聚焦回归、build/release/types/docs/tsc、format/lint 和 ownership 矩阵通过，所有外部或
  既有 warning 单独记录。
- P8 review 为 `approved`；phase plan、extension plan、索引与 review handoff 更新为
  `completed`。
- Architecture Agent使用中文提交信息创建独立本地 P8 checkpoint；不 push、不打 tag、不
  发布 npm。
- `planar-world` extension 以“首版范围完成”结束。terrain、地下模式、touch/inertia 和其他
  新能力只能在新的 Architecture discussion/extension 或后续明确阶段中启动。

## 偏差与结果

### 实际设计与影响路径

- P7 baseline 的 deterministic hard gates 全部满足，profile 未显示需要修改 runtime 的证据；
  P8 因此没有修改任何 product source，也没有改变 P1-P7 observable contract。
- 新增 engine qualification Spec，覆盖 16-tile bare、双本地图层、120 warm frames、五轮
  camera/cache churn、60 个不同 window position 的 depth replay、terminal/pending/ready layer
  churn、late settlement、50 次 lightweight lifecycle 与 8 次真实 `CesiumWidget` lifecycle。
- 新增 widgets qualification Spec，串行执行 8 次真实 planar `Viewer` lifecycle，并验证
  `ControllerHost`、aggregator、world 和 DOM 回到 baseline。
- 新增完全本地的 dev/release Playwright E2E；本地 canvas imagery 验证 composition、pixel、
  mathematical/depth pick、真实 wheel、Home 和 destroy，网络 route 明确拒绝非 localhost 请求。
- 新增只读 upstream/SGP audit 及 13 个 destructive/success fixture；新增 installed-tarball package
  smoke。package smoke 在仓库外 OS 临时目录 pack/assemble，通过 bare ESM/CJS package entry 解析
  engine/widgets/root，并用 broken-entry fixture 证明公开入口损坏会失败；不运行 lifecycle script、
  不联网、不改 lockfile/node_modules ownership。
- 新增 `PlanarWorldGuide.md` 与 `PlanarWorldUpgradeChecklist.md`，并只把稳定的资格规则提升到
  `Architecture.md`/`DevelopmentGuide.md`。

最终新增或修改的实现路径：

- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarReleaseQualificationSpec.js`
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarReleaseQualificationSpec.js`
- `Specs/e2e/scenegis-planar-release.spec.js`
- `scripts/scenegis/audit-upstream-patches.mjs`
- `scripts/scenegis/audit-upstream-patches.spec.mjs`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Architecture.md`、`DevelopmentGuide.md` 与本 extension 的 AgentDocs。

### Baseline、candidate 与 timing

- 固定环境：Windows 10 runner、Node `v24.18.0`、npm `11.16.0`、headed Chrome
  `151.0.7922.34`、DPR `1`、drawing buffer `960x540`、ANGLE OpenGL 4.5、NVIDIA RTX 3060 Ti。
- 协议：release bundle；每个 scenario 每轮 `120` warmup + `300` samples，共 `5` 轮；每个 sample
  固定批量执行 `20` renders 后归一化为单帧；fixture 为 `16 selected / 16 submitted`，imagery 还
  必须 `tilesLoaded=true`，每轮采样前后 persistent counters 相同。
- P7 product baseline（每项为 `median/P95/max ms`）：
  - bare：`[0.25/0.50/2.05, 0.30/0.35/0.45, 0.30/0.35/0.50, 0.30/0.35/0.45, 0.30/0.35/0.40]`；
  - 双层 imagery：`[0.25/0.35/0.75, 0.30/0.35/0.45, 0.30/0.35/0.45, 0.30/0.35/0.45, 0.30/0.35/0.45]`；
  - motion：`[0.30/0.35/0.40, 0.25/0.35/0.45, 0.30/0.35/0.50, 0.30/0.35/0.40, 0.30/0.35/0.40]`。
- P8 candidate（每项为 `median/P95/max ms`）：
  - bare：`[0.25/0.40/2.20, 0.25/0.35/0.60, 0.25/0.35/0.45, 0.25/0.35/0.45, 0.30/0.35/0.40]`；
  - 双层 imagery：`[0.25/0.35/0.45, 0.25/0.35/0.40, 0.30/0.45/1.10, 0.30/0.35/0.40, 0.30/0.35/0.40]`；
  - motion：`[0.30/0.35/0.50, 0.30/0.35/0.45, 0.30/0.35/0.40, 0.30/0.35/0.40, 0.30/0.40/0.40]`。
- 五轮 P95 中位数 baseline/candidate 三个 scenario 均为 `0.35/0.35 ms`。调查期间一次相同
  product imagery 重复测量出现 `0.55 ms` P95 中位数 warning；紧邻的相同环境重复回到
  `0.35 ms`，且 readiness、selection/submission 和 persistent counters 全部相同，因此记录为
  不可重复的同机调度/JIT 噪声，而非产品回归。P7 与 P8 product tree 相同，candidate 只增加
  tests/scripts/docs；没有进行 product optimization，也没有提交 trace/heap snapshot 或大型日志。

### Source-to-spec 与 direct unique cases

| Responsibility                                   | Direct evidence                                       | Cases |
| ------------------------------------------------ | ----------------------------------------------------- | ----: |
| Engine hard gates、50/8 lifecycle                | `SceneGISPlanarReleaseQualificationSpec.js` (engine)  |     8 |
| Viewer 8-cycle lifecycle                         | `SceneGISPlanarReleaseQualificationSpec.js` (widgets) |     1 |
| Dev/release local browser flow 与 release timing | `scenegis-planar-release.spec.js`                     |     2 |
| Audit success/destructive fixtures               | `audit-upstream-patches.spec.mjs`                     |    13 |

P8 direct unique runner cases 为 `24`。Audit 的 13 个独立 Node cases 覆盖 paired success、
manifest-only rename/delete success，以及 unregistered/unmarked/foreign/stale/owned-marker/generated
failure paths。
P3-P7 substring aggregates 只作为回归，不计入 P8 direct unique。

### 验证矩阵

- P8 engine qualification：`8/8 SUCCESS`；P8 widgets qualification：`1/1 SUCCESS`；全体
  SceneGIS aggregate：`225/225 SUCCESS`。
- P3/P4：Tile `10`、Quadtree `11`、Surface `22`、private Camera aggregate `38`、controller
  `30`、World `14`、navigation Widget `4`，全部 SUCCESS。
- P5：imagery aggregate `23`、imagery Widget `9`、Layer aggregate `7`、URL provider `3`，全部
  SUCCESS。aggregate 中包含 substring overlap，未计入 direct unique。
- P6：Home aggregate `7`、planar Viewer `18`，全部 SUCCESS。
- P1：`SceneGISWorld 2`、world/CesiumWidget integration `16`，全部 SUCCESS。
- upstream representative：CameraEventAggregator `16`、ScreenSpaceCameraController `73`、
  CesiumWidget aggregate `107`、Globe aggregate `127`、Viewer aggregate `102`、Scene aggregate
  `264`、Camera aggregate `241`、Request `39`、Resource `119`、Texture `161`，全部 SUCCESS。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`：Exit `0`。
  `build-ts`/`tsc` 保留既有 TSD-JSDoc warning，未出现 SceneGIS 新 warning。
- dev headed E2E：`1 passed / 1 release-only skipped`；release headed E2E：`2/2 passed`。
  标准 headless Chromium 对新增 E2E 与 upstream `viewer.spec.js` 都在 WebGL Context 构造处失败；
  这是当前 `--use-angle=gl` headless 环境限制，headed 同配置使用真实 GPU 通过。本次 focused
  rerun 因已有 server 占用 8081，标准 config 启动第二个 server 得到 `EADDRINUSE`；改用短期
  repository-root static server（8070）和仅存在于运行期间、随后删除的 no-webServer config，
  delivery 中没有 server 进程或 E2E config 修改。外网尝试、本地 4xx、pageerror 和 console error
  均为 `0`。
- `node --test scripts/scenegis/audit-upstream-patches.spec.mjs`：`13/13 passed`；仓库 audit
  Exit `0`，报告 `3` 个历史 registered upstream-owned files、current delivery upstream-owned
  files=`0`、SGP-0001/0002、`82` marker tokens、generated status `0`。
- `node scripts/scenegis/verify-planar-packages.mjs`：Exit `0`；workspace 与 installed tarball
  bare engine/widgets/root ESM、bare root CJS、types/API docs 均通过，private roles 均不可见，
  broken public entry fixture 按预期失败。
- no-embedding gallery：Exit `0`，`305` demos；no-embedding Sandcastle build：Exit `0`，只有
  既有 chunk-size warning。标准 embedding gallery：Exit `1`，Hugging Face tokenizer metadata
  fetch failed；没有把该外部失败写成通过。
- scoped ESLint（全部 SceneGIS Source/Specs、P8 E2E/scripts）、Prettier、Markdownlint、
  `git diff --check` 与最终 audit：Exit `0`；`git diff --check` 仅输出既有 LF/CRLF warning。

### Ownership、偏差与剩余风险

- 相对 P7 checkpoint 的 upstream-owned product/test/build diff=`0`；P8 SGP=`0`；
  `.scenegis/upstream-base.json`、patch manifest 与 SGP-0001/0002 hunks unchanged。
- SceneGIS-owned product/test/script patch marker hits=`0`；generated/Build/SpecList status=`0`。
- 与原计划的唯一执行偏差是：标准 Playwright headless GPU path 在当前机器不可用，因此使用
  同一现有 config 的 `--headed` real-GPU path 作为 dev/release E2E 与 timing gate，并用 upstream
  Viewer 同样失败证明环境归因；没有修改 e2e config。
- private counters 只能证明显式 persistent allocations/resources，不代表完整 JS transient heap；
  timing 也只适用于本机趋势。公网 OSM、embedding metadata 和未来 Cesium private semantics 仍是
  外部/升级风险，分别由人工示例与 upgrade checklist 追踪。

### Initial Architecture review

- Architecture 独立复跑 engine `8/8`、widgets `1/1`、audit self-test `2/2`、live audit 和
  package smoke，提交的成功路径均可复现。
- Review 状态为 `changes-requested`。P8-R001 至 P8-R005 分别要求关闭 upstream audit 的
  registered-file/rename false positive、installed package resolution 与完整 public/private/type
  matrix、warm/cache/depth exact hard gates、完整 lifecycle resource balance，以及 E2E
  error/network/primary-world 与 resolution-appropriate timing evidence。
- P8 与 extension 继续保持 `active`；产品 runtime 零修改和 upstream-owned files=`0` 的事实
  不变。Execution Agent 修复后请求 focused re-review，不 commit/push/tag/publish，也不进入
  新阶段。

### Focused fix after initial Architecture review

- P8-R001 至 P8-R005 已由 Execution Agent 标记 `fixed`，review-level status 在 Architecture
  focused re-review 前仍为 `changes-requested`。
- Audit 改为 NUL-safe old/new path 与逐 changed-line marker coverage，13 个独立 fixture 全部
  通过；package smoke 改为仓库外 consumer 的 bare ESM/CJS resolution 并加入 broken-entry
  failure proof。
- Warm frames 每帧锁定完整 signature；五轮 churn 使用多层级、四边、四角和双 imagery；60
  depth keys 精确验证 cached command references 与 replay delta。八轮真实 Context soak 覆盖
  ready imagery、pending cancel 与 late settlement。
- E2E 新增 external-attempt/pageerror/console-error 零断言、world/globe/controller identity 与
  cleanup；timing 使用 20-render batch，并记录 baseline/candidate 全部五轮 median/P95/max。
- 最终仍为 product runtime diff=`0`、upstream-owned files=`0`、P8 SGP=`0`、manifest unchanged、
  generated status=`0`。

### Focused Architecture re-review and completion

- Architecture 复核了 R001 至 R005 的实现边界，并独立复跑 audit destructive suite `13/13`、
  live audit 与 installed-tarball package smoke，均 Exit `0`；结合已记录的 focused Specs、headed
  E2E、build/type/docs 与格式证据，确认五项 finding 均为`fixed`。
- P8 review 为`approved`，本 phase 与 parent extension 均为`completed`。Architecture Agent创建
  独立中文本地 checkpoint；不 push、tag、publish，也不隐含启动后续大型计划。
