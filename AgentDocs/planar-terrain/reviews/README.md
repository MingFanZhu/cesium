# Reviews

本目录保存 `planar-terrain` 的 architecture、code、test 和 delivery review。

- [T1 terrain Core review request](2026-08-07-t1-terrain-core.md)（`approved`）：三个 Core
  public type、Heightmap decode/interpolation/availability、公开生成链与所有权审计；
  T1-R001 已由 Architecture Agent 确认为 `fixed`，无 unresolved finding。
- [T2 terrain mesh + surface review](2026-08-07-t2-terrain-surface.md)（`approved`）：public provider
  attachment、private mesh/runtime、三维 bounds/SSE、terrain/imagery command、真实 depth 与
  ownership evidence；`T2-R001` 已由 Architecture Agent 确认为 `fixed`，无 unresolved finding。
- [T3 terrain continuous LOD review](2026-08-07-t3-terrain-continuous-lod.md)（`approved`）：
  desired/load/render、四子门禁、availability、upsample/skirt、promotion、cache/lifecycle、
  imagery/depth 与 zero-upstream evidence；`T3-R001`、`T3-R002` 均由 Architecture reviewer确认
  `fixed`，无 unresolved finding。
- [T4 terrain query/picking review](2026-08-07-t4-terrain-query-and-picking.md)
  （`approved`）：resident Float32 height、actual-cover terrain ray/window picking、independent
  provider sampler、WebGL depth/Z=0 closure、public/private generation与 zero-upstream audit；
  `T4-R001`～`T4-R004` 均由 Architecture reviewer确认为 `fixed`，无 unresolved finding。
- [T5 generic URL Heightmap provider review](2026-08-08-t5-url-template-heightmap-provider.md)
  （`approved`）：coordinate-agnostic canonical provider、image/LERC decode、full-pyramid
  availability、provider→World closure、公开best-effort Sandcastle、public generation与zero-upstream
  audit；`T5-R001`～`T5-R003`均由Architecture reviewer确认为`fixed`，无unresolved finding。
