# Planar Terrain Advanced Plans

## Active extension plan

- [总体计划：SceneGIS 平面高级地形](2026-08-10-planar-terrain-advanced-extension.md)
  （`active`、`confirmed`）

## Phase plans

- [A1 平面地形感知导航锚点](2026-08-10-phase-a1-terrain-aware-navigation-anchors.md)
  （`completed`、Architecture review与项目负责人人工验收通过）
- [A2 平面导航模式与相机—地表关系](2026-08-10-phase-a2-navigation-mode-and-surface-relationship.md)
  （`completed`、Architecture review与项目负责人人工验收通过）
- [A3 平面地形净空与防穿透](2026-08-11-phase-a3-terrain-clearance-and-penetration-prevention.md)
  （`completed`、Architecture review与项目负责人人工验收通过）
- [A4 平面地形 Worker 管线](2026-08-11-phase-a4-terrain-worker-pipeline.md)
  （`completed`、Architecture/code review通过）
- [A5 平面 Quantized-mesh Terrain](2026-08-11-phase-a5-planar-quantized-mesh.md)
  （`completed`、Architecture focused re-review批准）
- [A6 平面地形平滑法线与 LOD 光照连续性](2026-08-11-phase-a6-smooth-terrain-normals-and-lod-lighting.md)
  （`active`、Architecture自主批准，等待Execution实现）
- A7：仅保留 extension plan 中的稳定阶段目标，不提前创建 phase plan。

## Handoff

- A1已形成独立checkpoint `6657aac8fe`。
- A2-R001/R002/R003全部关闭，Architecture review与项目负责人人工复测通过；checkpoint为`5ff4753579`。
- A3-R001实现后Architecture focused review确认ordinary Perspective双向穿越，并发现exact tangent release与
  Orthographic `0/0`缺口。A3-R002现已用finite press-time distance与release normalization修复，Controller 47/47；
  Architecture final focused review与项目负责人Sandcastle人工复测均已通过；checkpoint为`c03f7d9a56`。
- A4已完成TaskProcessor、Worker build/package、LERC/mesh profiling与ownership审计；ADR-0027批准两个独立task和
  唯一thin Worker entry。Execution完成实现、67-case focused矩阵与release/package审计，Architecture独立复跑
  actual Worker、runtime与real Context关键闭环后批准；checkpoint为`bf339ee853`。
- A5首轮已完成public data/provider、同一Worker entry下的quantized decode/mesh/upsample、runtime
  direct/fallback/query、per-tile index与real Context/package闭环。A5-R001～R003已由直接Specs锁定edge
  canonicalization、GPU allocation rollback和Provider错误类型，并经Architecture独立focused re-review关闭；
  checkpoint为`e7375acf8b`。
- A6已重新审计Worker topology、Surface shader builder与GPU lifecycle。ADR-0029批准task-local area-weighted
  smooth normals、transferable `Uint8x2` oct storage、第二vertex buffer及geometric/smooth lit variants；不启用
  新`.glsl`/build seam，不承诺任意provider边界bit-identical。
