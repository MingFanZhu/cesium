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
  soft-private package边界、product runtime delta=`0`和zero-upstream delivery通过。
