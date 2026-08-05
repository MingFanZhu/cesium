# SceneGIS Planar World

## Metadata

| Field                  | Value                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Extension slug         | `planar-world`                                                                       |
| Status                 | `active`                                                                             |
| Planning model         | `extension`                                                                          |
| Active extension plan  | [Planar World extension plan](plans/2026-08-05-planar-world-extension.md) (`active`) |
| Current phase          | None (P4 completed; P5 not started)                                                  |
| Active phase plan      | None                                                                                 |
| Proposed phase plan    | None                                                                                 |
| Active standalone plan | None                                                                                 |
| Architecture contact   | Architecture Agent                                                                   |
| Execution contact      | Execution Agent                                                                      |
| Last updated           | `2026-08-06`                                                                         |

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
  `packages/engine/Source/SceneGIS/Scene/_private`
- Test paths: `packages/engine/Specs/SceneGIS/Scene`,
  `packages/engine/Specs/SceneGIS/Widget` and `packages/engine/Specs/SceneGIS/Core`
- Sandcastle: `packages/sandcastle/gallery/scenegis-planar-world` (not created)
- Branches: `scenegis/develop`; implementation branch `feature/planar-world`
- ADR:
  [ADR-0001 Scene primary world contract](../../Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md)、
  [ADR-0002 planar coordinate and tiling contract](../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)、
  [ADR-0003 planar surface runtime and LOD contract](../../Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md)、
  [ADR-0004 planar navigation and picking contract](../../Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md)
- SGP: `SGP-0001`（`active`）

## Current handoff

- Current state: P1 through P4 are complete on `feature/planar-world`; focused Architecture/code
  re-review confirmed P4-R001 through P4-R005 and approved the P4 implementation from base
  `4cfbf58a5658f57bba57e3ba8cd7e75ef9989439`.
- Next action: stop at the phase gate and discuss P5 scope with the project owner. No P5 plan or
  implementation is authorized until that discussion confirms the next phase.
- Current phase status: none; `P4-planar-navigation` is `completed` and P5 is not started.
- Open discussions: None; later-phase implementation details are intentionally deferred.
- Latest completed review:
  [P4 planar navigation review](reviews/2026-08-05-p4-planar-navigation.md) (`approved`)
- Pending review: None.
- Unresolved reviews: None; P4-R001 through P4-R005 are reviewer-confirmed `fixed`.
- Known risks: Cesium private Camera/frustum and CameraEventAggregator seams, plus Surface
  command-replay/derived-command behavior, require upgrade-auditable private containment.
