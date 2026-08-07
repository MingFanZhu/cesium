# Planar World 升级与私有依赖检查表

本清单用于升级官方 Cesium 基线时复核 SceneGIS Planar World。它不是升级结果，也不能替代 ADR、SGP 和自动化回归。

| 私有依赖或缝隙                                                    | SceneGIS wrapper/owner                                  | 风险   | 升级后必须复核                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Scene primary-world frame lifecycle 与 request-render             | `SceneGISWorld`、`SceneGISPlanarWorld`、SGP-0001        | high   | update/begin/render/end 顺序、tilesLoaded、exact destroy、Globe replacement 回归                        |
| CesiumWidget non-Globe construction/environment                   | `CesiumWidget({world})`、SGP-0001                       | high   | 不先建 Globe、不隐式 Earth environment、world/globe option guards                                       |
| DrawCommand/Pass/Context、depth replay 与 near/far fitting        | private planar Surface/Tile                             | high   | opaque command、dual bounding volume、normal selection、pick+depth exact command replay、single Context |
| four-frustum Camera ray/home/pose math                            | private planar Camera、`SceneGISPlanarCameraController` | high   | perspective/off-center/orthographic、large finite bounds、pointer anchor、atomic Home                   |
| ScreenSpaceEventHandler/CameraEventAggregator wheel normalization | `SceneGISPlanarCameraController`                        | high   | real DOM wheel direction/scale、cancel/re-enable、no inertia、legacy input conflict                     |
| ControllerHost registration/disconnect ordering                   | planar controller、Viewer SGP-0002                      | high   | exactly-one registration、disconnect before Scene/world destroy、rollback、DOM baseline                 |
| Viewer construction/widget capability matrix                      | `Viewer({world})`、SGP-0002                             | high   | pre-DOM validation、planar Home、InfoBox guard、tracking/flight rejection、Globe behavior               |
| imagery Resource/Request/Texture/TileProviderError semantics      | private planar Imagery、public provider/layer           | high   | retry/cancel/stale generation、ready ancestor、provider non-ownership、exact resource release           |
| automatic exports/types/JSDoc/package layout                      | public SceneGIS engine/widgets types                    | medium | workspace and installed tarball ESM/CJS where supported、root/types/API visibility、private absence     |
| Sandcastle/E2E local bundle entry                                 | two planar examples and local E2E                       | medium | dev/release bundle, no public-network automation, credits and destroy                                   |

## 升级执行顺序

1. 核对 `.scenegis/upstream-base.json`，逐项重放并审查 SGP-0001/SGP-0002，不在功能提交中混入 upstream sync。
2. 运行 `node scripts/scenegis/audit-upstream-patches.mjs`，确认所有 upstream-owned diff 已登记且 marker 配对。
3. 运行 P1-P7 focused Specs，再运行 multi-tile warm/churn/depth 与 lifecycle soak；任何 observable selection、pixel、fallback、ownership 变化先形成 finding。
4. 生成 build/release/types/docs，在临时目录执行 root/engine/widgets tarball smoke；生成文件不得进入提交。
5. 执行 dev/release 本地 E2E，确认 Viewer、imagery、pixel/depth/pick、真实 wheel/Home 与 destroy。
6. 检查两个 Sandcastle 示例，但把公网 OSM 可用性与 engine correctness 分开记录。
7. 只有 Architecture review approved 后才更新官方基线、SGP 状态和阶段 checkpoint。

## 私有实现同步原则

private module basename、debug counter 和内部 command/cache entry 都不是公共 API。测试可以观察它们来证明资源收敛，但应用不得依赖。升级若迫使 private semantic 改变，优先调整 SceneGIS wrapper；需要新增 upstream hook、改变 public contract、Shader/Worker protocol 或 selection/SSE/LRU/fallback 时，应建立新的 ADR/phase，而不是在升级中顺手扩边。
