# Vector Tiles

## Metadata

| Field                  | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Extension slug         | `vector-tiles`                                         |
| Status                 | `active`                                               |
| Planning model         | `extension`                                            |
| Active extension plan  | [总体计划](plans/2026-09-12-vector-tiles-extension.md) |
| Current phase          | `V3C1A completed — 低角度远景选层`                     |
| Active phase plan      | [V3C1A](plans/2026-09-13-v3c1a-tilted-distance.md)     |
| Active standalone plan | None                                                   |
| Architecture contact   | 当前 Agent                                             |
| Execution contact      | 当前 Agent                                             |
| Last updated           | `2026-09-13`                                           |

## Scope

实现类似 Mapbox 的矢量瓦片能力：MVT、声明式样式、按需调度、批量渲染、贴地和标注。
首个产品里程碑在 `SceneGISPlanarWorld` 验收，共享数据与样式前端考虑 Globe 复用。

已确认：完全独立于 Cesium 实验性 MVT 支持，包括 decoder、provider、vector glTF、
Buffer vector 与 VectorProvider 链路。MVT 解析保持 CRS 无关，tile matrix 限定 `1×1` root，
首轮使用 3857。参考用户已有 MapLibre 任意坐标系实现，见
[参考审计与地形讨论](discussions/2026-09-12-maplibre-reference-and-surface.md)。
用户优先要求保留矢量直接绘制并支持贴地，不采用先合成地图颜色纹理的主路线。

项目负责人本轮明确允许同一 Agent 讨论、设计并在讨论完成后编码。本扩展由当前 Agent
承担架构、执行与自审，保留阶段证据、人工视觉 gate 和独立本地 checkpoint；
不要求绑定第二个任务，不把自审描述为独立评审，也不改写其他扩展的双角色记录。

## Engineering links

- Branch：`feature/vector-tiles`。
- Base：本地 `scenegis/develop@e1244451613f4d0b8a5c6986f69ae56123d4267c`。
- Upstream：`1.144 / 6d5d8b1f0725b6f831b336463f4b11c98023427b`。
- Source：`packages/engine/Source/SceneGIS/Core/SceneGISVectorTile*.js` 和
  `packages/engine/Source/SceneGIS/Scene/SceneGISVectorTileLayer.js`，五个公共入口。
- Specs：Core/Renderer/Scene 镜像测试，131 项覆盖通过；V5A 另有 14 项既有 planar quadtree 回归通过。
- 当前能力：[VectorTiles](../../Documentation/SceneGIS/VectorTiles.md)。
- 人工页面：[城市](../../Test/vector-tiles/index.html) 与 [样式图集](../../Test/vector-tiles/styles.html)，
  21 个城市 MVT fixtures 加 1 个样式 MVT。
- 新页面：[公开地图](../../Test/vector-tiles/public.html)，默认 MapLibre 示例使用的 OpenFreeMap / Bright，
  保留 Liberty 对照，无需 token；来源和样式差距见 [参考](../../Test/vector-tiles/reference/README.md)。
- E2E：`Specs/e2e/scenegis-vector-tiles.spec.js`，3 项通过。
- 公开页 E2E：`Specs/e2e/scenegis-vector-public.spec.js`，3 项通过；使用本地数据拦截外网。
- Sandcastle：不新建；使用根服务器直接访问 `Test/**`。
- ADR：[ADR-0057](../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)。
- SGP：`SGP-0011`；upstream-owned files 为 `packages/engine/package.json`、`ThirdParty.extra.json`。
- V1 ADR：[ADR-0058](../../Documentation/SceneGIS/Decisions/ADR-0058-vector-tile-frontend-contract.md)。
- V2 ADR：[ADR-0059](../../Documentation/SceneGIS/Decisions/ADR-0059-planar-vector-tile-batch-renderer.md)；无新增 SGP。
- V3A ADR：[ADR-0060](../../Documentation/SceneGIS/Decisions/ADR-0060-vector-tile-resident-render-cover.md)；无新增 SGP。
- V3B1 ADR：[ADR-0062](../../Documentation/SceneGIS/Decisions/ADR-0062-vector-stroke-and-coverage.md)；无新增 SGP。

## Current handoff

- 源码事实：[Cesium 与平面能力审计](discussions/2026-09-12-cesium-mvt-and-planar-audit.md)。
- 已解决 discussion：[实现边界与取舍](discussions/2026-09-12-rendering-boundaries.md)。
- 地形专题：[MapLibre 与 surface 方案](discussions/2026-09-12-maplibre-reference-and-surface.md)；
  共享 stencil 合批已证伪，surface-depth 凸体候选已有有限 WebGL 证据，生产资格属于 V4；无颜色 RTT。
- 当前 gate：V0 checkpoint `122cd2db2e`；V1 checkpoint `80089a0a91`，review 与提交 hook 均通过。
- V2 checkpoint：`a6e4383cfc`，项目负责人视觉验收与提交 hook 通过。
- V3A 已实现 resident coverage 与逐块替换，67 项 Specs 和 2 项页面 E2E 通过。
- V3A checkpoint：`ad3ea51f13`，提交检查通过。
- [V3B0](plans/2026-09-13-v3b0-owned-primitives.md) 自有图元已实现并自审通过；
  71 项 Specs、2 项 E2E、构建/类型/release/安装包通过，延用 V3A 已验收视觉基线。
  Checkpoint：`d2667e6ad4`。
- [V3B1](plans/2026-09-13-v3b1-vector-style-primitives.md) 自有 stroke、dash 数值表、fill fringe 与
  circle blur 已实现；87 项 Specs 和 3 项 E2E 通过。项目负责人于 2026-09-13 确认
  新增样式图集验收通过，阶段与 review 已关闭；checkpoint：`e7be6ef61a`。
- 当前 [V3C0](plans/2026-09-13-v3c0-public-map-and-style-baseline.md) 已实现公开地图、
  Bright/Liberty、固定 Streets 离线参考、显式样式排除清单和真实负载测量；
  两项新 E2E 与 Bright 在线 smoke 通过，负责人于 2026-09-13 确认公开页并转入标注架构讨论。
  负责人已明确采用 MapLibre 示例来源，Mapbox 官方数据访问不再是阶段前提。
- 用户已明确：以 MapLibre 图形能力为目标，自有地图图元避免大量修改 Cesium native primitives。
  正式边界见 [ADR-0061](../../Documentation/SceneGIS/Decisions/ADR-0061-owned-vector-tile-primitives.md)。
- Latest review：[V3C1A review](reviews/2026-09-13-v3c1a-tilted-distance-review.md)；
  自有命令继续复用 Cesium pick 派生；V3B0-R04 的临时线数学桥接已移除。
- V3C0 checkpoint：`0bec9cbe56`，公开地图阶段独立提交和 hook 通过。
- Resolved discussion：[标注架构](discussions/2026-09-13-symbol-architecture.md)；
  已审计 MapLibre 资源/排版/placement/跨 tile 与 Bright 的 25 个 symbol layers。
  建议将平面点标注、沿线标注提前，地形标注在 V4 后验收；负责人已批准，进入 [V5A](plans/2026-09-13-v5a-point-symbols.md)，契约见 [ADR-0063](../../Documentation/SceneGIS/Decisions/ADR-0063-point-symbol-renderer.md)。
- V5A 已实现独立字体/图标资源、横排文字、统一 collision、跨 tile identity 和自有 GPU 图元；
  [本地点标注图集](../../Test/vector-tiles/symbols.html) 与公开地图 Bright/Liberty 各 15 个 point layers 已交付。
  108 项 Specs、7 项 E2E 已通过；北京 14 级 555 candidates / 278 placed，72 ranges，无资源失败。
  build/types/tsc/release/独立安装包、修改范围格式、全 AgentDocs Markdownlint 与上游审计通过。
  [正式点标注能力](../../Documentation/SceneGIS/VectorTileSymbols.md) 列出支持属性、缓存与失败语义。
- 风险：dash 拐角变形与跨 tile 相位、无历史数据/紧 cache 的缺图、mixed LOD 量化差异；
  V3C1 密集性能、V4 生产贴地、V5B 沿线与复杂 placement。
  V2-R05 与 V3B1-R08 已关闭。
- 浅俯角反馈已修正：负责人确认透视投影并要求遵循现有影像/地形选层。
  共享 planar SSE、预算内 mixed desired leaves、视轴交点 style 比例和不可见 point anchor 剔除已完成。
  126 项 Specs（112 vector + 14 planar quadtree）、8 项 E2E 通过；在线原 5° 视角保持中心/heading/zoom，
  64 tiles 横跨 level 3–14，无资源错误，CPU median/P95 10.3/11.8 ms。
  当前页面已刷新并保留该视角；见 [ADR-0064](../../Documentation/SceneGIS/Decisions/ADR-0064-vector-perspective-lod.md)。
- 负责人在修正交付后要求继续特殊标注，V5A 按推进授权关闭 gate；独立 checkpoint `50ab83b96f` 与 hook 通过。
- [V5B](plans/2026-09-13-v5b-line-symbols.md) 已实现逐字曲线、map/viewport 对齐、路牌、箭头、
  keep-upright、max-angle、间距和邻 tile 重复抑制；不做跨 tile 语义道路拼接。
  [沿线验收页](../../Test/vector-tiles/line-symbols.html) 完全本地；公开 Bright 118/119、Liberty 107/111 层。
  126 项 Specs、9 项页面 E2E、build/ESLint/tsc 通过；技术自审通过，负责人视觉 gate pending。
  正式决定见 [ADR-0065](../../Documentation/SceneGIS/Decisions/ADR-0065-line-symbol-placement.md)。
- 公开页按负责人最新要求采用 Viewer 默认持续渲染和原生 `debugShowFramesPerSecond`；
  已移除自定义 FPS 面板与渲染模式开关。原生 MS 是帧间隔，独立保留 60 帧 CPU 测量。
  相关公开页 3 项本地 E2E 与 ESLint 通过；V5B 视觉 gate 仍 pending。
- V5B 交互掉帧已复现并修正：预过滤/缓存、Camera 投影快照、稳定比例，以及单 style layer
  失效和 constant paint attributes；129 项 Specs、9 项 E2E 通过。实测对比与剩余边界见
  [V5B review](reviews/2026-09-13-v5b-line-symbol-review.md)，阶段仍等待负责人验收。
- 负责人追加远景注记筛选：透视 anchor 深度超过中心地面参考的四倍时整组剔除，
  相机接近后恢复；正交和俯视保持。柏林 5° 同视角去掉 34 个地平线远景标注，
  保留 87 个近景标注与 64 块地图瓦片；最新 engine 构建的 20 项 symbol Specs 通过。
  构建入口与完整证据见当前 review，视觉 gate 仍 pending。
- Resolved discussion：[平面远景加载范围](discussions/2026-09-13-planar-distant-tile-loading.md)。
  负责人要求保持浅俯角三维能力，在选取阶段限制远处瓦片，供 MVT、影像和地形共同使用。
  已完成共享四叉树、独立 MVT cover 和 terrain dependency 审计；建议保留粗远景、限制细分。
  负责人已批准低角度专用策略，当前实现与验证见 V3C1A。
- 负责人于 2026-09-13 批准实施远景处理，新增硬边界：只针对低角度倾斜视图，
  俯视拉远不能触发。V5B 按推进授权关闭 gate，先形成独立本地 checkpoint；
  上述 pending 记录为历史交付状态，当前以此结论与 completed review 为准。

- V5B checkpoint：`bb007b3518`；当前进入 [V3C1A](plans/2026-09-13-v3c1a-tilted-distance.md)，仅低角度透视启用共享细节距离，俯视拉远保持。
- V3C1A 已实现并技术自审通过，World 距离默认 Infinity；公开页启用 100000 米。
  197 项相关 Specs、131 项既有 vector 回归及 5 项页面 E2E 已覆盖通过，build / buildTs / tsc 通过。
  柏林 5° 的 MVT 64→47，surface 219→105，load dependencies 473→241；俯视拉远 keys 一致。
  新增 [本地地形/影像对照](../../Test/vector-tiles/distance.html)，详情与剩余近景性能风险见最新 review。
  负责人已明确要求推进异步 Worker，按推进授权关闭 V3C1A gate；先形成独立 checkpoint，再激活 V3C1B。
