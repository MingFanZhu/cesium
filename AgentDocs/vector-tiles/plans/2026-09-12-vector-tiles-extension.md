# Extension Plan: Vector Tiles

## Metadata

- Plan type: `extension`
- Status: `completed`（当前大阶段，按下述冻结范围）
- Owner role: `architecture`
- Architecture review: `approved`
- Architecture reviewer: 当前 Agent；项目负责人确认产品边界
- Created: `2026-09-12`
- Updated: `2026-09-17`
- Current phase: None；V3D1 建筑与贴地性能修正 completed
- Related discussions: [源码审计](../discussions/2026-09-12-cesium-mvt-and-planar-audit.md)、
  [实现边界](../discussions/2026-09-12-rendering-boundaries.md)、
  [MapLibre 与贴地](../discussions/2026-09-12-maplibre-reference-and-surface.md)、
  [标注架构提案](../discussions/2026-09-13-symbol-architecture.md)
- Related reviews: [收口评审](../reviews/2026-09-17-milestone-closeout-review.md)、[V0 review](../reviews/2026-09-12-v0-architecture-review.md)
- ADR: [ADR-0057](../../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)；既有依赖见下文
- SGP: SGP-0011（V1 独立样式依赖）、SGP-0012（G2 透明 Globe 集成）；本次收口无新增上游改动

项目负责人已批准阶段路线；稳定边界见 ADR-0057，各 phase 才冻结具体 API 和能力 profile。

## 当前大阶段收口

2026-09-17 负责人明确验收通过，关闭当前矢量瓦片加载大阶段。交付范围以
[VectorTiles](../../../Documentation/SceneGIS/VectorTiles.md) 的显式能力矩阵及已完成阶段为准：
独立 MVT/Style 前端、自有批量绘制、Worker 准备、流式 LOD、平面与 Globe 直接贴地、
点/沿线标注、当前可见地表的独立透明度、建筑拉伸及中文上手示例。

原 roadmap 尚未进入的 V3D 剩余样式、V4 扩展资格和 V5C 曲面标注范围明确 deferred；
原 V6 独立收口步骤由各阶段累计资格和本次收口评审替代，超出当前 profile 的资格仍 deferred。
这不表示实现全部 MapLibre 样式、任意文字系统或所有视角稳定 60 FPS。
当前无 active phase；后续激活须重审源码与保留 finding，详见[收口评审](../reviews/2026-09-17-milestone-closeout-review.md)。

## Objective

建立独立矢量瓦片 runtime，在 Cesium Scene 中按声明式样式显示成片的点、线、面和标注，
并具备流式加载、交互、贴地及可验证的资源生命周期。

项目负责人已确认完全不依赖 Cesium 实验性 MVT 支持。上游源码审计用于辨明边界，
不构成 decoder、vector GLB、Buffer collections 或 VectorProvider 的选型依据。
继续复用 Cesium 通用 Renderer/Scene 能力与已有 SceneGIS 世界契约，不另建平行引擎。

首个产品里程碑 `M1` 使用真正的 `SceneGISPlanarWorld`，不是 Cesium `SCENE2D` 或 Columbus View。
首轮使用 EPSG:3857 验收，坐标数学从一开始按任意米制平面 root extent 设计，
只接受 `1×1` root。切换 CRS 不改变 MVT 解码，但数据 tile matrix 必须与实际坐标范围匹配。
先验证 flat 底板；用户优先要求矢量直接贴地，不采用地图颜色 RTT 主路线。
V2 先验收 flat 并验证直接贴地可行性，V4/V5 完成 M1 的生产贴地和选定标注。
Globe 从数据/样式/调度职责分离开始考虑，实际渲染资格另设 gate。

## Non-goals

- 不承诺完整 Mapbox GL JS SDK、任意 style.json 或逐像素一致。
- 首轮不承诺 Mapbox Standard imports/slots/config、托管服务协议、任意重投影、
  全部 layer types、完整 transition 或任意文字系统。
- 不依赖或修改 Cesium 实验性 MVT decoder/provider/vector GLB/Buffer/VectorProvider 作为本扩展实现。
- 不通过逐 feature Entity 或逐 feature public planar wrapper 实现地图 batching。
- 不让 `Test/**` 承载产品实现或替代 Specs。
- 不修改已有平面 API；上游变动限经 SGP 登记的必要集成，生成产物不提交。

## Stable architecture boundaries

以下稳定边界已由用户批准并形成 ADR-0057；公共 API 与细化运行时协议在所属 phase 形成 ADR。

1. MVT tile-local 数据保持坐标中立；source tile matrix、coverage、world CRS/extent 和 render origin
   分别负责寻址、覆盖、应用坐标和 GPU 精度。先使用与 World 匹配的单根 matrix，
   不提前引入任意异构 matrix 重映射。不能从 opaque CRS 自动猜测变换。
2. 样式兼容前端、layout、paint、geometry batch 与 symbol placement 有独立失效边界；
   同一 source-layer 可被多个 style layer 使用。
3. Planar/Globe 共享数据与样式语义；坐标转换、可见性、terrain attachment 和必要 shader
   specialization 分开验证。共享层不依赖 world 或 ellipsoid 私有状态。
4. 只为当前视图及有限缓存创建 tile；request、decode、upload、placement 有预算。
   取消、过时 completion、replacement、eviction、destroy 有明确 ownership。
5. 批量是初始结构要求：按 tile/style layer/必要 render state 分组，保留 feature identity；
   不按每个属性值拆成逐 feature command，也不追求一条命令绘制整张地图。
6. 正确 layer order、alpha、tile coverage 和 pick 一起验收，不用任意 Z 偏移解决层序。
7. reference-plane geometry、直接贴地、point/symbol anchors 与抬升几何分别定义；
   depth/stencil 是直接贴地的优先验证候选，不能把现有 single instance 能力当作地图 batch 保证。
   地图颜色 RTT 不作为主路线；V3D1 已按 ADR-0074 接入相对地形的建筑拉伸，保留跨 tile anchor 边界。
8. 纯解码/数学在 Core，GPU 在 Renderer，Scene 集成在 Scene；
   不导入或复制 Cesium `Scene/decodeMVT.js`，独立解码前端的库选型在 V1 审计。

## Source and baseline facts

- 从本地 `scenegis/develop@e1244451613f4d0b8a5c6986f69ae56123d4267c` 创建
  `feature/vector-tiles`；初始 working tree 干净，未同步远端、未 push。
- 官方基线 `1.144 / 6d5d8b1f0725b6f831b336463f4b11c98023427b`。
- native MVT 已有解码、glTF/metadata、实验性 Buffer 和 Globe vector surface 链路；
  缺口见源码审计，不将它简单描述为“全无实现”。
- 平面已有 tiling、local-origin 精度、ordinary geometry、GPU ground 和 anchor pools；
  单 instance wrapper 不是 tile batch API。
- 用户提供的 MapLibre 任意坐标系实现已只读参考：
  [reference audit](../discussions/2026-09-12-maplibre-reference-and-surface.md)。
  其 `TileMatrixSet` 当前也是单 root；CRS 映射、MVT 解码、flat 与 terrain RTT 是分离职责。
- 依赖正式边界：
  [Architecture](../../../Documentation/SceneGIS/Architecture.md)、
  [ADR-0002](../../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)、
  [ADR-0017](../../../Documentation/SceneGIS/Decisions/ADR-0017-planar-content-qualification-and-batching-boundary.md)、
  [ADR-0018](../../../Documentation/SceneGIS/Decisions/ADR-0018-planar-public-primitive-and-geometry.md)、
  [ADR-0023](../../../Documentation/SceneGIS/Decisions/ADR-0023-planar-depth-stencil-ground-rendering.md)、
  [ADR-0027](../../../Documentation/SceneGIS/Decisions/ADR-0027-planar-terrain-worker-tasks-and-delivery.md)、
  [ADR-0030](../../../Documentation/SceneGIS/Decisions/ADR-0030-scenegis-shader-source-and-delivery.md)。

## Phase roadmap

| Phase | Objective                           | Dependencies                   | Entry gate                                 | Exit gate                                                                    | Status     | Phase plan                                                     |
| ----- | ----------------------------------- | ------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| V0    | 源码审计、边界讨论                  | 当前 develop                   | 干净基线与独立分支                         | 用户确认边界；ADR、review、本地 checkpoint                                   | completed  | [V0](2026-09-12-v0-architecture-audit.md)                      |
| V1    | MVT/source/style/坐标契约与兼容前端 | V0 checkpoint                  | 审计独立 decoder 候选、依赖与目标数据      | 数据/identity/诊断/坐标 Specs；公开入口和类型资格                            | completed  | [V1](2026-09-12-v1-vector-frontend.md)                         |
| V2    | 平面 flat 批量闭环与直接贴地可行性  | V1 checkpoint                  | 重查 primitive、pass、精度、pick           | flat 画面、层序、接缝、pick、销毁成立；ground 重叠/样式/拾取的最小证据与选择 | completed  | [V2](2026-09-13-v2-planar-batch-and-ground.md)                 |
| V3A   | 有界流式瓦片替换                    | V2 checkpoint                  | 重查 desired/render/cache 与裁剪           | ancestor/descendant 替换无重复覆盖；失败、空数据、取消与资源有界             | completed  | [V3A](2026-09-13-v3a-streaming-cover.md)                       |
| V3B0  | 自有地图图元与资源迁移              | V3A checkpoint                 | 用户明确自有图元方向；底层接口审计         | 已验收画面、覆盖与拾取保持；资源与包交付通过                                 | completed  | [V3B0](2026-09-13-v3b0-owned-primitives.md)                    |
| V3B1  | MapLibre 常见线型与 AA              | V3B0 checkpoint                | 自有图元就绪；重新冻结样式 profile         | cap/join/dash/AA 的画面、兼容诊断与资源通过                                  | completed  | [V3B1](2026-09-13-v3b1-vector-style-primitives.md)             |
| V3C0  | 公开地图与样式差距基线              | V3B1 checkpoint                | 固定实际数据来源与目标 style               | 在线 Test 页面、样式支持清单与真实负载基线；负责人视觉 gate                  | completed  | [V3C0](2026-09-13-v3c0-public-map-and-style-baseline.md)       |
| V5A   | 平面点标注                          | V3C0 checkpoint                | 独立 symbol 方向已批准                     | 中文/Latin、POI 图文、collision、跨 tile、pick/资源                          | completed  | [V5A](2026-09-13-v5a-point-symbols.md)                         |
| V5B   | 平面沿线标注                        | V5A checkpoint                 | 点标注资源和布局资格                       | 曲线文字、路牌、箭头、重复距离与缩放切换                                     | completed  | [V5B](2026-09-13-v5b-line-symbols.md)                          |
| V3C1A | 低角度远景共享选层                  | V5B checkpoint                 | 批准低角度专用距离，俯视拉远保持           | 选取/请求减少，完整粗覆盖，俯视一致，资源与视觉资格                          | completed  | [V3C1A](2026-09-13-v3c1a-tilted-distance.md)                   |
| V3C1B | 密集数据性能与必要线程              | V3C1A checkpoint               | 真实含标注负载                             | 字节预算、必要 Worker 与性能/资源资格                                        | completed  | [phase plan](2026-09-13-v3c1b-worker-preparation.md)           |
| V3C1C | 标注交互更新                        | V3C1B checkpoint               | 负责人批准持久布局、碰撞代理和分流 buffers | 当前帧绘制与拾取、布局收敛、资源和交互性能；负责人视觉 gate                  | completed  | [V3C1C](2026-09-13-v3c1c-symbol-motion.md)                     |
| V4A   | 平面真实贴地与公开地形开关          | V3C1C checkpoint               | 负责人批准，V2 证据已复核                  | 起伏/层序/pick/anchors/资源，技术 review 与负责人视觉 gate                   | completed  | [V4A](2026-09-13-v4a-planar-terrain.md)                        |
| V3D   | MapLibre / Streets 非标注样式增量   | V3C1C checkpoint               | 当前公开样式差距与资源预算已明确           | translate/anchor、map-aligned circle、pattern 的约定 profile、画面与资源资格 | deferred   | 未激活；V3D1 仅完成建筑子集                                    |
| V4    | 平面矢量直接贴地扩展资格            | V3D checkpoint                 | 重审 V4A/G1 之外的样式与地形范围           | 起伏地形、LOD/provider 变化下连续贴地；扩展样式与资源稳定                    | deferred   | V4A/G1 已完成；剩余范围保留                                    |
| V5C   | 地形标注扩展                        | V4 checkpoint                  | 重审已验收 anchor/遮挡与曲面字形差距       | 完整曲面字形、高程、遮挡、LOD 与标注稳定                                     | deferred   | 未激活                                                         |
| V6    | M1 平面交付资格                     | 原 V5C checkpoint              | 冻结支持矩阵与数据集                       | 当前范围由累计资格与收口评审承接；其余资格延期                               | superseded | [收口评审](../reviews/2026-09-17-milestone-closeout-review.md) |
| G1    | Globe 复用和资格验证                | V4A checkpoint，负责人提前授权 | 重审 ECEF、曲率、terrain、horizon          | 共享前端复用与 Globe 自身画面/资源验收                                       | completed  | [G1](2026-09-14-g1-globe.md)                                   |
| V4B   | 双世界高级环境接入                  | G1 checkpoint，负责人授权      | 审计物理光照与实际阴影 receiver            | 双世界光照/云影/HDR、生命周期、性能与视觉资格                                | completed  | [V4B](2026-09-14-v4b-environment.md)                           |
| V3C1D | 旋转标注持续性与开销                | V4B checkpoint，负责人反馈     | 南京水平绕转复现与 profile                 | 候选/布局/资源回归、同轨迹性能与视觉验收                                     | completed  | [V3C1D](2026-09-14-v3c1d-symbol-orbit.md)                      |
| E1    | 独立平面与球面上手示例              | V3C1D checkpoint，负责人要求   | 已有 runtime 资格与简化范围确认            | 中文双世界上手页、旧测试清理回归、技术自审与易读性验收                       | completed  | [E1](2026-09-14-e1-quickstart-examples.md)                     |
| G2    | Globe 当前可见地表透明              | E1 checkpoint                  | 负责人确认独立矢量层与可见面范围           | 地表/影像/矢量透明、拾取与资源资格                                           | completed  | [G2](2026-09-14-g2-surface-transparency.md)                    |
| G3    | 平面当前可见地表透明                | G2 checkpoint                  | 负责人要求平面复用                         | Planar opacity、深度、MSAA/HDR、拾取与资源资格                               | completed  | [G3](2026-09-14-g3-planar-transparency.md)                     |
| E2    | 中文上手示例透明度 GUI              | G3 checkpoint                  | 默认 lil-gui 与说明分块                    | 两世界示例、透明与生命周期资格                                               | completed  | [E2](2026-09-14-e2-example-opacity-gui.md)                     |
| V3D1  | 建筑拉伸与贴地性能修正              | E2 checkpoint                  | 负责人授权建筑能力                         | Worker 几何/贴地、实体绘制、交付与负责人验收                                 | completed  | [V3D1](2026-09-17-v3d1-fill-extrusion.md)                      |

V2 从开始就采用 tile batch 和 lazy scheduling；V3 完善质量与性能，不以逐 Entity 实现作为长期过渡。

以下保留路线调整的历史理由；当时的阶段顺序和将来时表述不覆盖上述最终状态。

V3C1D checkpoint `971a7b333b` 后，负责人要求先简化程序员上手示例；
进入 [E1](2026-09-14-e1-quickstart-examples.md)，只涉及 Test 与文档，不扩展 runtime 资格或后续 style 范围。
V2 验收后将 V3 分为 V3A/B/C：覆盖、样式与密集性能分别有独立的改动面和 gate，
保留原 V3 目标，按顺序形成可验证 checkpoint。用户进一步明确自有地图图元方向后，
V3B 拆为 V3B0 资源迁移与 V3B1 图形质量，两阶段均已完成，稳定产品目标不变。
负责人随后要求公开地图 Test 与默认样式渐进兼容，V3C 拆为 V3C0 数据/样式基线、
V3C1 字节预算与必要线程；V3D 根据实际差距补齐 MapLibre / Streets 非标注样式，
symbol 仍属于 V5，不把样式新增混入性能提交。
未来 phase 不预先锁定类名、Shader attributes、Worker payload 或 pass hook。
负责人批准将 V5 拆为 V5A 平面点标注、V5B 平面沿线标注和 V5C 地形标注；
执行顺序为 V5A → V5B → V3C1 → V3D → V4 → V5C → V6，各阶段仍独立 gate/提交。
V2 的直接贴地验证是后续地图架构的选择依据，不等于提前完成 V4 的生产能力。
V4 完成 M1 生产贴地资格；具体算法在 V2 依据最小证据确定。
不在批量验证失败时自动切换颜色纹理方案，应回到架构讨论处理确认的限制。

## Cross-phase validation

- Codec：本地合法/畸形 MVT、多 layer extent、多部件/孔洞/buffer、属性与 64-bit identity。
- Style：兼容矩阵每项行为有 fixture；unsupported 诊断定位到 layer/property/operator。
- 坐标：单 root、非零原点、大坐标、XYZ/TMS、source/world matrix 匹配、
  不同 root extent 的相同 tile-local 数据映射、共享边、pixel width/style zoom。
- 渲染：fill/line/circle 层序、alpha、接缝、pick；flat 与 terrain 使用独立预期。
- 流式：空瓦片/失败/取消、过时结果、pan/zoom/overzoom、cache bound、增删与 destroy。
- 性能：固定设备/浏览器/viewport/build/数据，记录 loading/warm/mutation 的 median/P95、
  command 数、CPU/GPU bytes 和资源平衡。具体预算由相应 phase 基于数据确定。
- 交付：公共 API 改动运行 build/build-ts/tsc；Shader/Worker/依赖涉及 release、
  installed tarball 与资源 URL；纯讨论文档不运行完整产品资格矩阵。
- `Test/**` 遵守 [Test/AGENTS.md](../../../Test/AGENTS.md)，单 ESM runtime、根服务器直达；
  行为自动化保留在 Specs/E2E。

## Global risks and dependencies

- MVT、Style JSON、数据 schema、服务协议、视觉一致性是不同兼容承诺，必须分别列矩阵。
- Cesium pass/frustum sorting 不保证 painter order；共享 stencil 的要素归属、重叠 alpha、
  像素线宽与线型、pick 和 command 数是直接贴地的关键风险，V2 提前验证。
- glyph、shaping、sprite DPI、沿线排布和跨瓦片 identity 不因已有 LabelCollection 自动解决。
- tile buffer、线端/join、父子覆盖切换和 alpha 必须共同处理。
- 新 Worker entry 需 ADR/所有权审计；新增依赖若改上游 package/lockfile，需 SGP manifest-only。
- Globe 曲率/遮挡/高程不能从 Planar 测试推断，G1 单独验收。
- 用户新增公开数据与默认样式渐进目标，随后明确采用 MapLibre 参考项目的示例来源：
  OpenFreeMap / Bright 为街区基线、Liberty 作对照，无需 token。
  Streets v12 单文档仅保留离线差距参考；Standard imports/config/slots 与官方托管数据不在本轮。
  CI 继续使用本地确定性 fixtures，字体集仍待选。

## Overall acceptance criteria

本次交付准确兼容矩阵、稳定入口、`Test/vector-tiles/` 平面和 Globe 地图、
有界瓦片调度与 batch runtime，以及各阶段行为、资源、性能和包交付证据。
约定直接贴地、点/沿线标注、可见地表透明和建筑均已完成技术与负责人验收；
最终资格及剩余风险集中在收口评审。未承诺全驻留内存硬字节上限、任意字体或全部 Mapbox 能力。

共享数据/样式前端与两个世界的几何、地形及遮挡职责分别验证。Globe 已由 G1 及后继阶段独立验收，
不从平面结果推断球面资格。当前收口仅覆盖实际实现且验收的 profile，后续范围由负责人重新授权激活。

## Progress and handoff

以下为历史记录；最新状态以顶部收口段落和收口评审为准。

V0 checkpoint 为 `122cd2db2e`；V1 checkpoint 为 `80089a0a91`，前端实现与资格通过，见
[V1 review](../reviews/2026-09-13-v1-frontend-review.md)。V2 已建立基于当前源码的
[phase plan](2026-09-13-v2-planar-batch-and-ground.md)，已完成 flat 候选与自动验证，
项目负责人于 2026-09-13 确认实际画面验收通过，见 [V2 review](../reviews/2026-09-13-v2-flat-review.md)。
共享 stencil 地图合批已证伪，surface-depth 凸体候选保留为 V4 入口；
不把有限地形实验描述为已支持公共 terrain 模式。
V2 checkpoint 为 `a6e4383cfc`；V3A 的 67 项 Specs / 2 项页面 E2E、实现与自审均已通过，
项目负责人确认加载过渡画面通过，见 [V3A review](../reviews/2026-09-13-v3a-cover-review.md)。
V3A checkpoint 已形成：`ad3ea51f13`。V3B0 按 ADR-0061 完成，71 项 Specs、2 项 E2E
与构建/类型/release/安装包通过，见 [V3B0 review](../reviews/2026-09-13-v3b0-owned-primitives-review.md)。
V3B0 checkpoint 为 `d2667e6ad4`。V3B1 自有 stroke、虚线、fill/circle coverage 已实现，
87 项 Specs 与 3 项页面 E2E 通过；负责人于 2026-09-13 确认新增样式图集验收通过，见
[V3B1 review](../reviews/2026-09-13-v3b1-style-primitives-review.md)。
V3B1 checkpoint 为 `e7be6ef61a`；V3C0 公开页和样式基线已实现，
2 项新 E2E 与 OpenFreeMap 真实在线检查通过，负责人已于 2026-09-13 确认公开页。
负责人已选择 MapLibre 示例来源，Mapbox token 不再构成前提；
具体边界见 [V3C0 review](../reviews/2026-09-13-v3c0-public-map-review.md)。
此阶段独立提交完成后再依据实测负载细化 V3C1，不把样式接入扩大为密集性能或后续 terrain/symbol 资格。
V3C0 checkpoint 已形成：`0bec9cbe56`。负责人随后要求讨论标注实现；
[标注架构提案](../discussions/2026-09-13-symbol-architecture.md) 建议把 V5 的平面部分提前，
负责人已批准方案与顺序：V5A → V5B → V3C1 → V3D → V4 → V5C。
V5A 已独立提交 `50ab83b96f`；当前 V5B 已实现并技术自审通过，126 项 Specs 与 9 项 E2E 通过，
等待新沿线图集与公开道路/路牌/箭头画面的负责人视觉 gate。
交互验收随后复现掉帧，已在 V5B 内修正重复样式/布局与 GPU 重建；129 项 Specs、9 项 E2E 通过，
不提前激活 V3C1 的通用 Worker/字节预算。性能对比和剩余事项记录在当前 V5B review。
负责人又要求隐藏浅俯角远景注记；V5B 已加透视相对深度筛选，保留近景与地图 cover，
131 项 vector Specs 已覆盖通过，仍由当前 review 记录视觉 gate。
负责人进一步要求平面远景加载在瓦片选取阶段受限，并供影像/地形复用，同时保留近水平视角。
已建立[共享加载范围讨论](../discussions/2026-09-13-planar-distant-tile-loading.md)，
推荐远处保留粗覆盖、限制细分；当前未改变选取或加载行为，未激活下一 phase。
范围契约确定后据此调整 V3C1 的 entry / scope，并先完成 V5B 独立 checkpoint。
后续 ground 算法/资产选择按 roadmap 分配到对应 phase，不重复请求已批准架构方向的确认。

负责人于 2026-09-13 批准实施共享远景限制，并要求仅在低角度倾斜启用、俯视拉远保持现有行为。
V5B 按继续授权关闭 gate，先形成独立 checkpoint；下一阶段以该硬边界细化选层方案。

V5B checkpoint 已完成：`bb007b3518`。V3C1 按负责人批准细分为 V3C1A 共享低角度选层和 V3C1B 原定密集预算/必要线程；当前只激活 [V3C1A](2026-09-13-v3c1a-tilted-distance.md)，后者保留 planned，V3D 仍依赖性能阶段完成。

V3C1A checkpoint：`413b7ffcc6`。Worker 迁移按负责人授权进入 [V3C1B](2026-09-13-v3c1b-worker-preparation.md)。

V3C1B checkpoint：`065c345efd`。负责人批准新增 [V3C1C](2026-09-13-v3c1c-symbol-motion.md)，专门处理 placement、collision proxies 与 static/dynamic buffers；V3D 顺延到 V3C1C checkpoint 后，不提前实施底图命令/深度优化。

负责人于 2026-09-13 确认 V3C1C 验收通过，技术 review 与视觉/交互 gate 已关闭；实现、Specs、
ADR 与 AgentDocs 作为独立本地 checkpoint 提交。当前未激活下一 phase，地形共存仍以 V4 的
生产资格为边界，不能由 flat 地图或共享选层推断已完成。

负责人最新明确授权真实贴地，当前提前激活 [V4A](2026-09-13-v4a-planar-terrain.md)：平面 ground 后端、terrain anchors 与公开页开关。V3D 仍 planned；完整地形字形质量由 V5C 承接，Globe 仍为 G1。执行顺序调整为 V3C1C → V4A → V3D → 剩余 V4/V5C → V6，各阶段独立 gate。

负责人于 2026-09-14 通过 V4A，并明确提前推进 Globe；V4A checkpoint 为 `a961ff4ccb`。当前激活 G1，原平面 M1 未完成事项保留，不以 Globe 工作标记其完成。

负责人于 2026-09-14 确认 G1 性能修正已可接受，技术 review 与视觉/交互 gate 关闭；G1 形成独立本地
checkpoint，当前没有 active phase。未完成字体、曲面字形、帧时尾部与高级环境集成资格继续保留，
不以本阶段验收代替 V4/V5C/M1。当前 hillshade/光照问题是能力边界说明，不激活新实现阶段。

G1 checkpoint 为 `a2f71e1120`。负责人授权后推进 V4B，接入双世界实际物理光照、云影与 Globe
定向几何阴影，补充环境参数面板及 native Timeline/Animation；实现、Specs、页面回归、构建/类型/
发布包验证通过。负责人于 2026-09-14 明确手动检查通过，V4B completed，并形成独立本地 checkpoint。
当前没有 active phase；近地平线性能、Planar native geometry-shadow 等剩余范围见
[V4B review](../reviews/2026-09-14-v4b-environment-review.md)，不以本阶段验收标记 M1 完成。

G2 已获授权并 active：[透明地表阶段](2026-09-14-g2-surface-transparency.md)，独立矢量 alpha 与球面当前可见面的透明适配；背面和地下后续扩展。
G2 技术资格通过，负责人要求平面也支持透明，按推进授权 completed；独立 checkpoint 后开展 Planar 后继阶段。
G2 checkpoint：`9e33cbd279`。当前 [G3](2026-09-14-g3-planar-transparency.md) active，限定平面当前可见地表的独立颜色透明。
G3 技术资格通过，负责人确认并要求继续整理示例，按推进授权 completed，先独立 checkpoint。
G3 checkpoint：`1e84903262`。当前 [E2](2026-09-14-e2-example-opacity-gui.md) active，仅补充上手示例 lil-gui 矢量透明度控件。
E2 实现及技术自审通过，3 项上手 E2E 和双世界实际页面检查通过；负责人视觉 gate pending，验收后独立 checkpoint。

2026-09-17 负责人授权建筑拉伸，E2 按推进授权 completed；先独立 checkpoint，再进入样式扩展。

E2 checkpoint：`cae5a711bf`。负责人授权 [V3D1](2026-09-17-v3d1-fill-extrusion.md) active，补齐建筑 fill-extrusion。

V3D1 实现及技术自审通过：193 项独立 vector Specs、6 项相关 E2E、完整构建/类型与实际包通过。
双世界和原测试页已接入楼栋，支持高度/底高/颜色/透明度/垂直渐变；全部 SceneGIS-owned，无 SGP。
负责人视觉 gate pending，验收后独立 checkpoint，未进入下一阶段。
