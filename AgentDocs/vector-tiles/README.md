# Vector Tiles

## Metadata

| Field                  | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| Extension slug         | `vector-tiles`                                            |
| Status                 | `active`                                                  |
| Planning model         | `extension`                                               |
| Active extension plan  | [总体计划](plans/2026-09-12-vector-tiles-extension.md)    |
| Current phase          | `V2 active — 架构验证准备`                                |
| Active phase plan      | [V2 计划](plans/2026-09-13-v2-planar-batch-and-ground.md) |
| Active standalone plan | None                                                      |
| Architecture contact   | 当前 Agent                                                |
| Execution contact      | 当前 Agent                                                |
| Last updated           | `2026-09-13`                                              |

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
- Source：`packages/engine/Source/SceneGIS/Core/SceneGISVectorTile*.js`，四个公共前端入口。
- Specs：`packages/engine/Specs/SceneGIS/Core/SceneGISVectorTile*Spec.js`，35 项通过。
- 当前能力：[VectorTiles](../../Documentation/SceneGIS/VectorTiles.md)。
- 人工页面与场景数据：计划使用 `Test/vector-tiles/`，有明确 HTML 入口，尚未创建。
- E2E：计划使用 `Specs/e2e/scenegis-vector-tiles*.spec.js`。
- Sandcastle：不新建；使用根服务器直接访问 `Test/**`。
- ADR：[ADR-0057](../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)。
- SGP：`SGP-0011`；upstream-owned files 为 `packages/engine/package.json`、`ThirdParty.extra.json`。
- V1 ADR：[ADR-0058](../../Documentation/SceneGIS/Decisions/ADR-0058-vector-tile-frontend-contract.md)。

## Current handoff

- 源码事实：[Cesium 与平面能力审计](discussions/2026-09-12-cesium-mvt-and-planar-audit.md)。
- 已解决 discussion：[实现边界与取舍](discussions/2026-09-12-rendering-boundaries.md)。
- 地形专题：[MapLibre 与 surface 方案](discussions/2026-09-12-maplibre-reference-and-surface.md)；
  优先验证矢量直接贴地；depth/stencil 为候选，批量正确性仍待证明，RTT 不作为主路线。
- 当前 gate：V0 checkpoint `122cd2db2e`；V1 checkpoint `80089a0a91`，review 与提交 hook 均通过。
- 下一步：按 V2 plan 先做真实 Context 的层序与 ground 合批实验，再冻结 renderer 契约与实现。
- V2 当前只有源码复查和计划，尚无地图渲染器、Test 页面或 ground batch 资格。
- Latest review：[V1 review](reviews/2026-09-13-v1-frontend-review.md)；无未解决 V1 gate finding，V2 ground 风险已显式分配。
- 风险：层序与 Cesium pass sorting、批量贴地、跨瓦片标注、字体/图标来源和性能验收集待细化。
