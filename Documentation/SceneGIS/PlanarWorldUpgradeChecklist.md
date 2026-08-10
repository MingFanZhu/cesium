# Planar World 升级与私有依赖检查表

平面内容升级还必须逐项复核版本化
[PlanarContentCompatibility](PlanarContentCompatibility.md)：24个engine/2个widget入口、16类automatic Graphics、
gate加八个child顺序、ordinary/Ground Primitive配对、installed declarations/API private边界，以及local dev/release
E2E的network-zero与actual-ground证据。

本清单用于升级官方 Cesium 基线时复核 SceneGIS Planar World。它不是升级结果，也不能替代 ADR、SGP 和自动化回归。

| 私有依赖或缝隙                                                           | SceneGIS wrapper/owner                                              | 风险   | 升级后必须复核                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Scene primary-world frame lifecycle 与 request-render                    | `SceneGISWorld`、`SceneGISPlanarWorld`、SGP-0001                    | high   | update/begin/render/end 顺序、tilesLoaded、exact destroy、Globe replacement 回归                                                     |
| CesiumWidget non-Globe construction/environment                          | `CesiumWidget({world})`、SGP-0001                                   | high   | 不先建 Globe、不隐式 Earth environment、world/globe option guards                                                                    |
| DrawCommand/Pass/Context、depth replay 与 near/far fitting               | private planar Surface/Tile                                         | high   | opaque command、dual bounding volume、normal selection、pick+depth exact command replay、single Context                              |
| four-frustum Camera ray/home/pose math                                   | private planar Camera、`SceneGISPlanarCameraController`             | high   | perspective/off-center/orthographic、large finite bounds、pointer anchor、atomic Home                                                |
| ScreenSpaceEventHandler/CameraEventAggregator wheel normalization        | `SceneGISPlanarCameraController`                                    | high   | real DOM wheel direction/scale、cancel/re-enable、no inertia、legacy input conflict                                                  |
| ControllerHost registration/disconnect ordering                          | planar controller、Viewer SGP-0002                                  | high   | exactly-one registration、disconnect before Scene/world destroy、rollback、DOM baseline                                              |
| Viewer construction/widget capability matrix                             | `Viewer({world})`、SGP-0002                                         | high   | pre-DOM validation、planar Home、InfoBox guard、tracking/flight rejection、Globe behavior                                            |
| imagery Resource/Request/Texture/TileProviderError semantics             | private planar Imagery、public provider/layer                       | high   | retry/cancel/stale generation、ready ancestor、provider non-ownership、exact resource release                                        |
| terrain request/availability/upsample/skirt/shared-index runtime         | private planar Terrain/mesh/quadtree                                | high   | four-child coverage、promotion budget、Float32 mesh、skirt topology/bounds、exact release                                            |
| terrain query snapshot、Float32 triangle与independent sampler            | private terrain Query、public World/Sampler APIs                    | high   | snapshot invalidation、skirt exclusion、non-unit ray、scheduler delay、zero runtime mutation                                         |
| URL Heightmap image/LERC decode                                          | public planar URL terrain provider                                  | high   | getImagePixels、color-space option、LERC API、boundary samples、ImageBitmap close                                                    |
| standard derivatives、automatic light uniforms与shader variants          | private planar SurfaceShader、World lighting properties             | high   | dFdx/dFdy、face-forward、light uniforms、layer+lighting cache key、uniform-only multiplier                                           |
| automatic exports/types/JSDoc/package layout                             | public SceneGIS engine/widgets types                                | medium | workspace and installed tarball ESM/CJS where supported、root/types/API visibility、private absence                                  |
| Sandcastle/E2E local bundle entry                                        | two planar examples and local E2E                                   | medium | dev/release bundle, no public-network automation, credits and destroy                                                                |
| Entity/DataSource planar callback与profile gate                          | private content callback、SGP-0001                                  | high   | World liveness、deferred activation、dynamic allowlist、default Globe isolation                                                      |
| Point/Billboard/Label pools与Model async lifecycle                       | private Anchor/Model visualizers                                    | high   | disabled EntityCluster、original Entity pick、generation isolation、late settlement、exact release                                   |
| standard synchronous Primitive/GeometryInstance与per-DataSource ordering | public planar Primitive/Geometry、private Polyline/Polygon adapters | high   | scene3DOnly local DOUBLE、origin/model matrix、pickPrimitive、Appearance vertex format、candidate/current、move/remove/destroy       |
| Core local volume、route-derived mesh与Path fixed sampler                | C7/C8 public Geometry、Solid/Area/Route/Path adapters               | high   | coordinate-neutral Core facts、normal/closed matrix、corner stations、FIXED `_subSample`、callback order与private generation         |
| Scene primitive/World late pass与actual-triangle ground drape            | C9 Ground Primitive、private Surface snapshot/draper                | high   | update/render顺序、per-pass queue cleanup、actual parent/child cover、skirt exclusion、linear/log depth、pick与terrain non-ownership |
| planar content moderate qualification与local E2E                         | C5 qualification Specs、content Sandcastle/E2E                      | medium | batch warm/mutation、selection、dev/release、no public-network automation                                                            |
| content private tarball delivery                                         | package smoke与`SceneGIS/DataSources/_private`                      | medium | runtime files存在，非underscore public spelling、`.d.ts`与API HTML命中0，临时consumer不污染workspace                                 |

## 升级执行顺序

1. 核对 `.scenegis/upstream-base.json`，逐项重放并审查 SGP-0001/SGP-0002，不在功能提交中混入 upstream sync。
2. 运行 `node scripts/scenegis/audit-upstream-patches.mjs`，确认所有 upstream-owned diff 已登记且 marker 配对。
3. 运行 P1-P8与terrain T1-T6 focused Specs，再运行multi-tile warm/churn/depth与lifecycle soak；任何
   observable selection、pixel、fallback、lighting或ownership变化先形成finding。
4. 生成 build/release/types/docs，在临时目录执行 root/engine/widgets tarball smoke；生成文件不得进入提交。
5. 执行 dev/release 本地 E2E，确认 Viewer、imagery、pixel/depth/pick、真实 wheel/Home 与 destroy。
6. 检查planar imagery、Viewer与terrain Sandcastle，验证terrain lighting toggle和显式scene light；
   把公网OSM/terrain可用性与engine correctness分开记录。
7. 检查planar content Sandcastle与local E2E，复核完整approved graphics matrix、fixed Path sampling、dynamic
   update、original Entity selection、per-DataSource ordering和moderate warm/resource收敛。
8. 只有 Architecture review approved 后才更新官方基线、SGP 状态和阶段 checkpoint。

## 私有实现同步原则

private module basename、debug counter 和内部 command/cache entry 都不是公共 API。测试可以观察它们来证明资源收敛，但应用不得依赖。升级若迫使 private semantic 改变，优先调整 SceneGIS wrapper；需要新增 upstream hook、改变 public contract、Shader/Worker protocol 或 selection/SSE/LRU/fallback 时，应建立新的 ADR/phase，而不是在升级中顺手扩边。
