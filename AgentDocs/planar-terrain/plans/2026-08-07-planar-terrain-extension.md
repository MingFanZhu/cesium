# 总体计划：SceneGIS 平面地形

## 元数据

- 计划类型（Plan type）：`extension`
- 状态（Status）：`active`
- 负责人角色（Owner role）：`architecture`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-07`
- 更新日期（Updated）：`2026-08-07`
- Parent extension：
  [completed `planar-world`](../../planar-world/README.md)
- 相关讨论（Related discussions）：无
- 相关评审（Related reviews）：无
- 相关 ADR：
  - [ADR-0001：Scene primary world 契约](../../../Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md)
  - [ADR-0002：平面坐标与瓦片寻址契约](../../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)
  - [ADR-0003：平面 Surface Runtime、LOD 与缓存契约](../../../Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md)
  - [ADR-0004：平面导航、相机约束与 Surface Picking](../../../Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md)
  - [ADR-0005：平面栅格影像运行时与图层合成](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)
- 新 ADR：
  [ADR-0007：平面地形 Core 契约与 Heightmap 兼容表示](../../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)
- SGP：当前计划不新增；若 phase 证明必须修改 upstream-owned file，再先建立或复用合法 SGP

## 目标

在已完成的 `SceneGISPlanarWorld` 上增加真正的平面高程地形能力。地形使用完整的米制
平面坐标和 Z-up 高程，支持正、负高度、异步瓦片数据、LOD 连续覆盖、imagery drape、
高度查询与地形拾取，同时保持无 terrain provider 时现有 flat surface 的行为、性能路径
和公共语义。

本扩展采用 progressive elaboration。总体计划只冻结跨阶段稳定边界；具体公共签名、私有
类型、状态机、Shader、Worker、请求策略、性能阈值和验证命令，必须在对应 phase 开始前
依据届时源码重新设计并获得批准。

## 非目标

- 让平面地形继承、包装或伪装 Cesium 的 `TerrainProvider`、`TerrainData`、
  `HeightmapTerrainData`、`TerrainMesh` 或 Globe surface runtime。
- 将米制平面坐标转换为 `Ellipsoid`、`Cartographic` 或大地测量 `Rectangle`，或者通过
  虚假球面语义换取上游 terrain 接入。
- 首版支持 quantized-mesh、洞穴、悬挑或其他不能表示为单值高度场的表面。
- 首版建设通用 GeoTIFF/DEM 切片、重投影、压缩或离线生产工具链。
- 自动地形碰撞、相机防穿透、Entity clamp、贴地 Primitive、地形遮挡分析或物理系统。
- 在本扩展中完成地下导航、地下材质或把“相机必须位于地形上方”变成 world 永久不变量。
- 水体、海洋法线、大气、云层、阴影体系或完整 terrain material system。
- 增加平面底图或地形选择器；自定义 CRS 与数据服务仍由应用显式匹配。
- 支持 `Globe` 与 planar terrain 的同场混合或运行时互换。

## 稳定架构边界

1. `planar-terrain` 是依赖已完成 `planar-world` 的独立大型扩展，不重新打开 primary-world、
   coordinate-system、Viewer 或 camera-controller 的既有契约。
2. 世界 X/Y、terrain height 和所有误差量均使用米。位置继续使用 Z-up
   `Cartesian3`；地形支持有限的正、负高程，`Z=0` 保持坐标系参考高程。
3. 地形与 world 使用同一个 canonical `SceneGISPlanarTilingScheme` object：Level 0 为
   `1 × 1`、northwest-origin XYZ、无 wrap。相同 CRS 字符串或相同数值范围不能替代 object
   identity，也不触发隐式重投影。
4. 平面 terrain provider 与 terrain data 是 SceneGIS 自有契约，不携带 ellipsoid、
   cartographic、horizon occlusion 或 Globe 专用 capability。可以复用 Cesium 中与球面无关的
   请求、事件和 GPU 基础设施，但不能依赖结构偶然相似来冒充上游 terrain 类型。
5. heightmap 是首个 canonical terrain format。数据布局、`structure` 解码、north-to-south、
   west-to-east row-major、child mask 和 SW→NE triangle interpolation 与 Cesium heightmap
   兼容，但空间范围、mesh、Worker 和 runtime 保持真正的平面语义；解码后的高度单位为米。
6. world 可以使用与其 canonical tiling scheme 匹配的 terrain provider。provider 始终由
   调用方拥有；world 只拥有由 provider 结果形成的请求、tile、CPU mesh、GPU resource 和
   内部 cache。更换 provider 必须隔离旧 generation，且不得销毁调用方 provider。
7. 没有 terrain provider 时，现有 Z=0 shared-unit-quad flat surface 仍是完整功能路径，不能
   因 terrain 扩展产生不必要的 per-tile terrain allocation、请求或状态。
8. terrain geometry 使用 tile-local XY 和相对高程，再通过 `modelMatrix` 放回完整 CRS，不能
   把大型绝对 X/Y 或可避免的绝对 Z 写入 Float32 vertex buffer。
9. imagery provider/layer 的所有权、canonical tiling-scheme identity 和逐图层 fallback 继续
   服从 ADR-0005。imagery 必须贴附在本帧实际 terrain geometry 上，不能通过另一个重叠平面
   冒充 drape。
10. terrain 加载与 LOD 允许使用祖先数据、上采样或 Z=0 fallback 保持覆盖，但同一可见区域
    每帧只能由一个层级覆盖；不得同时提交父子 terrain geometry，也不得在加载期间产生孔洞。
11. `world.tilesLoaded` 继续表示最近正常渲染的当前视图是否 settled，并综合 terrain 与所有
    shown imagery。可恢复的 pending 工作不能提前报告完成；确定不可用或 terminal failure 在
    已有完整 fallback 时可以 settled，不能造成永久 request-render loop。
12. normal render 仍是 terrain selection、请求推进、mesh/GPU 提交、command cache 和 LRU
    mutation 的唯一通道。pick/depth pass 只重放最近正常渲染的 command，不推进 terrain
    状态或分配资源。
13. 现有 `SceneGISPlanarWorld.pick` 与 `pickFromWindowPosition` 保持有界 Z=0 数学参考平面
    语义，供既有导航继续使用。terrain height、terrain ray picking 和 rendered-depth 是不同
    能力，必须通过明确接口表达，不能互相隐式回退。
14. terrain surface 保持双面和负 Z 可表示，不引入永久的“Camera 必须位于 terrain 之上”
    world 约束。当前 planar camera controller 不因安装 terrain provider 而静默改变行为。
15. 实现默认位于 SceneGIS-owned paths。只有 phase 以实际源码证明现有扩展点不足时，才能
    提议窄小 upstream seam；修改前必须创建 ADR/SGP，并由 Architecture Agent 和项目负责人
    重新批准。

## 源码与基线事实

- 官方 Cesium 基线为 `1.144`，提交
  `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
- `planar-world` P1-P8 已在产品 checkpoint `93543c5a28` 完成，当前规划基线
  `14562040b2` 另包含根 `AGENTS.md` 的最小充分验证约束。
- 现有 planar world 已提供 primary-world 生命周期、米制坐标与单根 quadtree、flat surface、
  perspective/orthographic SSE、tile-local model placement、imagery、PC navigation、Z=0
  mathematical picking、rendered-depth replay、Viewer 集成和本地交付验收。
- 当前 planar surface 的 geometry、bounds、距离和误差模型以 Z=0 flat surface 为前提；
  terrain 必须扩展这些职责，同时保留无 provider 路径。
- 当前 planar imagery 绑定 ideal surface tile，并要求 provider 使用 world 的 canonical tiling
  scheme；terrain geometry 与 imagery LOD 的协作需要在相关 phase 明确，但不得破坏影像
  provider/layer ownership。
- Cesium 1.144 的官方 terrain contract、heightmap mesh 和 Globe surface state machine 依赖
  ellipsoid、cartographic rectangle、map projection、horizon/occlusion 及球面 worker encoding，
  不能作为真正平面地形的可选接口直接实现。
- Cesium 的请求、事件、Credit、DrawCommand、Buffer、VertexArray、Texture、ShaderProgram
  等非球面基础设施可以在语义匹配时复用。
- SceneGIS Worker 的发现、输出路径、运行时 URL 和发布行为仍是架构层明确延迟的决定；只有
  进入实际需要 Worker 的 phase 后才能读取并确定当前构建链。

## 阶段路线图

| 阶段 | 目标                                                                                           | 依赖                     | 进入门槛                                                                   | 完成门槛                                                                                                         | 状态      | 阶段计划                                       |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------- |
| T1   | 建立平面 terrain provider、heightmap data、插值与可用性等核心契约。                            | `planar-world` completed | 总体计划获批；建立独立实现分支；重新核对 Core 与上游 terrain 公共语义。    | 公共契约、所有权和错误边界获批并实现；纯 Core 与公开构建证据通过；不接入 renderer。                              | `active`  | [T1 plan](2026-08-07-phase-t1-terrain-core.md) |
| T2   | 建立最小 terrain geometry 与 `SceneGISPlanarWorld` surface 集成，使 imagery 可以贴附高程表面。 | T1                       | T1 已 review、提交；重新检查当前 planar surface、Renderer 与 Shader 事实。 | 确定性 terrain 数据可正确渲染；三维 bounds/SSE 和大坐标成立；无 provider flat path 保持。                        | `planned` | 未创建                                         |
| T3   | 完成异步 LOD、fallback、上采样、连续替换、裂缝处理、缓存和资源生命周期。                       | T2                       | T2 已 review、提交；依据真实 runtime 重新设计状态和调度。                  | 加载、失败、取消、迟到结果和驱逐均保持无孔洞、无父子重复及 exactly-once 释放；`tilesLoaded` 语义成立。           | `planned` | 未创建                                         |
| T4   | 增加驻留高度查询、terrain ray/window picking 与独立异步采样能力。                              | T3                       | T3 已 review、提交；重新检查 mesh、depth 和 navigation 边界。              | 查询与实际 mesh 三角化一致；terrain picking、Z=0 reference pick 和 `scene.pickPosition` 职责清晰；既有导航不变。 | `planned` | 未创建                                         |
| T5   | 增加可复用的数据适配入口和可执行 terrain 示例。                                                | T4                       | T4 已 review、提交；确认目标数据格式、服务政策、CORS、Credit 与发布边界。  | 至少一个可重复的本地/确定性数据案例完成；合适时增加受政策约束的公开 DEM 演示；自动化不依赖公网。                 | `planned` | 未创建                                         |
| T6   | 完成基础地形表现、人工验收、有限性能与交付资格。                                               | T5                       | T5 已 review、提交；依据真实画面和 profiling 决定表现范围。                | 已批准的法线/光照或其他表现目标完成；相关资源、性能、文档、包与升级检查达到整体交付标准。                        | `planned` | 未创建                                         |

所有 phase 串行执行。一个 phase 的实现、相关 Specs、ADR/SGP、AgentDocs 和 review 必须形成
独立本地提交检查点，之后才能激活或实现下一 phase。

## 延迟到 Phase 的决定

以下内容不属于本 extension plan 的既定实现，先前讨论仅作为 phase 可能参考：

- public class/function 的最终名称、构造参数、返回结构和 result reuse 细节；
- 私有文件、类、cache entry 和状态枚举的拆分与命名；
- heightmap buffer 的内部存储、复制、转移、mesh 后保留方式及 byte budget；
- vertex/index attribute layout、index datatype、skirt topology、skirt 深度公式和法线格式；
- terrain geometric error 与现有 nominal planar sampling error 的具体组合算法；
- desired/rendered/request/protected 集合的具体数据结构、请求优先级和每帧处理顺序；
- 上采样任务的同步/异步实现、原始数据替换算法和中间祖先请求策略；
- Shader 源码组织、变体数量和是否需要正式 SceneGIS shader build seam；
- Worker 是否进入、入口目录、消息 payload、transferable 策略、输出路径和发布方式；
- URL template、Terrain-RGB、Terrarium、GeoTIFF 或其他 decoder/provider 的首个具体选择；
- 精确测试文件、命令矩阵、性能阈值和 Sandcastle 外部服务。

每项只在其所属 phase 的 entry gate 后读取当时源码并形成 phase plan；不得从本总体计划
推断其实现已经获批。

## 跨阶段验证

- 每个行为变化必须有风险相称的自动化 Specs；公共 API 阶段检查 root export、types 和 API
  docs，WebGL 阶段检查画面、bounds、depth 和资源生命周期。
- flat surface、imagery、navigation、Viewer 和默认 Globe 只运行受实际影响的最小充分回归，
  不以形式完整为理由反复执行无关全量套件。
- 异步与缓存阶段验证成功、限流、失败、retry、cancel、stale generation、eviction 和 destroy，
  但边界组合以能够证明契约为限，不追求无收益的穷举。
- Sandcastle 用于真实组装和人工视觉验收；确定性自动化 fixture 不依赖公网服务。
- 热路径只有在进入相关 phase 后固定场景和指标，先获得可复核证据再决定优化；不把单机
  瞬时 FPS 作为跨机器 hard gate。
- 每个 phase plan 根据实际影响列出精确命令。涉及 upstream-owned file 时增加对应 SGP 专项
  和上游回归；没有 upstream diff 时不为补丁审计制造额外工作。
- 不提交生成文件、构建输出、本机 profile、外部数据缓存或临时性能日志。

## 全局风险与依赖

- terrain 会把当前同步 flat geometry 扩展为异步 CPU/GPU 内容，可能扩大 surface hot path、
  tile resident memory 和 command/resource 生命周期。
- 不同 heightmap resolution、跨 LOD 边界、负高程与大范围 CRS 可能影响 culling、near/far、
  depth precision 和裂缝表现。
- imagery 当前按 planar surface tile 绑定；terrain replacement 必须同时维持影像清晰度、
  fallback 独立性和单层覆盖。
- Worker 和 Shader build 是当前明确延迟的架构问题，实际接入可能需要新 ADR，极端情况下需要
  upstream build SGP。
- 外部 DEM 的许可、Credit、CORS、服务稳定性和批量访问政策可能不适合自动化或默认示例。
- 当前 camera controller 是 surface-side profile；terrain 不能通过临时 collision 规则阻断未来
  地下模式。
- Cesium private Renderer、RequestScheduler、depth pass 和 build 语义会随官方升级变化，必须
  继续依赖已有升级清单并为 terrain 增加相应检查点。
- `SGP-0001` 和 `SGP-0002` 仍是 inherited high-risk seams；本扩展不得在没有独立理由时扩大
  它们。

## 整体验收条件

- 无 terrain provider 时，现有平面世界画面、LOD、imagery、navigation、picking、Viewer、
  `tilesLoaded` 和资源生命周期保持兼容，flat fast path 不承担 terrain-only allocation。
- 安装合法 provider 后，正负高程在完整米制 CRS 中正确渲染，imagery 与 terrain geometry
  一致贴附，并在 perspective/orthographic、大坐标和边界视角下保持有效。
- 当前视图的异步加载、fallback、上采样、replacement 和 terminal failure 不产生 geometry
  hole 或同一区域父子重复绘制，最终能够稳定收敛。
- terrain CPU/GPU/request/cache 资源在 provider replacement、tile eviction、world destroy 和
  stale completion 下均有清晰 owner，并且 exactly once 释放。
- 高度查询和 terrain picking 与渲染三角化一致；现有 Z=0 mathematical picking 与 camera
  navigation contract 不被静默改变。
- 至少一个完全可重复的数据案例和 Sandcastle 证明完整组装；任何公网案例都明确 Credit、
  policy 和 best-effort 边界，自动化测试不依赖公网。
- 稳定视图在 warm-up 后不持续创建请求、tile、CPU mesh、GPU buffer、ShaderProgram 或
  DrawCommand；性能验证遵守最小充分原则，并且没有已确认的不可接受回退。
- 所有新增公共类型可从正式 engine/Cesium 入口、types 和 API docs 访问；私有 runtime 不进入
  公共声明或兼容性承诺。
- 每个 upstream-owned diff 都有已批准 SGP、成对 marker 或合法 manifest-only 记录；若最终
  upstream diff 为零，则明确记录无需新增 SGP。
- T1-T6 均完成 implementation、验证、architecture/code review、AgentDocs 回写和独立本地提交，
  且没有未处置 finding 或未链接的延期事项。

## 进度与交接

- `2026-08-07`：项目负责人与 Architecture Agent 完成总体范围讨论，确认 heightmap-first、
  provider/world ownership、imagery drape、异步 fallback、terrain query 与地下模式边界。
- `2026-08-07`：创建本中文版 extension plan；状态保持 `draft`，未创建任何 phase plan，未修改
  产品源码，也未建立 Worker、Shader 或 upstream patch 方案。
- `2026-08-07`：项目负责人明确批准并激活总体计划；从完成 checkpoint `14562040b2` 创建
  `feature/planar-terrain`，T1 进入架构讨论，但尚未创建 phase plan。
- `2026-08-07`：项目负责人确认 provider/data 分层、Cesium-compatible Heightmap 表示、
  Level-0 root、availability、ownership 和错误边界；ADR-0007 获批，T1 phase plan 激活。
- 下一步：Execution Agent 只实现 T1 纯 Core 公共类型与专项 Specs，回写结果并创建 pending
  review request 后停止。
- T1 architecture/code review 和独立本地提交完成前，不得设计或实现 T2，也不得修改
  upstream-owned file。
