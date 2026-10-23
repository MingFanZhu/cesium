# SceneGIS Planar World

## Metadata

| Field                  | Value                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Extension slug         | `planar-world`                                                                          |
| Status                 | `completed`                                                                             |
| Planning model         | `standalone`                                                                            |
| Extension plan         | [Planar World extension plan](plans/2026-08-05-planar-world-extension.md) (`completed`) |
| Current phase          | None                                                                                    |
| Active phase plan      | None                                                                                    |
| Proposed phase plan    | None                                                                                    |
| Active standalone plan | None；[地形深度测试](plans/2026-10-23-terrain-depth-test.md) 已完成并通过视觉验收       |
| Architecture contact   | Architecture Agent                                                                      |
| Execution contact      | Execution Agent                                                                         |
| Last updated           | `2026-10-23`                                                                            |

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

2026-10-23：按负责人要求补齐 `depthTestAgainstTerrain`。默认 true，复用原生
classification→depth clear 和延迟地形深度，见[独立计划](plans/2026-10-23-terrain-depth-test.md)、
[ADR-0185](../../Documentation/SceneGIS/Decisions/ADR-0185-planar-terrain-depth-test.md)。
SGP-0001 跟踪唯一上游修改 Scene.js。专项 dev/release GPU 各 7/7、World 共 54/54、
贴地 21/21、注记 8/8、两项浏览器对照与完整构建/类型检查通过，见
[技术自审](reviews/2026-10-23-terrain-depth-test.md)。Globe 30/31，旧云测试失败已在原源码复现。
2026-10-23 负责人确认本地[开关示例](../../Test/地形深度测试.html) 验收通过，
并要求在 scenegis/develop 形成独立本地提交；未要求推送。
默认 true；pickPosition 保留原生深度合并边界。既有视觉未决事项保持。

2026-10-22：平面影像已接入原生 `SplitDirection` / `scene.splitPosition`。
沿用单地表绘制与原有 SSE/加载，不裁掉地表深度。67 项 Specs、两项 dev/release
真实浏览器分屏检查、完整 build/release/types/tsc 通过；见[技术自审](reviews/2026-10-22-imagery-split.md)。
本地[影像分屏示例](../../Test/Planar/影像分屏.html) 待负责人验收。无上游/SGP 改动；
负责人随后要求在 `scenegis/develop` 形成本地提交检查点，未要求推送。

2026-10-15：负责人已确认 [局部影像与最低层级契约](discussions/2026-10-15-sparse-imagery-confirmed-contract.md)
（`resolved`）：覆盖范围由 SDK 配置，数据层级连续，tile HTTP 404 表示缺图；
实际地表层级低于 minimumLevel 时不请求、不显示该影像层，只允许子层采样合法父层，不反向拼接子图。
全球原始 XYZ 与 canonical scheme 保持，沿用单图 binding / 单地表 command。
原 [设计初评](discussions/2026-10-15-sparse-imagery-minimum-level.md) 标记 superseded；
其中绘制分区、overview/mosaic、跨层缺口和新增远景预算策略不进入本次实现范围。
负责人已确认视觉验收通过，[standalone plan](plans/2026-10-15-sparse-imagery.md) 已完成，
[ADR-0162](../../Documentation/SceneGIS/Decisions/ADR-0162-planar-sparse-imagery.md) 固化本次契约；
实现与自动化验证已完成，见 [技术自审](reviews/2026-10-15-sparse-imagery.md)。
新增 dev/release E2E 通过，既有 3 项 Specs 与旧协议案例颜色失败已用基线复现；
2026-10-15 负责人确认 [局部影像](../../Test/Planar/局部影像.html) 视觉验收通过，SI-R02 已关闭，review approved。
负责人授权本增量在 scenegis/develop 形成独立本地提交；既有 completed 阶段不重开。

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
