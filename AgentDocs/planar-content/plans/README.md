# Plans

本目录保存 `planar-content` 的 extension plan 和后续 phase plan。总体计划只记录稳定目标、边界、
阶段依赖与整体验收；进入每个阶段前才依据届时源码创建详细 phase plan。

当前 extension plan：
[SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)（`active`）。

当前 active phase plan：None；下一步创建C11 planar depth/stencil ground rendering phase plan。

已完成：
[C10 统一集成、Compatibility Matrix 与交付](2026-08-10-phase-c10-unified-integration-and-delivery.md)
（`completed`；作为自动化交付baseline，最终人工验收由项目负责人架构决定转移到C11）、
[C9 Continuous Ground 与 Planar Ground Primitive](2026-08-10-phase-c9-continuous-ground-and-ground-primitive.md)
（`completed`）、
[C8 路径衍生 Geometry 与动态 Path](2026-08-10-phase-c8-route-derived-geometry-and-path.md)
（`completed`）、
[C7 普通锚定、体与面 Entity Graphics](2026-08-09-phase-c7-common-solid-and-area-graphics.md)
（`completed`）、
[C6 Public Planar Primitive/Geometry 基础](2026-08-09-phase-c6-public-planar-primitive-and-geometry.md)
（`completed`）、
[C5 动态更新、批量性能与交付](2026-08-09-phase-c5-dynamic-performance-and-delivery.md)
（`completed`）、
[C4 Entity、DataSource 与 Viewer 集成](2026-08-09-phase-c4-entity-datasource-viewer-integration.md)
（`completed`）、
[C3 平面 Polyline、Polygon 与地表关系](2026-08-09-phase-c3-polyline-polygon.md)（`completed`）、
[C2 平面锚点内容与普通 Model](2026-08-09-phase-c2-anchor-and-model.md)（`completed`）、
[C1 平面内容基础契约与兼容性基线](2026-08-09-phase-c1-content-contract.md)（`completed`）。

Current handoff：Architecture focused re-review已确认C10-R001～C10-R004全部关闭，C10 review=`approved`、
phase=`completed`。项目负责人决定不把C9 actual-mesh ground后端作为最终交付，旧页面未获最终人工验收；
Architecture先形成C10独立提交，再规划C11单一planar depth/stencil替换阶段。Extension继续`active`。
