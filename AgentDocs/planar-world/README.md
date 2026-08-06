# SceneGIS Planar World

## Metadata

| Field                  | Value                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Extension slug         | `planar-world`                                                                        |
| Status                 | `active`                                                                              |
| Planning model         | `extension`                                                                           |
| Active extension plan  | [Planar World extension plan](plans/2026-08-05-planar-world-extension.md) (`active`)  |
| Current phase          | `P6-planar-viewer-integration` (`completed`)                                          |
| Active phase plan      | None                                                                                  |
| Proposed phase plan    | None                                                                                  |
| Active standalone plan | None                                                                                  |
| Architecture contact   | Architecture Agent                                                                    |
| Execution contact      | Execution Agent                                                                       |
| Last updated           | `2026-08-06`                                                                          |

允许的扩展状态为 `proposed`、`active`、`paused`、`completed` 或 `retired`。

## Scope

### In scope

- 为 CesiumJS 增加与 `Globe` 互斥的一级平面世界。
- 使用米制 `Cartesian3` 表达平面世界位置和高程。
- 支持配置严格正方形范围以及公开投影坐标系的标识和元数据。
- 使用一个 Level 0 根瓦片和标准四叉树细分。
- 提供平面地表、LOD、相机、拾取、栅格图层和资源生命周期闭环。
- 保持默认 Globe 场景的行为和公共 API 兼容性。

### Out of scope

- Globe 与 Planar World 运行时切换或同场混合。
- 运行时坐标重投影，以及度、英尺等非米制坐标输入。
- 非正方形世界范围、`SCENE2D` 和 `COLUMBUS_VIEW`。
- 第一版中的高程地形、地下模式和球面大气效果。
- 自动兼容所有 Globe imagery、terrain、Entity clamp 和 geocoder API。

## Engineering links

- Source paths: `packages/engine/Source/SceneGIS/Core`,
  `packages/engine/Source/SceneGIS/Scene/SceneGISWorld.js`,
  `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`,
  `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js` and
  `packages/engine/Source/SceneGIS/Scene/_private`, plus
  `packages/widgets/Source/SceneGIS` and the `SGP-0002` seam in
  `packages/widgets/Source/Viewer/Viewer.js`
- Test paths: `packages/engine/Specs/SceneGIS/Scene`,
  `packages/engine/Specs/SceneGIS/Widget`, `packages/engine/Specs/SceneGIS/Core` and
  `packages/widgets/Specs/SceneGIS`
- Sandcastle: `packages/sandcastle/gallery/scenegis-planar-imagery` (P5 implemented) and
  `packages/sandcastle/gallery/scenegis-planar-viewer` (P6 implemented)
- Branches: `scenegis/develop`; implementation branch `feature/planar-world`
- ADR:
  [ADR-0001 Scene primary world contract](../../Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md)、
  [ADR-0002 planar coordinate and tiling contract](../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)、
  [ADR-0003 planar surface runtime and LOD contract](../../Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md)、
  [ADR-0004 planar navigation and picking contract](../../Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md)、
  [ADR-0005 planar imagery runtime and composition](../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)、
  [ADR-0006 planar Viewer and widget integration](../../Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md)
- SGP: `SGP-0001`（`active`）；`SGP-0002`（`active`，仅跟踪 P6 `Viewer.js` 缝隙）

## Current handoff

- Current state: P1 through P6 are complete on `feature/planar-world`. The P5 base checkpoint is
  `ac56b9c6f79cf813e1c6b8208bfdf1138f2c4a4c`; P6 review is approved and its independent local
  Architecture checkpoint follows the completed phase conclusion.
- Next action: stop at the phase gate and discuss P7 with the project owner. No P7 plan is active or
  proposed, and no P7 implementation may begin yet.
- Current phase status: `P6-planar-viewer-integration` is `completed`.
- Open discussions: None; confirmed P6 decisions are recorded in ADR-0006. A generic planar base
  layer/provider picker is explicitly out of scope and remains application-specific.
- Latest completed review:
  [P6 planar Viewer integration review](reviews/2026-08-06-p6-planar-viewer-integration.md)
  (`approved`).
- Current review: None.
- Unresolved reviews: None; P1 through P6 findings are reviewer-confirmed `fixed`.
- Known risks: `Viewer.js` remains an upstream high-frequency file tracked by `SGP-0002`. Focused
  lifecycle evidence is approved. Architecture reproduced the two upstream Viewer timing failures,
  while clean P5/current P6 comparison runs passed `59/59` and Execution's final fix-state run passed
  `82/82`; they remain accepted local runner flakes rather than a P6 finding. The 8090 Sandcastle
  preview remains on its Bucket placeholder; OpenStreetMap remains a manual, non-CI signal. Existing
  TSD-JSDoc warnings and the optional embedding download are unchanged.
