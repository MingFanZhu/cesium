# 总体计划：SceneGIS 平面高级地形

## 元数据

- 计划类型（Plan type）：`extension`
- 状态（Status）：`active`
- 负责人角色（Owner role）：`architecture`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-10`
- 更新日期（Updated）：`2026-08-10`
- Parent extensions：
  [completed `planar-world`](../../planar-world/README.md)、
  [completed `planar-terrain`](../../planar-terrain/README.md) 和
  [completed `planar-content`](../../planar-content/README.md)
- 相关讨论（Related discussions）：项目负责人完成旧扩展尾项复核，确认把导航锚点、地下导航、
  Worker、smooth normal 和 quantized-mesh 统一纳入本后续扩展
- 相关评审（Related reviews）：None
- 继承 ADR：
  - [ADR-0002：平面坐标与瓦片寻址契约](../../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)
  - [ADR-0004：平面导航、相机约束与 Surface Picking](../../../Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md)
  - [ADR-0007：平面地形 Core 契约与 Heightmap 兼容表示](../../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)
  - [ADR-0008：平面地形 Mesh、Surface 集成与最小加载](../../../Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)
  - [ADR-0009：平面地形连续 LOD、上采样与缓存](../../../Documentation/SceneGIS/Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md)
  - [ADR-0010：平面地形驻留查询、Terrain Picking 与独立采样](../../../Documentation/SceneGIS/Decisions/ADR-0010-planar-terrain-query-picking-and-sampling.md)
  - [ADR-0011：坐标系无关的平面 XYZ Heightmap Terrain Provider](../../../Documentation/SceneGIS/Decisions/ADR-0011-planar-url-template-heightmap-terrain-provider.md)
  - [ADR-0012：平面地形基础光照与几何法线](../../../Documentation/SceneGIS/Decisions/ADR-0012-planar-terrain-lighting-and-geometric-normals.md)
- 新 ADR：
  [ADR-0024：平面地形感知导航锚点](../../../Documentation/SceneGIS/Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)；
  A2-A7不预判编号和详细实现
- SGP：当前不新增；若 phase 必须修改 upstream-owned file，先登记或复用合法 SGP

## 目标

在不重新打开真正平面坐标、primary world、terrain ownership 与 public Z=0 picking 契约的前提下，
补齐平面地形的高级运行时能力：让 PC 导航锚点与当前画面/真实地形一致；用显式模式定义地表、
地下、碰撞与防穿透；把已证明会阻塞主线程的解码和 mesh 工作迁移到 Worker；增加坐标系无关的
quantized-mesh；改善地形法线和 LOD 切换的视觉连续性；最后完成统一交付与人工验收。

本扩展继续采用 progressive elaboration。总体计划只冻结跨阶段稳定目标、顺序和边界。A2-A7 的
公共签名、私有角色、Shader/Worker 文件、build seam、数据布局、性能阈值和精确验证命令，必须在
对应 phase 真正进入时根据届时源码和测量结果重新设计。

## 非目标

- 修改 `Cartesian3` 米制 Z-up、正方形 extent、单根 northwest-origin XYZ 或 canonical
  `SceneGISPlanarTilingScheme` identity。
- 让平面 world 继承、包装或伪装 `Globe`，或者重新引入 ellipsoid、Cartographic、geodetic
  Rectangle、horizon occlusion 和 Globe terrain runtime。
- 静默改变 `SceneGISPlanarWorld.pick`、`pickFromWindowPosition` 的有界 Z=0 数学参考平面语义。
- 把 `scene.pickPosition`、resident terrain query 和 Z=0 reference pick 合并成含糊的公共 API。
- 自动重投影、从 URL/metadata 猜测 CRS，或把 EPSG:3857、ArcGIS 等案例配置固化到公共 provider。
- 支持洞穴、悬挑、多层地表或其他非单值 height field 地形。
- 在本扩展中建设 quantized-mesh/DEM 离线切片、重投影、压缩和发布工具链。
- 未经 profiling 就把全部 terrain 工作迁入 Worker，或未经画面证据就重写全部 shader/normal 管线。
- 增加平面底图/地形选择器、Globe/planar 同场混合或运行时世界切换。

## 稳定架构边界

1. 本扩展依赖已完成的 `planar-world`、`planar-terrain` 和 `planar-content`，不把后续能力倒灌为
   这些已完成 extension 的未完成状态；必要修正由本扩展的新 phase、ADR 和提交承载。
2. 所有 world position、terrain height、误差、碰撞距离和导航目标继续使用米制
   `Cartesian3`。terrain 仍是 Z-up 2.5D height field，并允许正、负高程。
3. Terrain provider 与 world 必须共享同一个 canonical `SceneGISPlanarTilingScheme` object；
   provider/数据格式不执行 CRS 比较、推断或重投影，调用方负责保证坐标系、extent 和 XYZ 地址一致。
4. `world.pick` 与 `pickFromWindowPosition` 保持 render-independent、有界 Z=0 公共参考平面 API；
   A1 只为 navigation 建立私有锚点选择，不通过静默改写公共 API 获得地形感知。
5. 导航锚点应按可解释的候选来源工作：当前可见 rendered depth、当前 terrain render cover 和 Z=0
   reference fallback 各自保留现有职责。具体优先级、遮挡规则、有效性和 gesture 内快照时序由 A1
   源码审计后冻结，但平移、旋转、缩放必须共享同一组明确语义而非各自临时修补。
6. 地表导航和地下导航是显式模式/策略，不是从 camera Z 或一次 pick 结果隐式猜测。碰撞、防穿透和
   恢复行为必须服从当前模式，不能建立永久的“Camera 必须始终高于 terrain” world 不变量。
7. 相机位于地形下方是合法状态。地下模式必须继续支持完整 Cartesian3、双面 terrain 与负高程；
   surface mode 的安全约束不得破坏 underground mode，也不能以 `viewHome` 代替正常边界处理。
8. Heightmap、未来 quantized-mesh、DIRECT/UPSAMPLED/FLAT fallback 和 imagery 继续共享现有
   desired/load/render、四子覆盖门禁、single-cover、normal-render-only mutation、depth replay 和
   exactly-once resource ownership。新数据格式不能另建互相竞争的 surface 状态机。
9. Worker 是执行机制，不改变 public terrain provider/data ownership、RequestScheduler 语义、normal
   render mutation 门禁或 caller-owned provider 边界。任务、transferable、cancel、stale generation、
   error、late completion 和发布 URL 必须在 A4 形成可测试协议后才能接入。
10. Quantized-mesh 支持必须是 coordinate-system agnostic：公共 contract 使用 caller-supplied canonical
    tiling scheme 和米制 decoded positions/heights；服务 metadata、extensions、availability 和 decoder
    范围只在 A5 依据实际数据源确定，不自动套用球面 quantized-mesh 语义。
11. 法线/光照改进必须保持当前双面 terrain、surface/underground 视角、single opaque command、imagery
    composition、pick/depth replay 和资源生命周期。A6 可以比较 CPU/GPU normal 方案，但只有测量与画面
    证据才能扩大 mesh attribute、边界邻域或 shader variant。
12. 项目负责人已原则授权：如果对应 phase 证明独立 Shader 文件更合适，可以遵循当前 Cesium Shader
    编译结构，在 SceneGIS 扩展区域建立专用 Shader 文件夹，并对必要 build 文件做最小修改；Worker/build
    seam 同理。但该授权不等于预先批准任意路径或实现。phase 必须先重新审计当前发现、生成、runtime URL
    与发布链，形成 ADR；任何 upstream-owned diff 仍须 SGP、成对 marker 或合法 manifest-only 记录。
13. 默认实现继续位于 SceneGIS-owned paths。修改 upstream-owned file 仅限没有现有显式扩展点时的最小、
    可测试 seam；不得复制大段 Cesium Shader/Worker/terrain 实现来规避补丁纪律。
14. 每个 phase 串行推进，并在 implementation、最小充分验证、Architecture/code review 和 AgentDocs
    回写完成后形成独立中文本地提交，才进入下一 phase。

## 基线事实

- 规划分支为 `feature/planar-terrain-advanced`，从已完成人工验收的
  `planar-content` C11 checkpoint `14a7206f41` 创建。
- `SceneGISPlanarWorld` 已具有 flat/heightmap terrain surface、连续 LOD、imagery、resident height、
  terrain ray/window picking、rendered depth、PC navigation、Viewer 和 content/ground integration。
- 现有 `SceneGISPlanarCameraController` 的平移、旋转和缩放仍以 public Z=0
  `pickFromWindowPosition` 为主要 gesture anchor，因此 terrain/对象可见点与中键旋转 pivot 可能不一致。
- `world.pickTerrainFromWindowPosition` 使用最近成功 normal render 的实际 terrain cover；
  `scene.pickPosition` 返回 frontmost rendered depth；二者都不应取代 public Z=0 API。
- 现有 URL Heightmap provider 在主线程执行 LERC decode；regular-grid mesh 也在主线程生成。此前阶段因
  缺少可重复 blocker 明确延期 Worker，本扩展只在 A4 用新的测量证据决定迁移范围。
- 当前 lighting 使用 fragment derivatives 得到 per-triangle geometric normal。它不增加 vertex normal，
  因此三角形和 LOD 变化可能产生可见明暗切换。
- `SceneGISPlanarTerrainProvider`/`TerrainData` 已是格式无关 structural contract，Heightmap 只是首个实现；
  quantized-mesh 应作为并列数据实现接入，而不是破坏既有 provider 返回层次。
- 当前 Architecture 记录的 Shader 主要从 `Source/Shaders/**` 发现，Worker 主要从
  `Source/Workers/**` 发现；这些只是规划时事实，不是 A4/A6 已批准的精确接入路径。

## 阶段路线图

| 阶段 | 目标                                                                                     | 依赖                            | 进入门槛                                                                                          | 完成门槛                                                                                                | 状态        | 阶段计划                                                           |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| A1   | 建立平移、旋转、缩放共享的地形感知导航锚点，修复中键 pivot 与画面/地形不一致。           | 三个 parent extension completed | 总体计划提交；重新审计 controller、four-frustum ray、depth、terrain snapshot 与 input lifecycle。 | 三种 PC gesture 在 flat、terrain、对象遮挡、边界和大坐标下具有已批准锚点语义；public Z=0 picking 不变。 | `completed` | [A1 plan](2026-08-10-phase-a1-terrain-aware-navigation-anchors.md) |
| A2   | 建立 surface/underground navigation mode 与 camera-surface relationship 公共或私有契约。 | A1                              | A1 review、提交；重新审计 controller host、Viewer、programmatic camera 与 terrain query。         | 模式、切换、默认值、事件/状态、无 terrain 行为和迁移边界明确并实现；不提前加入完整 collision。          | `planned`   | 延迟                                                               |
| A3   | 实现模式感知的地下导航、碰撞和防穿透。                                                   | A2                              | A2 review、提交；以真实交互问题定义 collision profile。                                           | surface mode 不穿透且不异常复位；underground mode 可从上下两侧浏览；programmatic/input 路径一致。       | `planned`   | 延迟                                                               |
| A4   | 依据 profiling 建立 LERC decode 与 terrain mesh 的 Worker 管线。                         | A3                              | A3 review、提交；重新测量 decode/mesh blocker并审计 Worker/build/package事实。                    | 获批任务进入 Worker；cancel/stale/error/transfer/destroy与发布闭环；无收益工作不迁移。                  | `planned`   | 延迟                                                               |
| A5   | 增加坐标系无关的 planar quantized-mesh 数据/provider 适配。                              | A4                              | A4 review、提交；选择合法公开或本地fixture并核对格式/许可。                                       | 与 canonical tiling、LOD/fallback/query/pick/resource生命周期闭环；heightmap兼容路径不退化。            | `planned`   | 延迟                                                               |
| A6   | 改善地形法线、跨瓦片及跨 LOD 的光照连续性。                                              | A5                              | A5 review、提交；对实际画面、normal数据和成本进行比较。                                           | 已批准方案显著减少可重复明暗跳变，保持双面/地下、imagery、depth/pick与稳定资源成本。                    | `planned`   | 延迟                                                               |
| A7   | 完成统一性能、发布和真实浏览器/GPU人工验收。                                             | A6                              | A1-A6均review并提交；明确最终案例和最小资格矩阵。                                                 | 导航、模式、Worker、两种terrain格式、光照和生命周期达到整体验收，文档/包/升级清单闭环。                 | `planned`   | 延迟                                                               |

所有 phase 串行执行。总体路线图中的 A2-A7 只表示产品目标和依赖，不授权提前创建实现、Spec、
Shader、Worker 或 build 修改。

## 延迟到 Phase 的决定

- A1 私有 anchor resolver 的文件/类型名称、rendered-depth 与 terrain 的精确优先级、对象遮挡处理、
  gesture-start snapshot、fallback 与 anchor correction 数学。
- navigation mode 的 public API 名称、默认值、切换方法、事件以及是否进入 Viewer options。
- collision clearance、速度/步长、法向选择、边界、穿越检测、恢复策略及 programmatic camera 范围。
- Worker 入口、任务划分、消息 payload、transferable ownership、pool、cancel、输出路径、runtime URL、
  CSP、package 和 build 配置。
- quantized-mesh 公共类型、metadata/provider、availability、extensions、edge/skirt、normal、水体和
  decoder 范围。
- smooth normal 的 CPU/GPU 生成、邻瓦片样本、边界协议、LOD blending、attribute packing、Shader
  变体和内存预算。
- 每个 phase 的精确 source/spec 路径、命令矩阵、性能场景和阈值。

## 跨阶段验证原则

- 每个行为变化有风险相称的自动化 Specs；只运行与当前 phase 影响路径相符的最小充分矩阵。
- A1-A3 以真实 input pipeline、perspective/orthographic、大坐标、边界和 surface 两侧为重点；不以
  直接调用 private method 代替全部交互证据。
- A4 必须分别证明主线程响应、Worker 任务正确性、transfer/cancel/stale/error 和 package/runtime URL；
  只有同一场景可重复数据才用于性能判断。
- A5 对 Heightmap 和 quantized-mesh 共用 surface runtime 做同场回归，不把公开网络作为自动化 hard gate。
- A6 同时验证画面、normal continuity、资源/command identity 和成本；固定截图/像素只覆盖能区分方案的
  代表性视角，不追求无收益的驱动矩阵。
- 涉及 Shader/Worker/build/public API 时运行相应 build、types、docs、package 与升级检查；没有触及的
  上游大套件不反复执行。
- Sandcastle 是组装和人工验收入口，不替代确定性 Specs；公网数据始终标明 Credit、SLA 和 best-effort。
- 不提交生成文件、Build 输出、本机 profile、外部 tile 缓存或临时日志。

## 全局风险

- `scene.pickPosition` 可能命中 Entity/Primitive 而非 terrain；错误优先级会让 gesture pivot 跳到对象或
  失效。A1 必须明确“视觉锚点”和“terrain锚点”的区别。
- Terrain cover 是最近 normal render snapshot；gesture 期间 LOD replacement、provider replacement 或
  depth invalidation 可能造成锚点漂移，必须定义快照与失效边界。
- 地表 collision 与地下合法状态天然冲突；若模式设计含糊，防穿透会再次产生 home/reset 或无法离开
  地下的问题。
- Worker 会扩大构建、CSP、URL、包、transferable 和取消协议，是高升级敏感面；若需要 upstream seam，
  其 SGP 必须保持窄小。
- Quantized-mesh 常见生态包含 geodetic metadata 与 extension；只取可证明坐标系无关的 payload 语义，
  可能需要专用服务适配层。
- Smooth normal 可能增加 CPU/GPU memory、边界邻域请求或新 LOD seam；视觉收益与稳定成本都要测量。
- `SGP-0001`、`SGP-0002` 仍是继承的 high-risk seams；本扩展不因相邻功能方便而扩大它们。

## 整体验收条件

- 左键平移、中键旋转和滚轮缩放在 flat、terrain、边界、大坐标、对象遮挡和代表性四种 frustum 下，
  使用一致、可预测且无异常复位的锚点；公开 Z=0 picking contract 保持兼容。
- Surface/underground 模式含义明确。Surface mode 的碰撞与防穿透不会产生跳回 home、越界复位或手势
  不连续；underground mode 支持位于 terrain 上下两侧的观察和穿越策略。
- 获批的 LERC/mesh 工作从主线程迁移后具有正确的 scheduling、transfer、cancel、stale generation、
  failure 和 exactly-once release；没有把请求/资源 owner 隐式转移给 Worker。
- Heightmap 和 quantized-mesh 都通过同一 planar surface/LOD/fallback/query/pick/imagery/lifecycle 契约，
  provider 不猜测或转换 CRS。
- 地形光照在代表性 terrain、LOD 和相机视角下没有已确认的不可接受明暗跳变，同时保持双面、地下、
  imagery、single-cover、pick/depth 与 warm resource stability。
- 无 terrain provider、既有 Heightmap provider、Viewer/content/ground 和已完成 parent extension 的受影响
  行为保持兼容。
- 所有公共 API 进入正式 runtime/types/API docs；private Shader/Worker/runtime 不进入公共兼容承诺。
- 每个 upstream-owned diff 都有合法 SGP 与 marker/manifest-only 记录；SceneGIS-owned Shader 文件不使用
  `SCENEGIS_PATCH` marker。
- A1-A7 都完成 implementation、最小充分验证、Architecture/code review、AgentDocs 回写、独立中文提交，
  且项目负责人完成最终真实浏览器/GPU人工验收。

## 进度与交接

- `2026-08-10`：在 `planar-content` C11 人工验收完成后复核旧扩展边界，确认中键旋转 pivot 不准源于
  controller 仍使用 Z=0 anchor；同一根因覆盖平移和缩放。
- `2026-08-10`：项目负责人决定把三种导航锚点、地下导航/碰撞/防穿透、Terrain Worker、法线/LOD
  连续性和 quantized-mesh 统一作为地形后续，并批准建立新的大型 extension。
- `2026-08-10`：项目负责人授权必要时按 Cesium 现有 Shader 编译结构建立 SceneGIS Shader 文件夹并
  修改最小 build seam；Architecture 明确该授权仍受 phase 源码审计、ADR、SGP 和升级边界约束。
- `2026-08-10`：从 checkpoint `14a7206f41` 创建 `feature/planar-terrain-advanced`，本中文版总体计划
  状态为 `active/confirmed`；产品源码未修改。下一步形成规划提交，然后进入 A1 源码事实复核与 phase plan。
- `2026-08-10`：Architecture形成总体规划checkpoint `1d93c1686b`，随后审计controller三手势、
  four-frustum helper、Scene depth cache、terrain query snapshot、上游globe pick思想与既有Specs。
  ADR-0024批准private depth→terrain→Z=0 fallback、drag-start稳定anchor和anchor-height pan/zoom；A1 phase
  plan激活，保持public API、World/Surface、upstream、Shader/Worker/build不变。
- `2026-08-10`：Execution完成A1 private resolver、三手势接入与real-Context terrain pivot闭环；A1新增
  5个direct cases，focused aggregate 59/59，build与zero-upstream/zero-SGP audit通过。Architecture独立
  复跑关键套件和audit后将[A1 review](../reviews/2026-08-10-a1-terrain-aware-navigation-anchors.md)标为
  `approved`；项目负责人随后通过现有Sandcastle的middle pivot、pan与wheel人工复测。A1状态改为
  `completed`并形成独立本地checkpoint；A2尚未激活，extension继续`active`。
