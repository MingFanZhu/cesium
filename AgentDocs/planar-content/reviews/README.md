# Reviews

本目录保存 `planar-content` 的 architecture、code、test 和 delivery review。

- [C1 content contract review](2026-08-09-c1-content-contract.md)（`approved`）：private position
  resolver、HeightReference/resident fallback、atomic result、compatibility guide、private generation
  与zero-upstream evidence均通过；无阻断项。
- [C2 anchor and model review](2026-08-09-c2-anchor-and-model.md)（`approved`）：C2-R001～C2-R006均经
  focused re-review关闭；Anchor、Model、四类real Context及zero-upstream边界通过。
- [C3 polyline and polygon review](2026-08-09-c3-polyline-polygon.md)（`approved`）：C3-R001～C3-R003
  均经focused re-review关闭；真实add-event rollback、integer width、静态warm dirty/copy与
  zero-upstream边界通过。
- [C4 Entity/DataSource/Viewer integration review](2026-08-09-c4-entity-datasource-viewer-integration.md)
  （`approved`）：C4-R001～C4-R004经focused re-review关闭；正式World liveness、收窄动态profile保证、
  真实per-DataSource target/order、第三个child rollback及`SGP-0001`边界通过。
- [C5 dynamic performance and delivery review](2026-08-09-c5-dynamic-performance-and-delivery.md)
  （`approved`）：C5-R001～R003经focused re-review关闭；moderate qualification、异步Sandcastle controls、
  soft-private package边界、product runtime delta=`0`和zero-upstream delivery通过；项目负责人真实浏览器/GPU
  人工验收通过。
- [C6 public planar Primitive/Geometry review](2026-08-09-c6-public-planar-primitive-and-geometry.md)
  （`approved`）：C6-R001～C6-R004全部关闭；desired/current原子状态、collection异常回滚、required
  id/attribute preservation与integer representability、fixed geometry kind及zero-upstream边界通过。
- [C7 common solid and area graphics review](2026-08-09-c7-common-solid-and-area-graphics.md)
  （`approved`）：C7-R001～C7-R005经focused re-review关闭；Plane basis、cone outline、dynamic topology、
  condition snapshot、rotation/color/depth closure与zero-upstream边界通过。
- [C8 route-derived geometry and path review](2026-08-10-c8-route-derived-geometry-and-path.md)
  （`approved`）：C8-R001～C8-R004经focused re-review关闭；world-origin replacement、clockwise shape
  canonicalization、non-axis reversal、stationary Path lifecycle与zero-upstream边界通过。
- [C9 continuous ground and Ground Primitive review](2026-08-10-c9-continuous-ground-and-ground-primitive.md)
  （`approved`）：C9-R001～C9-R006经focused re-review全部关闭；常规257×257 bounded drape、Polygon
  clipping/derived heights、ground extrusion outline、current bounds、same-frame/stale pick-depth与public attribute
  preflight均通过，保持zero-upstream/zero-SGP。
- [C10 unified integration and delivery review](2026-08-10-c10-unified-integration-and-delivery.md)
  （`approved`）：C10-R001～C10-R004经focused re-review关闭；durable rules、Ground render/depth闭环、八role
  GPU pick/Viewer selection、package exact export set及zero-runtime/zero-upstream交付边界通过，待项目负责人人工验收。
- [C11 planar depth/stencil ground rendering review](2026-08-10-c11-planar-depth-stencil-ground-rendering.md)
  （`approved`）：C11-R001～C11-R008全部关闭；direct Primitive caller-owned Entity metadata、真实GPU pick、
  InfoBox及finite SelectionIndicator闭环通过，项目负责人真实浏览器/GPU人工验收通过。
