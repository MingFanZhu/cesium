# SceneGIS Planar World 使用指南

本文说明已完成 release qualification 的平面世界公共入口、所有权与已知边界。这里的坐标单位固定为米，X 向东、Y 向北、Z 向上。

## 最小 Viewer 示例

```js
import {
  Cartesian3,
  Credit,
  DirectionalLight,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarUrlTemplateImageryProvider,
  SceneGISPlanarUrlTemplateHeightmapTerrainProvider,
  SceneGISPlanarWorld,
  Viewer,
} from "cesium";

const extent = new SceneGISPlanarExtent({
  minimumX: -20037508.342789244,
  minimumY: -20037508.342789244,
  maximumX: 20037508.342789244,
  maximumY: 20037508.342789244,
});
const coordinateSystem = new SceneGISPlanarCoordinateSystem({
  extent,
  crs: "EPSG:3857",
});
const world = new SceneGISPlanarWorld({
  coordinateSystem,
  maximumLevel: 19,
  maximumScreenSpaceError: 2.0,
  tileCacheSize: 100,
  enableLighting: true,
});
const provider = new SceneGISPlanarUrlTemplateImageryProvider({
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tilingScheme: world.tilingScheme,
  urlScheme: "xyz",
  tileWidth: 256,
  tileHeight: 256,
  maximumLevel: 19,
  credit: new Credit(
    '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
  ),
});
world.imageryLayers.add(new SceneGISPlanarImageryLayer(provider));

world.terrainProvider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
  url: "https://example.invalid/terrain/{z}/{y}/{x}",
  tilingScheme: world.tilingScheme,
  urlScheme: "xyz",
  format: "lerc",
  heightmapWidth: 257,
  heightmapHeight: 257,
  minimumHeight: -500.0,
  maximumHeight: 9000.0,
  maximumLevel: 16,
});

const viewer = new Viewer("cesiumContainer", { world });
viewer.scene.light = new DirectionalLight({
  direction: Cartesian3.normalize(
    new Cartesian3(-1.0, -0.5, -1.5),
    new Cartesian3(),
  ),
});
viewer.planarCameraController.viewHome(viewer.scene);

// The Viewer owns and destroys its Scene and primary world.
viewer.destroy();
```

示例terrain URL是占位地址；应用必须选择提供boundary-inclusive height samples的数据源，并让
terrain/imagery复用exact `world.tilingScheme`。生产应用必须遵守服务条款、展示 attribution，并
处理CORS、限流和服务失败。自动化测试应使用本地provider，不依赖公网。

## CesiumWidget 入口

低层应用可使用 `new CesiumWidget(container, { world })`。应用必须把 `scene.screenSpaceCameraController.enableInputs` 设为 `false`，再通过 `widget.addController` 注册唯一 `SceneGISPlanarCameraController`；销毁 Widget 前先移除 controller。`Viewer({ world })` 已自动完成这套顺序。

一个 world 只能绑定一个 WebGL `Context`。不要在多个 Widget/Viewer 之间复用同一个 live world。`Scene` 拥有 primary world，销毁 Scene/Widget/Viewer 会销毁 world；imagery layer collection 拥有 layer，但 provider 始终由调用方拥有。

## 导航、Home 与拾取

- PC 输入为 left-drag pan、middle-drag rotate、wheel zoom；没有 touch、pinch 或 inertia。
- `SceneGISPlanarCameraController.viewHome(scene)` 和 planar Home button 按当前 viewport 与四类支持的 frustum 重新计算视图。
- `world.pick(ray)` 与 `world.pickFromWindowPosition(position, scene)` 是有界的 Z=0 数学拾取，不依赖当前 LOD 或 depth buffer；extent 外返回 `undefined`。
- `scene.pickPosition(position)` 是 rendered-depth 拾取，要求浏览器支持 depth texture，并依赖最近一次 normal render。它不等同于通用 object picking。
- `world.getTerrainHeight(position)`只读取resident direct/upsampled Float32 surface；不会发请求，
  flat fallback返回`undefined`。
- `world.pickTerrain(ray)`与`pickTerrainFromWindowPosition`只查询最近正常render发布的actual terrain
  cover并排除skirt。它们不替代Z=0 `world.pick`，也不触发depth pass。
- Pan、rotate和wheel的私有导航锚点依次尝试合法的in-extent rendered depth、当前actual-cover terrain、
  bounded Z=0 reference plane。Pan/zoom围绕anchor自身高度的水平面校正，rotate使用完整3D pivot；一次drag
  内anchor保持固定，release/cancel后下一gesture才重新解析。
- 该锚点链可能选择可见Entity/Primitive的depth；depth不可用时才使用skirt-excluded terrain query。
  它不改变public Z=0 pick。
- Controller的`navigationMode`只接受`"surface"`和`"underground"`，默认surface。Viewer应用可使用
  `viewer.planarCameraController.navigationMode = "underground"`；低层应用可在controller constructor传入。
  切换本身不移动Camera或调用Home，Home也不改mode。
- Surface模式使用地表上侧的down-looking orbit；underground模式允许地表上侧/down-looking与下侧/
  up-looking两种orbit，并以纵向中键drag围绕press-time 3D pivot双向穿越。Center target优先actual terrain，
  缺失时使用resident height或Z=0 fallback。
- Surface模式默认保持1米`minimumTerrainClearance`。应用可设置任意finite positive米值；setter不移动Camera，
  下一次controller update按Camera-local resident terrain/Z=0 fallback只向+Z纠正。Underground不执行纠正；
  terrain降低/provider detach不会向下吸附。该能力是endpoint防穿透；underground crossing仍是固定pivot orbit，
  不是continuous/swept collision、free-look或terrain following。
- 独立批量采样使用`SceneGISPlanarTerrainSampler.sampleAtLevel`；它直接访问provider，不读取World
  cache，也不做ancestor/upsample fallback。

## 影像与加载状态

provider 的 `tilingScheme` 必须与 `world.tilingScheme` 是同一对象，不能只具有相同参数。每个 ideal geometry tile 始终提交一个 opaque command；shown layer 自底向顶在单 pass 中合成，因此 layer 数不能超过 WebGL texture image unit 上限。

`world.tilesLoaded` 是当前视图 terrain coverage/readiness 与 shown imagery readiness 的合取。对 imagery contribution，运行时请求 desired tile 与 Level 0 bootstrap；可复用 cache 中最近的 ready ancestor，但不会主动请求中间 ancestor。Recoverable terrain 或 imagery direct content 仍 pending 时结果保持 `false`；terminal failure 配合稳定 fallback 时可 settled。移除 layer、替换 provider 或销毁 world 会取消/隔离请求并释放对应资源，late settlement 不得重新进入 cache。

## 地形、光照与数据边界

`terrainProvider`由调用方拥有，并且必须引用World的canonical tiling scheme。Runtime维持direct、
upsampled与flat fallback的连续单层coverage，以skirt遮蔽mixed-LOD边缘；terrain geometry与imagery
始终共用每tile一个opaque command。Provider replacement、eviction与World destroy释放World拥有的
request/mesh/GPU资源，但不销毁provider。

`enableLighting`默认关闭。启用后，non-flat Heightmap/Quantized terrain使用Worker按真实surface topology生成的
area-weighted smooth vertex normals；flat/no-provider与active FLAT fallback继续使用fragment geometric normal。
`lambertDiffuseMultiplier`可调Diffuse强度。Smooth normals改善同一mesh内共享边和代表性LOD边界连续性，但不保证
任意独立provider tile的boundary gradient完全一致。自定义planar CRS应显式配置稳定`DirectionalLight`，不要依赖
SunLight方向。
相机位于surface下方只在underground mode中是合法状态；surface mode会在下一次enabled controller update沿+Z
恢复minimum clearance而不调用Home。Underground可通过中键orbit显式穿越；continuous/swept collision、free-look
与地下材质仍未实现。

## 支持矩阵与限制

| 能力        | 当前契约                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| extent      | 有限、严格正方形、米制、无 wrap                                                                                            |
| scene mode  | 仅 `SCENE3D`                                                                                                               |
| tiling      | 单个 1×1 root，northwest-origin XYZ；可选 TMS URL 翻转                                                                     |
| surface     | opaque flat/Heightmap terrain、continuous LOD fallback、skirt与可选基础光照                                                |
| imagery     | 同 canonical tiling scheme、无 reprojection、单 pass composition                                                           |
| navigation  | PC pan/rotate/wheel/Home、surface endpoint clearance、underground双向orbit crossing；无sweep/touch/inertia/flight/tracking |
| environment | Earth skybox 只能由应用显式提供；不会自动增加 atmosphere                                                                   |
| UI          | planar Viewer 无通用 provider picker、geocoder、mode/projection picker                                                     |
| unsupported | continuous/swept collision、free-look、universal cross-tile normal stitching、shadow/material、imagery picking             |

## 性能与调参

降低 `maximumScreenSpaceError` 会选择更多 tile；提高 `tileCacheSize` 会保留更多 unprotected tile record。每个 shown imagery layer 会增加 texture/request/cache 成本，但不会增加每个 ideal tile 的 draw command 数。Terrain LERC decode与Heightmap/Quantized mesh在唯一terrain Worker中执行，normal render每帧仍最多启动两个terrain task并promotion两个GPU content。每个non-flat final vertex增加2 bytes oct normal和一个terrain normal vertex buffer；`enableLighting`选择smooth或geometric Lambert variant但不增加command。调参时同时观察 selected/submitted tile、resident tile、request/texture/binding、mesh/promotion与warm-frame allocation；不要仅用单帧 FPS 推断泄漏或稳定性。

release qualification 使用至少 16 个 submitted tiles、bare/双层影像各 120 warm frames、五轮 camera/cache churn、60 次 depth replay，以及重复 Widget/Viewer 生命周期作为确定性门禁。不同机器的 timing 只能作趋势参考。

## 故障排查

- 构造期 `DeveloperError`：检查 extent/span 是否有限且正方形、maximum level 是否安全、provider 是否复用 exact `world.tilingScheme`。
- extent 外拾取为 `undefined`：这是 public bounded mathematical pick 的预期行为。
- 远程影像空白：检查 CORS、URL scheme、credit、`errorEvent`、retry 和服务 SLA；baseColor/ready ancestor 是正常降级。
- 远程terrain保持flat/ancestor：检查boundary sample dimensions、format/structure、provider height range、
  availability、CORS与`errorEvent`；terminal failure配合稳定fallback可以报告`tilesLoaded=true`。
- 光照方向不稳定：为`scene.light`设置显式`DirectionalLight`；自定义CRS不会改变默认SunLight语义。
- 第二个 Context 报错：为每个 Widget/Viewer 创建独立 world。
- Viewer option 冲突：planar Viewer 不接受 Globe imagery/terrain/map-projection/provider-picker 选项。
- 已销毁对象报错：不要在 Scene/Viewer destroy 后继续 render、pick 或复用 controller/world。
