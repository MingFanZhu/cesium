# 平面 GeoJSON

## Metadata

| Field                  | Value            |
| ---------------------- | ---------------- |
| Extension slug         | `planar-geojson` |
| Status                 | `completed`      |
| Planning model         | `standalone`     |
| Active extension plan  | None             |
| Current phase          | None             |
| Active phase plan      | None             |
| Active standalone plan | None             |
| Architecture contact   | Current task     |
| Execution contact      | Current task     |
| Last updated           | `2026-10-20`     |

## Scope

### In scope

- 原生 `GeoJsonDataSource.load/process` 显式平面坐标入口，复用解析、样式、事件和 Entity。
- 普通与贴地点线面、多几何、孔洞、属性和拾取；已有平面 Viewer 取景与生命周期。

### Out of scope

- 隐式 CRS 推断、运行时 world 切换、球面弧线、CZML/KML、新渲染后端或跨 Entity 合批。

## Engineering links

- Source: `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarGeoJson.js`
- Specs: `packages/engine/Specs/SceneGIS/DataSources/SceneGISPlanarGeoJsonSpec.js`
- E2E: `Specs/e2e/scenegis-planar-geojson.spec.js`
- Example: `Test/平面GeoJSON.html`；不新增 Sandcastle。
- Branch: `feature/planar-geojson`
- ADR: [ADR-0172](../../Documentation/SceneGIS/Decisions/ADR-0172-planar-geojson-loading.md)
- SGP: `SGP-0062`
- Completed plan: [Native loading](plans/2026-10-20-native-loading.md)

## Current handoff

- Current state: 显式 native loader 与 planar gate 已实现，单元、浏览器、类型及完整 release 验证通过。
- Next action: 实现、验证与 review 已达到独立本地提交条件；项目负责人可在新 Test 页面验收。
- Current phase status: None。
- Open discussions: None
- Unresolved reviews: None
- Latest review: [Native loading](reviews/2026-10-20-native-loading.md)，approved。
- Known risks: 显式投影由调用方负责；已有几何 profile 与 native load 的非事务错误行为不扩宽。
