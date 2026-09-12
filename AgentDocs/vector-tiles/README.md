# Vector Tiles

## Metadata

| Field                  | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Extension slug         | `vector-tiles`                                         |
| Status                 | `active`                                               |
| Planning model         | `extension`                                            |
| Active extension plan  | [总体计划](plans/2026-09-12-vector-tiles-extension.md) |
| Current phase          | `V3A completed — 实现、自审与视觉验收通过`             |
| Active phase plan      | [V3A 计划](plans/2026-09-13-v3a-streaming-cover.md)    |
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
- Specs：Core/Scene 镜像测试，67 项通过。
- 当前能力：[VectorTiles](../../Documentation/SceneGIS/VectorTiles.md)。
- 人工页面：[Test/vector-tiles/index.html](../../Test/vector-tiles/index.html)，21 个本地 MVT fixtures。
- E2E：`Specs/e2e/scenegis-vector-tiles.spec.js`，2 项通过。
- Sandcastle：不新建；使用根服务器直接访问 `Test/**`。
- ADR：[ADR-0057](../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)。
- SGP：`SGP-0011`；upstream-owned files 为 `packages/engine/package.json`、`ThirdParty.extra.json`。
- V1 ADR：[ADR-0058](../../Documentation/SceneGIS/Decisions/ADR-0058-vector-tile-frontend-contract.md)。
- V2 ADR：[ADR-0059](../../Documentation/SceneGIS/Decisions/ADR-0059-planar-vector-tile-batch-renderer.md)；无新增 SGP。
- V3A ADR：[ADR-0060](../../Documentation/SceneGIS/Decisions/ADR-0060-vector-tile-resident-render-cover.md)；无新增 SGP。

## Current handoff

- 源码事实：[Cesium 与平面能力审计](discussions/2026-09-12-cesium-mvt-and-planar-audit.md)。
- 已解决 discussion：[实现边界与取舍](discussions/2026-09-12-rendering-boundaries.md)。
- 地形专题：[MapLibre 与 surface 方案](discussions/2026-09-12-maplibre-reference-and-surface.md)；
  共享 stencil 合批已证伪，surface-depth 凸体候选已有有限 WebGL 证据，生产资格属于 V4；无颜色 RTT。
- 当前 gate：V0 checkpoint `122cd2db2e`；V1 checkpoint `80089a0a91`，review 与提交 hook 均通过。
- V2 checkpoint：`a6e4383cfc`，项目负责人视觉验收与提交 hook 通过。
- V3A 已实现 resident coverage 与逐块替换，67 项 Specs 和 2 项页面 E2E 通过。
- 下一步：建立 V3A 独立 checkpoint，再审计并细化 V3B；V3B/C 尚未激活。
- Latest review：[V3A review](reviews/2026-09-13-v3a-cover-review.md)；V3A-R03 已由项目负责人确认通过。
- 风险：无历史数据/紧 cache 的缺图、mixed LOD 量化差异；V3B 线型/AA、V3C 密集性能、
  V4 生产贴地、V5 字体/跨瓦片 placement。V2-R05 已关闭，不重复验收 V2。
