# Globe terrain clipping

## Metadata

- Extension slug: `globe-terrain-clipping`
- Status: completed; project owner approved submission
- Planning model: standalone
- Active standalone plan: None
- Completed standalone plan: [近景精度](plans/2026-10-26-near-field-precision.md)
- Active extension / phase plan: None
- Architecture / execution contact: Current agent
- Last updated: 2026-10-26

## Scope

维护原生 Globe 多边形地表裁剪的精度、曲面语义、可见性与资源生命周期。
保留真实地形、凹环、多区域和 inverse；不生成 SDK 坑壁，不通过扩大侧壁或全局关闭裙边掩盖缺口。

## Engineering links

- Native sources: `Scene/ClippingPolygonCollection.js`, `Shaders/GlobeVS.glsl`, `Shaders/PolygonSignedDistanceFS.glsl`
- Example: `Test/球面地表裁剪.html`
- Branch: `scenegis/develop`
- ADR / SGP: [ADR-0191](../../Documentation/SceneGIS/Decisions/ADR-0191-globe-clipping-precision.md), SGP-0070
- Specs: `packages/engine/Specs/SceneGIS/Scene/SceneGISGlobeClippingSpec.js`

## Current handoff

- Current state: Implementation and automated regression complete; project owner approved the local commit on 2026-10-26.
- Open discussion: None; [diagnosis](discussions/2026-10-26-coordinate-precision.md) resolved.
- Latest review: [implementation review](reviews/2026-10-26-near-field-precision.md).
- Known risks: Other GPU backends and large-region performance need separate representative-device validation.
- Related boundaries: [model clipping](../model-clipping/README.md), ADR-0081 / ADR-0189.
