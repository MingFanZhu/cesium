# SceneGIS Planar Viewer Bootstrap

## Metadata

| Field                  | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| Extension slug         | `planar-viewer-bootstrap`                                         |
| Status                 | `active`                                                          |
| Planning model         | `extension`                                                       |
| Active extension plan  | [总体计划](plans/2026-08-14-planar-viewer-bootstrap-extension.md) |
| Current phase          | Between phases                                                    |
| Active phase plan      | None                                                              |
| Active standalone plan | None                                                              |
| Architecture contact   | Architecture Agent                                                |
| Execution contact      | Execution Agent                                                   |
| Last updated           | `2026-08-14`                                                      |

## Scope

### In scope

- 让应用可通过 `new Viewer(container, { planarWorld: {...} })` 声明平面 extent、opaque CRS 和
  `SceneGISPlanarWorld` 构造参数，不再手工嵌套创建 Extent、CoordinateSystem 与 World。
- 保留现有 `Viewer({ world: liveSceneGISPlanarWorld })` 高级入口和全部 planar Viewer capability guards。
- 公开 Viewer 创建后的 resolved planar World，并保持 Scene 对 primary world 的既有唯一所有权与销毁顺序。
- 使用 SceneGIS-owned helper 承担对象组装，继续把 upstream `Viewer.js` 限制为 `SGP-0002` 的窄集成缝隙。

### Out of scope

- 不从 CRS 字符串推断 extent、单位、maximum level、provider、天文原点或环境参数。
- 不在 Viewer 构造器中接受影像/地形 URL schema、provider factory、异步 loader 或 token。
- 不自动创建或注册 `SceneGISPlanarEnvironment`、SkyBox、Material 或应用数据。
- 不扩大到 `CesiumWidget` 声明式 bootstrap、generic custom World、运行时 World 切换或 Globe/planar 混合。
- 不在本扩展补齐 3D Tiles、格式自动转换、split/cutout、阴影、天气等独立候选能力。

## Engineering links

- Product paths: `packages/widgets/Source/Viewer/Viewer.js`、
  `packages/widgets/Source/SceneGIS/**`
- Test paths: `packages/widgets/Specs/SceneGIS/**`、`Specs/e2e/scenegis-planar-release.spec.js`
- Direct example: `Test/平面环境.html`
- Branch: `feature/planar-viewer-bootstrap`
- Base checkpoint: `685a3bb06e54243706e1b73caef5833d48bdf197`
- Parent extensions: completed `planar-world`、`planar-terrain`、`planar-content`、
  `planar-terrain-advanced`、`planar-surface-styling`、`planar-environment`
- ADR: amend `ADR-0006`；不预设新 ADR
- SGP: reuse active `SGP-0002` only in upstream-owned `Viewer.js`

## Current handoff

- Current state: V1声明式helper、Viewer SGP-0002 integration、focused Specs、direct Test迁移、formal docs与installed delivery
  已实现并验证；Architecture/code review无finding，项目负责人manual gate通过，等待独立本地checkpoint。
- Next action: Architecture创建V1独立checkpoint，然后审计Cesium public API中的球面假设与planar融合缺口，再建立V2
  confirmed phase plan。
- Current phase status: V1=`completed`；V2=`proposed`。
- Open discussions: None。
- Latest review:
  [V1 approved review](reviews/2026-08-14-v1-declarative-planar-world-bootstrap.md)（manual gate passed）。
- Unresolved reviews: None。
- Known risks: `Viewer.js` 是高频 upstream seam；声明式构造必须在 DOM/WebGL mutation 前完成确定性 validation，并保持现有
  live-world、Globe、controller、Home、DataSource 和 destroy 行为。
