# SceneGIS Planar World

## Metadata

| Field                  | Value                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Extension slug         | `planar-world`                                                                          |
| Status                 | `completed`                                                                             |
| Planning model         | `extension`                                                                             |
| Extension plan         | [Planar World extension plan](plans/2026-08-05-planar-world-extension.md) (`completed`) |
| Current phase          | None                                                                                    |
| Active phase plan      | None                                                                                    |
| Proposed phase plan    | None                                                                                    |
| Active standalone plan | None；[通用影像来源](plans/2026-09-18-imagery-protocols.md) 已验收完成                  |
| Architecture contact   | Architecture Agent                                                                      |
| Execution contact      | Execution Agent                                                                         |
| Last updated           | `2026-09-18`                                                                            |

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

2026-09-18：[通用影像来源](plans/2026-09-18-imagery-protocols.md) 独立增量实现完成，
对应 [ADR-0082](../../Documentation/SceneGIS/Decisions/ADR-0082-planar-imagery-protocols.md) 与
[技术自审](reviews/2026-09-18-imagery-protocols.md)。新增 WMS、WMTS KVP / REST、TMS metadata、SingleTile，
并扩展 URL tags。源码和 Specs 均在现有 SceneGIS Scene 目录；验收入口为
[影像服务](../../Test/Planar/影像服务.html)。upstream-owned files=0，SGP=None。
负责人已确认视觉验收通过，本项 completed；没有新 phase，没有提交、push 或发布。

### 已完成的 P1–P8 交接基线

- Current state: P1 through P8 are complete on `feature/planar-world`. P8 closes the approved first-version
  extension scope with local performance/lifecycle/package/upgrade qualification and adds no workflow,
  version/tag or npm publication.
- Next action: discuss a new extension plan separately. No later phase is active, and no push, tag or
  publication is implied by the P8 checkpoint.
- Current phase status: None. `P8-release-qualification` is `completed` and its review is `approved`.
- Open discussions: None. Confirmed boundaries are: extent crossing must clamp without home reset;
  terrain is deferred; underground navigation remains a future capability and current surface-side
  restrictions must not become permanent world invariants.
- Latest completed review:
  [P8 release qualification review](reviews/2026-08-06-p8-release-qualification.md)
  (`approved`).
- Current review: None.
- Unresolved reviews: None. P8-R001 through P8-R005 and all earlier findings are reviewer-confirmed
  `fixed`.
- Known risks: `Scene.js`, `CesiumWidget.js` and `Viewer.js` remain high-frequency upstream seams
  tracked by `SGP-0001`/`SGP-0002`; renderer, Camera and Viewer private semantics require an explicit
  upgrade checklist. Browser timing is noisy, so P8 combines same-machine release comparisons with
  deterministic resource/cache gates rather than absolute FPS. OpenStreetMap remains a manual signal;
  P8 automation uses local data. Existing TSD-JSDoc warnings and optional embedding download failures
  remain external/existing signals and must be reported separately.
