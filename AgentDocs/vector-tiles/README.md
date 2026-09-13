# Vector Tiles

## Metadata

| Field                  | Value                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| Extension slug         | `vector-tiles`                                                                |
| Status                 | `active`                                                                      |
| Planning model         | `extension`                                                                   |
| Active extension plan  | [总体计划](plans/2026-09-12-vector-tiles-extension.md)                        |
| Current phase          | `V3C0 completed — 后继阶段尚未激活`                                           |
| Active phase plan      | None；最近完成 [V3C0](plans/2026-09-13-v3c0-public-map-and-style-baseline.md) |
| Active standalone plan | None                                                                          |
| Architecture contact   | 当前 Agent                                                                    |
| Execution contact      | 当前 Agent                                                                    |
| Last updated           | `2026-09-13`                                                                  |

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
- Specs：Core/Renderer/Scene 镜像测试，87 项通过。
- 当前能力：[VectorTiles](../../Documentation/SceneGIS/VectorTiles.md)。
- 人工页面：[城市](../../Test/vector-tiles/index.html) 与 [样式图集](../../Test/vector-tiles/styles.html)，
  21 个城市 MVT fixtures 加 1 个样式 MVT。
- 新页面：[公开地图](../../Test/vector-tiles/public.html)，默认 MapLibre 示例使用的 OpenFreeMap / Bright，
  保留 Liberty 对照，无需 token；来源和样式差距见 [参考](../../Test/vector-tiles/reference/README.md)。
- E2E：`Specs/e2e/scenegis-vector-tiles.spec.js`，3 项通过。
- 公开页 E2E：`Specs/e2e/scenegis-vector-public.spec.js`，2 项通过；使用本地数据拦截外网。
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
- Latest review：[V3C0 review](reviews/2026-09-13-v3c0-public-map-review.md)；
  自有命令继续复用 Cesium pick 派生；V3B0-R04 的临时线数学桥接已移除。
- 风险：dash 拐角变形与跨 tile 相位、无历史数据/紧 cache 的缺图、mixed LOD 量化差异；
  V3C1 密集性能、V4 生产贴地、V5 字体/跨瓦片 placement。
  V2-R05 与 V3B1-R08 已关闭。
