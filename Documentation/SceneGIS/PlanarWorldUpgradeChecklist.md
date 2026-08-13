# Planar World 升级与私有依赖检查表

平面内容升级还必须逐项复核版本化
[PlanarContentCompatibility](PlanarContentCompatibility.md)：24个engine/2个widget入口、16类automatic Graphics、
gate加八个child顺序、ordinary/Ground Primitive配对、installed declarations/API private边界，以及local dev/release
E2E的network-zero与actual-ground证据。

C11 private backend参考`packages/engine/Source/Scene/ClassificationPrimitive.js`、
`packages/engine/Source/Scene/GroundPolylinePrimitive.js`以及相关`ShadowVolume*`/
`PolylineShadowVolume*` Shader的算法职责，参考baseline为
`6d5d8b1f0725b6f831b336463f4b11c98023427b`。升级Cesium时必须重新核对classification mask、z-fail
front/back operation、`Pass.GLOBE -> Pass.TERRAIN_CLASSIFICATION`顺序、clip-space pixel width与pick/depth derived
command协议；不得直接复制其Ellipsoid、Cartographic或ApproximateTerrainHeights坐标模型。

A5 private quantized terrain tasks仅参考
`packages/engine/Source/Core/CesiumTerrainProvider.js`、
`packages/engine/Source/Workers/createVerticesFromQuantizedTerrainMesh.js`和
`packages/engine/Source/Workers/upsampleQuantizedTerrainMesh.js`中的坐标无关算法职责，参考baseline同为
`6d5d8b1f0725b6f831b336463f4b11c98023427b`。升级时必须复核delta/zig-zag/high-water decode、edge skirt和direct-child
triangle clipping；不得引入其Ellipsoid、Cartographic、TerrainEncoding或service metadata语义。

A6 private terrain normal encoder参考`packages/engine/Source/Core/AttributeCompression.js`的oct encoding职责，
参考baseline同为`6d5d8b1f0725b6f831b336463f4b11c98023427b`。升级时必须复核`czm_octDecode`输入范围、
`czm_viewRotation`变换、Heightmap/Quantized真实surface topology与meter metric、skirt duplicate映射、2-byte attribute布局和
two-vertex-buffer rollback/release；不得引入其无关normal compression API或新的Shader build seam。

本清单用于升级官方 Cesium 基线时复核 SceneGIS Planar World。它不是升级结果，也不能替代 ADR、SGP 和自动化回归。

| 私有依赖或缝隙                                                           | SceneGIS wrapper/owner                                              | 风险   | 升级后必须复核                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Scene primary-world frame lifecycle 与 request-render                    | `SceneGISWorld`、`SceneGISPlanarWorld`、SGP-0001                    | high   | update/begin/render/end 顺序、tilesLoaded、exact destroy、Globe replacement 回归                                                   |
| CesiumWidget non-Globe construction/environment                          | `CesiumWidget({world})`、SGP-0001                                   | high   | 不先建 Globe、不隐式 Earth environment、world/globe option guards                                                                  |
| DrawCommand/Pass/Context、depth replay 与 near/far fitting               | private planar Surface/Tile                                         | high   | opaque command、dual bounding volume、normal selection、pick+depth exact command replay、single Context                            |
| four-frustum Camera ray/home/pose math                                   | private planar Camera、`SceneGISPlanarCameraController`             | high   | perspective/off-center/orthographic、large finite bounds、pointer anchor、atomic Home                                              |
| ScreenSpaceEventHandler/CameraEventAggregator wheel normalization        | `SceneGISPlanarCameraController`                                    | high   | real DOM wheel direction/scale、cancel/re-enable、no inertia、legacy input conflict                                                |
| rendered-depth/terrain/reference navigation anchor chain                 | `SceneGISPlanarCameraController`、terrain query snapshot            | high   | depth capability/cache、inclusive extent、terrain fallback、anchor-height pan/zoom、drag snapshot、zero query/runtime mutation     |
| surface/underground mode与camera-surface relationship                    | `SceneGISPlanarCameraController`                                    | high   | exact string union、held-input隔离、terrain→Z=0 relationship、target Z、正负pitch两侧、无隐式mode/collision                        |
| surface endpoint clearance与update ordering                              | `SceneGISPlanarCameraController`、ControllerHost                    | high   | finite positive clearance、first/pre/post-input +Z push、terrain降级不吸附、underground bypass、零Home/零runtime mutation          |
| underground中键orbit crossing与held snapshot                             | `SceneGISPlanarCameraController`                                    | high   | above/down↔below/up、非中心3D pivot/window anchor、tangent连续、release后新侧input、surface side lock、零重复terrain query         |
| ControllerHost registration/disconnect ordering                          | planar controller、Viewer SGP-0002                                  | high   | exactly-one registration、disconnect before Scene/world destroy、rollback、DOM baseline                                            |
| Viewer construction/widget capability matrix                             | `Viewer({world})`、SGP-0002                                         | high   | pre-DOM validation、planar Home、InfoBox guard、tracking/flight rejection、Globe behavior                                          |
| imagery Resource/Request/Texture/filter/TileProviderError semantics      | private planar Imagery/Surface、public provider/layer               | high   | retry/cancel/stale generation、ready ancestor、filter order/default bypass/normal snapshot、provider non-ownership、exact release  |
| terrain request/availability/upsample/skirt/shared-index runtime         | private planar Terrain/mesh/quadtree                                | high   | four-child coverage、promotion budget、Float32 mesh、skirt topology/bounds、exact release                                          |
| terrain query snapshot、Float32 triangle与independent sampler            | private terrain Query、public World/Sampler APIs                    | high   | snapshot invalidation、skirt exclusion、non-unit ray、scheduler delay、zero runtime mutation                                       |
| URL Heightmap image/LERC decode                                          | public planar URL terrain provider                                  | high   | getImagePixels、color-space option、LERC API、boundary samples、ImageBitmap close                                                  |
| planar terrain TaskProcessor Worker                                      | ADR-0027 private scheduler/task + single Worker entry               | high   | task kinds、transfer ownership、result preflight、late generation、worker URL/IIFE/release/tar delivery                            |
| planar quantized-mesh decode/mesh/upsample                               | ADR-0028 + existing terrain Worker/runtime                          | high   | safe binary bounds、CCW/edge topology、bounded query index、true-triangle child clip、per-tile index ownership                     |
| terrain smooth/geometric normals与shader variants                        | Worker mesh tasks、private Terrain/SurfaceShader                    | high   | topology accumulation、oct decode、stable +Z lighting、two-buffer lifecycle、layer+lighting+mode cache key                         |
| planar terrain Material styling                                          | World/Surface/SurfaceShader、ADR-0032                               | high   | assembled source、`_uniforms`、update lifecycle、absolute Z、north-clockwise aspect、oct flat snap、sampler budget、replay/release |
| planar Environment Controller与Scene light authority                     | Environment/World/ControllerHost、ADR-0033                          | high   | callback/first-update顺序、fixed ENU/sign、one-per-world、conditional restore、requestRender、World sever、caller ownership        |
| planar Environment astronomical directions                               | Environment、ADR-0034                                               | high   | Simon1994显式time、TEME pseudo-fixed、WGS84 origin ENU、Moon topocentric parallax、atomic publication、effective direction声明     |
| planar visible celestial bodies与environment hook                        | World/private renderer、ADR-0035、SGP-0003                          | high   | environment-pass顺序、four-frustum/CSS pixel、horizon/terrain地下、native冲突、one VA/SP/two commands、private delivery            |
| planar atmosphere与fixed-axis caller-owned SkyBox                        | Environment/World/private renderer、ADR-0036、SGP-0003 dependency   | high   | CubeMapPanorama identity/return-command、合成顺序、native冲突、地下mask、one VA/SP/command、caller destroy、12 shader pairs        |
| SceneGIS planar GLSL source与生成模块交付                                | `Source/Shaders/SceneGIS/**`、ADR-0030                              | high   | shader glob、comment minify、相邻JS ignore、basename唯一性、显式imports、dev/release/npm tarball加载                               |
| advanced terrain unified qualification                                   | A7 local real-Context qualification                                 | high   | LERC/Quantized replacement、30 warm frames、bounded churn、task/GPU convergence、provider destroy balance                          |
| automatic exports/types/JSDoc/package layout                             | public SceneGIS engine/widgets types                                | medium | workspace and installed tarball ESM/CJS where supported、root/types/API visibility、private absence                                |
| Sandcastle/E2E local bundle entry                                        | two planar examples and local E2E                                   | medium | dev/release bundle, no public-network automation, credits and destroy                                                              |
| SceneGIS direct development examples                                     | `Test/**` + root `server.js` development routes                     | medium | 单一ESM identity、incremental route/cache invalidation、本地fixture、中文panel、caller-owned cleanup                               |
| planar styling unified qualification与installed delivery                 | S4 Widget/E2E/package verifier                                      | high   | non-default filter→Material→lighting、warm identities、8 GLSL+8 generated JS、7 filter properties、Material/API anchors            |
| planar environment unified qualification与installed delivery             | E5 Widget/E2E/package verifier                                      | high   | astronomical Clock→light/bodies/atmosphere/SkyBox、warm Surface/environment identities、12 GLSL+12 generated JS、caller ownership  |
| Entity/DataSource planar callback与profile gate                          | private content callback、SGP-0001                                  | high   | World liveness、deferred activation、dynamic allowlist、default Globe isolation                                                    |
| Point/Billboard/Label pools与Model async lifecycle                       | private Anchor/Model visualizers                                    | high   | disabled EntityCluster、original Entity pick、generation isolation、late settlement、exact release                                 |
| standard synchronous Primitive/GeometryInstance与per-DataSource ordering | public planar Primitive/Geometry、private Polyline/Polygon adapters | high   | scene3DOnly local DOUBLE、origin/model matrix、pickPrimitive、Appearance vertex format、candidate/current、move/remove/destroy     |
| Core local volume、route-derived mesh与Path fixed sampler                | C7/C8 public Geometry、Solid/Area/Route/Path adapters               | high   | coordinate-neutral Core facts、normal/closed matrix、corner stations、FIXED `_subSample`、callback order与private generation       |
| planar depth/stencil ground classification                               | C11 Ground Primitive、GroundCommands/Volume/LineShader              | high   | `Pass.GLOBE`/`TERRAIN_CLASSIFICATION` ordering、z-fail stencil、line shader、provider envelope、linear/log depth、pick/lifecycle   |
| planar content moderate qualification与local E2E                         | C5 qualification Specs、content Sandcastle/E2E                      | medium | batch warm/mutation、selection、dev/release、no public-network automation                                                          |
| content private tarball delivery                                         | package smoke与`SceneGIS/DataSources/_private`                      | medium | runtime files存在，非underscore public spelling、`.d.ts`与API HTML命中0，临时consumer不污染workspace                               |

升级Cesium根开发服务器时还必须复核`Test/**`页面请求`/Build/CesiumUnminified/index.js`仍由development incremental
context交付；engine/widgets/Shader source watcher能清理相关cache，刷新后取得最新bundle；页面不得同时加载IIFE与ESM，
也不得把Sandcastle mirror/Vite、public network或access token重新变成SceneGIS开发示例的启动依赖。

## 升级执行顺序

1. 核对 `.scenegis/upstream-base.json`，逐项重放并审查 SGP-0001/SGP-0002，不在功能提交中混入 upstream sync。
2. 运行 `node scripts/scenegis/audit-upstream-patches.mjs`，确认所有 upstream-owned diff 已登记且 marker 配对；同一
   path承载多个SGP时必须全部为`paired`：active逐ID至少一个完整pair，proposed可以尚无pair但已存在时必须合法，retired
   不得保留marker或覆盖live diff，changed lines位于active与已落地proposed合法ranges并集内。复核`Scene.js`的
   `SGP-0001`与`SGP-0003`仍保持独立目的和移除条件，并可单独retire。
   同时复核`CubeMapPanorama`仍允许`Matrix3.IDENTITY`、同步preloaded non-URL faces和return-command；returned command、credit、
   CubeMap destroy ownership以及duplicate Context行为必须与ADR-0036一致。确认`Scene.renderEnvironment`仍在native generic
   background之后、ordinary geometry之前，并且`Scene._environmentState`仍能区分已经执行的native SkyBox/SkyAtmosphere，供
   planar underground opaque mask使用。
3. 运行 P1-P8、terrain T1-T6与advanced terrain focused Specs；复核actual Worker transfer/URL与A7本地统一资格，再按风险运行
   multi-tile warm/churn/depth与lifecycle soak；任何
   observable selection、pixel、fallback、lighting或ownership变化先形成finding。
4. 生成 build/release/types/docs，在临时目录执行 root/engine/widgets tarball smoke；逐项确认12个SceneGIS GLSL、12个generated
   shader module、7个imagery filter properties、World Material、Environment/SkyBox declarations/API anchors、private hiding与
   caller ownership；生成文件不得进入提交。
5. 执行dev/release本地E2E，确认非默认filter + caller-owned Material + lighting像素、single command/readiness、
   depth/pick、真实wheel/Home与destroy；同一blocked-network Viewer case还必须注册caller-owned Environment，使用explicit
   WGS84 origin与native host Clock消费astronomical direction、visible Sun/Moon、planar atmosphere和generated local SkyBox，
   并证明时间变化不替换environment/Surface/mesh/texture identities、remove/destroy ownership正确且public network attempts为0。
6. 检查planar imagery、Viewer与terrain开发示例（以及仍保留的legacy Sandcastle），验证terrain lighting toggle和显式scene light；terrain案例还必须验证
   None/Contour/Height/Slope/Aspect、reset、underground方向稳定、caller Material ownership与overlay；两个示例的用户可见
   tool/control标题、标签、按钮、选项、帮助与status应保持清晰中文，技术API名称和Credit保持原契约；
   把公网OSM/terrain可用性与engine correctness分开记录。
7. 检查planar content开发示例与local E2E，复核完整approved graphics matrix、fixed Path sampling、dynamic
   update、original Entity selection、per-DataSource ordering和moderate warm/resource收敛。
8. 只有 Architecture review approved 后才更新官方基线、SGP 状态和阶段 checkpoint。

## 私有实现同步原则

private module basename、debug counter 和内部 command/cache entry 都不是公共 API。测试可以观察它们来证明资源收敛，但应用不得依赖。升级若迫使 private semantic 改变，优先调整 SceneGIS wrapper；需要新增 upstream hook、改变 public contract、Shader/Worker protocol 或 selection/SSE/LRU/fallback 时，应建立新的 ADR/phase，而不是在升级中顺手扩边。
