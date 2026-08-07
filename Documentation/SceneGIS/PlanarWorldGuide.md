# SceneGIS Planar World 使用指南

本文说明已完成 release qualification 的平面世界公共入口、所有权与已知边界。这里的坐标单位固定为米，X 向东、Y 向北、Z 向上。

## 最小 Viewer 示例

```js
import {
  Credit,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarUrlTemplateImageryProvider,
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

const viewer = new Viewer("cesiumContainer", { world });
viewer.planarCameraController.viewHome(viewer.scene);

// The Viewer owns and destroys its Scene and primary world.
viewer.destroy();
```

生产应用必须遵守影像服务条款、展示 attribution，并处理 CORS、限流和服务失败。自动化测试应使用本地 provider，不依赖公网。

## CesiumWidget 入口

低层应用可使用 `new CesiumWidget(container, { world })`。应用必须把 `scene.screenSpaceCameraController.enableInputs` 设为 `false`，再通过 `widget.addController` 注册唯一 `SceneGISPlanarCameraController`；销毁 Widget 前先移除 controller。`Viewer({ world })` 已自动完成这套顺序。

一个 world 只能绑定一个 WebGL `Context`。不要在多个 Widget/Viewer 之间复用同一个 live world。`Scene` 拥有 primary world，销毁 Scene/Widget/Viewer 会销毁 world；imagery layer collection 拥有 layer，但 provider 始终由调用方拥有。

## 导航、Home 与拾取

- PC 输入为 left-drag pan、middle-drag rotate、wheel zoom；没有 touch、pinch 或 inertia。
- `SceneGISPlanarCameraController.viewHome(scene)` 和 planar Home button 按当前 viewport 与四类支持的 frustum 重新计算视图。
- `world.pick(ray)` 与 `world.pickFromWindowPosition(position, scene)` 是有界的 Z=0 数学拾取，不依赖当前 LOD 或 depth buffer；extent 外返回 `undefined`。
- `scene.pickPosition(position)` 是 rendered-depth 拾取，要求浏览器支持 depth texture，并依赖最近一次 normal render。它不等同于通用 object picking。

## 影像与加载状态

provider 的 `tilingScheme` 必须与 `world.tilingScheme` 是同一对象，不能只具有相同参数。每个 ideal geometry tile 始终提交一个 opaque command；shown layer 自底向顶在单 pass 中合成，因此 layer 数不能超过 WebGL texture image unit 上限。

`world.tilesLoaded` 只描述当前视图中 shown layers 的 desired tiles 是否 ready 或 terminally failed。运行时请求 desired tile 与 Level 0 bootstrap；可复用 cache 中最近的 ready ancestor，但不会主动请求中间 ancestor。移除 layer 或销毁 world 会取消/隔离请求并释放 texture/binding，late settlement 不得重新进入 cache。

## 支持矩阵与限制

| 能力        | 当前契约                                                               |
| ----------- | ---------------------------------------------------------------------- |
| extent      | 有限、严格正方形、米制、无 wrap                                        |
| scene mode  | 仅 `SCENE3D`                                                           |
| tiling      | 单个 1×1 root，northwest-origin XYZ；可选 TMS URL 翻转                 |
| surface     | opaque Z=0 mathematical plane、implicit quadtree、无 terrain           |
| imagery     | 同 canonical tiling scheme、无 reprojection、单 pass composition       |
| navigation  | PC pan/rotate/wheel/Home；无 touch、inertia、flight/tracking           |
| environment | Earth skybox 只能由应用显式提供；不会自动增加 atmosphere               |
| UI          | planar Viewer 无通用 provider picker、geocoder、mode/projection picker |
| unsupported | terrain、underground、partial extent、availability、imagery picking    |

## 性能与调参

降低 `maximumScreenSpaceError` 会选择更多 tile；提高 `tileCacheSize` 会保留更多 unprotected tile record。每个 shown imagery layer 会增加 texture/request/cache 成本，但不会增加每个 ideal tile 的 draw command 数。调参时同时观察 selected/submitted tile、resident tile、request/texture/binding 与 warm-frame allocation；不要仅用单帧 FPS 推断泄漏或稳定性。

release qualification 使用至少 16 个 submitted tiles、bare/双层影像各 120 warm frames、五轮 camera/cache churn、60 次 depth replay，以及重复 Widget/Viewer 生命周期作为确定性门禁。不同机器的 timing 只能作趋势参考。

## 故障排查

- 构造期 `DeveloperError`：检查 extent/span 是否有限且正方形、maximum level 是否安全、provider 是否复用 exact `world.tilingScheme`。
- extent 外拾取为 `undefined`：这是 public bounded mathematical pick 的预期行为。
- 远程影像空白：检查 CORS、URL scheme、credit、`errorEvent`、retry 和服务 SLA；baseColor/ready ancestor 是正常降级。
- 第二个 Context 报错：为每个 Widget/Viewer 创建独立 world。
- Viewer option 冲突：planar Viewer 不接受 Globe imagery/terrain/map-projection/provider-picker 选项。
- 已销毁对象报错：不要在 Scene/Viewer destroy 后继续 render、pick 或复用 controller/world。
