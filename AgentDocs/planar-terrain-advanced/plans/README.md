# Planar Terrain Advanced Plans

## Maintenance

- [平面地形剖切与多边形裁剪](2026-09-18-terrain-clipping.md)（completed；共面裙边修复与负责人视觉验收通过）

- [地形元数据接入与 TileWorker 核验](2026-09-18-terrain-layer-metadata.md)（active；技术验证完成，负责人视觉验收待定）

- [平面相机惯性](2026-09-18-planar-camera-inertia.md)（completed；技术验收与 64 项 Specs 通过，负责人验收通过）

- [低俯角旋转距离修复](2026-09-18-surface-orbit-distance-fix.md)（completed；技术自审与 54 项 Specs 通过）

## Completed extension plan

- [总体计划：SceneGIS 平面高级地形](2026-08-10-planar-terrain-advanced-extension.md)
  （`completed`、`confirmed`）

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
  （`completed`、A6-R001/R002关闭并获Architecture focused re-review批准）
- [A7 平面高级地形统一资格与交付](2026-08-11-phase-a7-unified-qualification-and-delivery.md)
  （`completed`、A7-R001/R002关闭，Architecture focused re-review与人工验收通过）

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
  新`.glsl`/build seam，不承诺任意provider边界bit-identical。Execution现已完成实现：六个focused suites unique
  `65/65`、build/release/static/audit通过，pending A6 review已创建。
- A6首轮review仅提出两个evidence findings。Execution已在既有curved fixture中改为共享边两侧独立candidate
  interpolation，并为synthetic/real Context Quantized路径补齐已知坡面方向、smooth lit pixel与warm identity证据；
  Architecture独立复跑Worker `8/8`、Widget `2/2`与审计后批准；checkpoint为`0009fbd414`。
- A7已按当前release qualification、Worker/package smoke、terrain Widget与唯一Sandcastle事实完成详细设计。默认
  product runtime delta为0，只新增一个本地真实Context统一资格case并完成最终交付/人工验收，不增加workflow或重复E2E。
- A7 Execution已完成：新增唯一real-Context direct case，本地LERC→Worker→Heightmap后替换Quantized，
  两种格式各30 warm frames、3轮churn与资源平衡通过；修正terrain-navigation固定8帧的test-only等待。
  Focused `59/59`与build/release/types/docs/package/no-embedding Sandcastle/static/audit通过；Architecture独立复跑
  qualification/navigation与审计后曾批准。项目负责人人工验收随后稳定复现地下Lighting黑暗碎块；A7-R001现已按
  stable topology-up/+Z normal修复，并经Architecture独立复跑Shader `4/4`、terrain Widget `2/2`与审计后批准。
  项目负责人人工复测又在公开EPSG:3857案例中发现Surface Lighting密集噪点；A7-R002现已以meter-metric
  world-axis normal与`czm_viewRotation`修复。Architecture独立复跑Worker `8/8`、Surface/Shader `34/34`、terrain
  Widget `2/2`、qualification `1/1`及build/static/audit，项目负责人公开案例人工验收通过；A7与extension完成。
