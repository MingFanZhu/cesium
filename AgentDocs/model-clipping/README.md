# Model polygon clipping

## Metadata

- Extension slug: `model-clipping`
- Status: `completed; project owner authorized commit`
- Planning model: `standalone`
- Active standalone plan: None
- Latest standalone plan: [Planar polygons](plans/2026-10-23-planar-polygons.md)
- Active extension / phase plan: None
- Architecture / execution contact: Current agent
- Last updated: `2026-10-23`

## Scope

原生 Model / Cesium3DTileset 在 Planar World 中消费米制 XY 多区域裁剪；复用地形算法和原生集合 API。
不涉及 SDK、坐标重投影、封口、Entity 新字段或分类模型支持扩展。

## Engineering links

- Source: `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarModelClipping.js`
- Specs: `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarModelClippingSpec.js`
- Example: `Test/Planar/模型多区域裁剪.html`
- Branch: `scenegis/develop`
- ADR: [ADR-0189](../../Documentation/SceneGIS/Decisions/ADR-0189-planar-model-clipping.md)
- SGP: `SGP-0068`

## Current handoff

- Current state: implementation and browser verification complete; project owner requested a local commit on `scenegis/develop`.
- Next action: no remaining implementation work in this standalone plan; retain the documented maintenance follow-ups.
- Open discussions: None.
- Latest review: [Planar polygons](reviews/2026-10-23-planar-polygons.md).
- Known risks: fragment work grows with polygon edge count; large datasets need representative profiling.
  One existing terrain skirt pixel test fails identically before this change; follow-up evidence and
  terrain maintenance ownership are recorded in the review.
