# P14 Planar Nanjing Public Data Review

## Metadata

- Type: `review`; status: `accepted`; created: `2026-09-12`
- Reviewer/implementer: current Architecture / Execution role
- Target: [P14 plan](../plans/2026-09-12-phase-p14-planar-nanjing-data.md)
- Predecessor: P13 `301916e4a5`
- Upstream-owned files / SGP delta: none

## Findings and disposition

- Fixed: maximumLevel 0/no providers meant no geographic context. The sample now
  creates existing planar URL-template providers using the canonical World
  scheme, levels 0–16, 256-pixel JPEG imagery and 257-sample LERC terrain. World
  lighting is enabled and source credits are visible.
- Fixed: the camera and astronomical reference targeted the original diagnostic
  origin. The camera now frames Zijin Mountain through explicit Web Mercator
  projection, while the environment directly consumes its WGS84 angles.
  Day/evening/night times shift to Beijing local time and UTC labeling is explicit.
- Fixed: the old high surface radiance overexposed satellite imagery. The sample
  initializes its existing scale property to 1; no renderer calibration changes.
- Verified: public errors set visible partial-data status and suppress retries,
  retaining the existing loaded-data/base-color/flat fallback. No engine fallback
  algorithm, new timer or silent provider replacement is introduced.
- Verified: the sample removes its provider listeners before Viewer destruction.
  These provider classes expose no destroy method; World releases its own tiles,
  requests and layers. The sample drops references afterward. Existing isolated
  model diagnostic coordinates and Globe behavior remain.

## Source and visual evidence

Direct service metadata was checked on 2026-09-12:
[World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer)
reports 102100/latestWkid 3857, 256-pixel JPEG XYZ tiles;
[Terrain3D](https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer)
reports the same spatial reference, LERC, levels 0–16 and heights -450 to 8700 m.
Its 257 boundary samples follow the already qualified Planar example/provider
configuration and are confirmed by successful live decoding/rendering.

The live page at projected camera (13229275.08, 3769331.15, 1200) visibly shows
the wooded mountain ridge, surrounding city and satellite texture under the
advanced sky/clouds. Its reference ground sample is approximately 439.82 m;
world.tilesLoaded is true, imagery/terrain failure flags are false, and sample
render errors are empty. Source attribution and loading status are visible.
Owner cloud coverage 0.24 is retained for this live view; surface scale is 1.

## Automated evidence

The extended [sample E2E](../../../Specs/e2e/scenegis-planar-environment-clock.spec.js)
passes in 26.5 s with all external requests blocked. It verifies provider types,
canonical tiling identity, enabled surface lighting, projected Nanjing camera,
explicit celestial angles, visible network-failure status with working scene,
Clock/Timeline pause/play/reverse/seek, cloud offset, local low-Sun/night geometry,
unchanged camera and zero provider/tick listeners after repeated destruction.

Scoped ESLint, formatting, whitespace and ownership audit pass. Full AgentDocs
Markdown lint passes; its full Prettier scan reports the same 16 unrelated
baseline files as P13, with no changed document warning. The brightness default
is visually verified through the existing property. No engine, shader, generated
output, public API or upstream file changes require another full build/type or
terrain decoder/performance matrix.

## Limits and handoff

Public service availability and regional source resolution remain external
dependencies. The sample preserves an explicit fallback and does not guarantee
fresh or survey-grade terrain. Level 16 is the selected sample budget. One
Nanjing astronomical reference illuminates the fixed-Z world; it does not infer
per-camera or per-tile astronomy. No unresolved finding blocks P14. Architecture
self-review and owner-delegated visual review accept the phase; the containing
commit is the independent local checkpoint. No push or successor activation.
