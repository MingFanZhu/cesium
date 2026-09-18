# SceneGIS Planar World 使用指南

本文说明已完成 release qualification 的平面世界公共入口、所有权与已知边界。这里的坐标单位固定为米，X 向东、Y 向北、Z 向上。

## 最小 Viewer 示例

```js
import {
  Cartesian3,
  Credit,
  DirectionalLight,
  SceneGISPlanarEnvironment,
  SceneGISPlanarSkyBox,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarUrlTemplateImageryProvider,
  SceneGISPlanarUrlTemplateHeightmapTerrainProvider,
  Viewer,
} from "cesium";

const viewer = new Viewer("cesiumContainer", {
  planarWorld: {
    extent: {
      minimumX: -20037508.342789244,
      minimumY: -20037508.342789244,
      maximumX: 20037508.342789244,
      maximumY: 20037508.342789244,
    },
    crs: "EPSG:3857",
    maximumLevel: 19,
    maximumScreenSpaceError: 2.0,
    tileCacheSize: 100,
    enableLighting: true,
  },
});
const world = viewer.planarWorld;

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
const layer = world.imageryLayers.add(
  new SceneGISPlanarImageryLayer(provider, {
    brightness: 1.0,
    contrast: 1.0,
    hue: 0.0,
    saturation: 1.0,
    gamma: 1.0,
    colorToAlpha: undefined,
    colorToAlphaThreshold: 0.004,
  }),
);

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

viewer.scene.light = new DirectionalLight({
  direction: Cartesian3.normalize(
    new Cartesian3(-1.0, -0.5, -1.5),
    new Cartesian3(),
  ),
});
viewer.planarCameraController.viewHome(viewer.scene);

const environment = new SceneGISPlanarEnvironment({
  world,
  sunDirection: new Cartesian3(1.0, 1.0, 1.0),
  moonDirection: new Cartesian3(-1.0, -1.0, 0.5),
});
viewer.addController(environment);

// The Viewer owns and destroys its Scene and primary world.
viewer.removeController(environment);
viewer.destroy();
```

Imagery filter直接修改layer属性，并在下一次normal render生效；不会重新请求或上传texture。默认值保持现有
planar sampled color space。`colorToAlpha`比较raw sampled RGB，getter/setter均defensive clone；设置为
`undefined`可禁用。filter执行顺序固定为color-to-alpha、gamma、brightness、contrast、hue、saturation，再应用
layer alpha与bottom-to-top composition；terrain lighting最后统一执行。

可在构造后为`world.material`赋caller-owned Cesium `Material`。稳定资格集为`ElevationContour`、`ElevationRamp`、
`SlopeRamp`与`AspectRamp`；height是absolute meter world Z，slope相对`+Z`，aspect是从`+Y` north顺时针的downslope
方位。Material diffuse/alpha在imagery composition后、lighting前source-over。替换、清空或destroy world不会destroy
Material；应用负责最终调用`material.destroy()`。Material sampler与shown imagery共享fragment texture-unit预算。

这不是完整Globe Material兼容层。自定义Fabric source可读取planar `czm_materialInput`：`st`为当前tile归一化XY，
`s=st.s`，`str=vec3(st, 0)`；`normalEC`来自topology-up terrain normal，`positionToEyeEC=-positionEC`，
`tangentToEyeMatrix`固定表达eye-space中的`+X East/+Y North/+Z Up`；`height`为absolute meter world Z，
`slope`相对`+Z`，`aspect`为从`+Y` north顺时针的downslope azimuth且flat为0，`waterMask=0`。Surface只消费
`czm_material.diffuse`与`alpha`；Material输出的`normal`、`specular`、`shininess`、`emission`、translucent pass及
Globe/ellipsoid-specific输入均不支持。除上述四个稳定资格builtin外，自定义Fabric应先用目标WebGL Context验证
compile/link、sampler预算与像素结果。

示例terrain URL是占位地址；应用必须选择提供boundary-inclusive height samples的数据源，并让
terrain/imagery复用exact `world.tilingScheme`。生产应用必须遵守服务条款、展示 attribution，并
处理CORS、限流和服务失败。自动化测试应使用本地provider，不依赖公网。

## 地形剖切与多边形裁剪

与 Globe 一样，为 `world.clippingPlanes`、`world.clippingPolygons` 设置原生 Cesium 集合：

```js
import {
  Cartesian3,
  ClippingPlane,
  ClippingPlaneCollection,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
} from "cesium";

world.clippingPlanes = new ClippingPlaneCollection({
  planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
  unionClippingRegions: false,
  edgeColor: Color.YELLOW,
  edgeWidth: 2,
});
world.clippingPolygons = new ClippingPolygonCollection({
  polygons: [
    new ClippingPolygon({
      positions: [
        new Cartesian3(-50, -50, 0),
        new Cartesian3(50, -50, 0),
        new Cartesian3(50, 50, 0),
        new Cartesian3(-50, 50, 0),
      ],
    }),
  ],
  inverse: false,
});
```

坐标使用当前 World 的米制 XYZ。平面按 `modelMatrix` 变换，裁剪负半空间；多个平面默认裁剪交集，
`unionClippingRegions=true` 裁剪并集。`edgeWidth` 单位为像素。
多边形使用直线 XY 简单外环，支持凹多边形和任意绕序，Z 与 `ellipsoid` 不参与裁剪。
多个多边形裁剪内部并集，`inverse=true` 保留并集内部。两类裁剪同时启用时，任一裁掉的部分均不可见。
可以沿用 `add/get/remove/removeAll/contains`、`enabled` 与原生 `positions` 数组的原地修改。

修改在下一次普通渲染生效；使用 `requestRenderMode` 时调用 `viewer.scene.requestRender()`。
颜色、深度、`pickPosition` 和 `world.pickTerrain` 使用同一裁剪范围；
`getTerrainHeight` 和独立 `SceneGISPlanarTerrainSampler` 仍返回源高程。
剖切只隐藏地表，不生成侧壁或封底，不修改地形数据。集合由 World 独占，替换或销毁 World 会销毁集合。

需要 WebGL 2 和浮点纹理，启用后占用一个 fragment sampler。平面实现直接测试边界，
不使用球面的距离场，因此 `quality` 和 `debugShowDistanceTexture` 不影响平面画面。
片元成本随平面数与多边形边数增长；当前验收覆盖交互式少量区域，不承诺大规模区域性能。
本地操作入口为 [地形剖切](../../Test/Planar/地形剖切.html)，完整契约见
[ADR-0081](Decisions/ADR-0081-planar-terrain-clipping.md)。

## CesiumWidget 入口

低层应用可使用 `new CesiumWidget(container, { world })`。应用必须把 `scene.screenSpaceCameraController.enableInputs` 设为 `false`，再通过 `widget.addController` 注册唯一 `SceneGISPlanarCameraController`；销毁 Widget 前先移除 controller。`Viewer({ world })`与`Viewer({ planarWorld })`已自动完成这套顺序。live World入口适合高级调用方；常规应用优先使用raw config，并从readonly `viewer.planarWorld`取得resolved World后再安装provider。

一个 world 只能绑定一个 WebGL `Context`。不要在多个 Widget/Viewer 之间复用同一个 live world。`Scene` 拥有 primary world，销毁 Scene/Widget/Viewer 会销毁 world；imagery layer collection 拥有 layer，但 provider 始终由调用方拥有。

## 环境方向与光照控制权

`SceneGISPlanarEnvironment`必须由调用方构造并通过`addController`注册；同一个live World一次只能注册一个。方向坐标固定为
`+X East/+Y North/+Z Up`，`sunDirection`和`moonDirection`均表示observer-to-body并在赋值时normalize。内部稳定
`DirectionalLight`使用相反传播方向。Getter返回clone，`light`则返回同一诊断reference。

注册成功后`world.environment`立即指向该instance；首次enabled Controller frame才capture既有`scene.light`并取得authority。
Disable/remove会在Environment light仍是当前reference时恢复captured light；外部已替换reference时保留override。active property
mutation、首次authority acquisition与重新enable都会请求一帧，stable update不持续request render。Environment authority
是全Scene的，也会影响Models和3D Tiles；它不会
自动打开`world.enableLighting`。Moon方向在E1不显示Moon、不产生moon light。销毁Viewer/Widget前必须先
`removeController(environment)`；World不会destroy Environment或任何light。

需要天文方向时，应用必须把平面project origin对应的WGS84经纬度显式传给Environment；API使用radians，不读取
`world.crs`或EPSG:3857坐标：

```js
const environment = new SceneGISPlanarEnvironment({
  world,
  sunDirection: Cartesian3.UNIT_Z,
  moonDirection: Cartesian3.UNIT_X,
  directionMode: "astronomical",
  originLongitude: CesiumMath.toRadians(10.0),
  originLatitude: CesiumMath.toRadians(46.0),
});
widget.addController(environment);
widget.clock.currentTime = JulianDate.fromIso8601("2026-06-21T12:00:00Z");
```

`effectiveSunDirection`与`effectiveMoonDirection`是当前host simulation time在该project origin的topocentric ENU方向clone。
整张平面共享同一组方向；它们不随camera、terrain或planar XY变化。Astronomical mode使用同步pseudo-fixed visual-grade
近似，不适用于navigation、survey、eclipse或高精度天文。`sunDirection`/`moonDirection`仍是manual fallback，切回
`directionMode="manual"`时原子恢复；direction publication本身不创建Sun/Moon或moon light。E3的显式opt-in显示语义见
[可见太阳与月亮](#可见太阳与月亮)。

## 导航、Home 与拾取

- PC 输入为 left-drag pan、middle-drag rotate、wheel zoom，默认带惯性；没有 touch 或 pinch。
- 通过 `viewer.planarCameraController` 设置 `inertiaTranslate`、`inertiaSpin`、`inertiaZoom`，
  默认分别为 `0.9`、`0.9`、`0.8`，与 Globe 默认值一致。范围为 `[0,1)`，越大衰减越慢，设为 `0` 关闭。
  短拖动（按下到松开小于 0.4 秒）和滚轮输入在释放后逐渐停止；新的按下操作立即接管，Home、禁用输入、
  模式切换、飞行或跟踪会清除余速。惯性使用真实时间，不受场景时钟暂停影响。
- `SceneGISPlanarCameraController.viewHome(scene)` 和 planar Home button 按当前 viewport 与四类支持的 frustum 重新计算视图。
- `viewer.camera`的`heading`/`pitch`/`roll`、`setView`、`lookAt`、`viewBoundingSphere`、`flyTo`、
  `flyToBoundingSphere`与`flyHome`在live planar World中使用固定`+X East/+Y North/+Z Up`与Cartesian位置。
  Rectangle destination和`flyOverLongitude*`不具有planar语义，会同步抛出`DeveloperError`。
- Camera flight继续使用Cesium tween与complete/cancel callback；飞行期间已注册planar controller暂停input，结束后恢复
  caller原有`enabled`状态，并从下一controller frame继续surface clearance。低层Scene没有controller时仍可flight。
- `Viewer`和低层`CesiumWidget`的`zoomTo`/`flyTo`支持`Entity`、纯`Entity[]`、`EntityCollection`、
  `entities`为真实`EntityCollection`的DataSource及resolve为这些类型的Promise。Entity属性必须已经使用当前World的
  planar Cartesian米制语义；不会转换GeoJSON/CZML/KML坐标或推断CRS。
- framing等待完整`DataSourceDisplay` bounds；empty或无`DONE` bounds返回`false`，PENDING不移动Camera。
- `trackedEntity`只接受真实Entity、defined `ReferenceFrame.FIXED` position与`AUTODETECT/ENU`
  `trackingReferenceFrame`。两种tracking frame都使用固定`+X East/+Y North/+Z Up`，不读取Entity orientation；
  INERTIAL、VELOCITY/body-frame与clamping不支持。当前position gap保留最后pose，native Clock sample恢复后继续。
- 初始tracking优先使用finite non-zero `viewFrom`；否则PENDING bounds等待、DONE bounds复用public Camera framing、FAILED
  bounds使用当前Camera fixed offset。Tracking暂停planar input但不改变controller `enabled`；direct Camera flight结束后恢复，
  successful zoom/fly、Home、Entity removal或clear停止tracking。
- InfoBox camera对当前可track Entity执行track/untrack，对不可track但DONE bounds执行zoom fallback；left-double-click使用同一规则。
- `ImageryLayer`、3D Tiles、point cloud、Voxel、Buffer与plain-object target在planar World中不受支持；直接使用
  `viewer.camera` fixed-axis方法处理应用自有Cartesian bounds。
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

## Camera 属性和方法兼容矩阵

平面继续使用 `viewer.camera`，位置为当前 World 的米制 Cartesian3。
HPR 单位为弧度：固定 +X 东、+Y 北、+Z 上；heading 从北顺时针向东，pitch 向下为负。
heading / roll 使用非负一周范围，pitch 范围为 -π/2 到 π/2。
垂直朝上或朝下时 heading 与 roll 不能唯一分离，读取结果以 roll=0 表达同一姿态。

| 属性 / 方法                                                                                                        | 平面语义                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| position / direction / up / right                                                                                  | Camera 当前 reference frame 下的 Cartesian 状态                                                           |
| positionWC / directionWC / upWC / rightWC                                                                          | 固定平面 world frame 下的状态；高程使用 positionWC.z                                                      |
| heading / pitch / roll                                                                                             | 固定 world axes 下的 HPR，与 reference transform 无关                                                     |
| setView                                                                                                            | Cartesian destination；支持 HPR 或 direction + up，以及 endTransform                                      |
| flyTo / flyToBoundingSphere / flyHome                                                                              | Cartesian 飞行；保留 duration、easing、complete / cancel、cancelFlight / completeFlight                   |
| lookAt                                                                                                             | 移动到 target + offset，并设置以 target 为原点的 translation-only reference frame                         |
| lookAtWorldPosition                                                                                                | 原地看向 world target，固定 +Z up；保留位置与 transform；ellipsoid 参数忽略                               |
| lookAtTransform                                                                                                    | 使用调用方指定 reference frame；offset 相对于该 frame。传 Matrix4.IDENTITY 且不传 offset 可解除目标参考系 |
| viewBoundingSphere / distanceToBoundingSphere / getPixelSize                                                       | 米制 world-space sphere，无经纬度转换                                                                     |
| move / moveForward 等、look / twist / rotate 系列                                                                  | 沿用 Cartesian reference-frame 操作；rotate 围绕当前 reference frame 原点，不自动选择地形 pivot           |
| zoomIn / zoomOut                                                                                                   | 透视沿视线移动；正交按米改变水平 span，不移动位置，最小 span 为 near                                      |
| switchToOrthographicFrustum / switchToPerspectiveFrustum                                                           | 可用；切正交从平面 target range / surface height 获取正尺度                                               |
| getPickRay                                                                                                         | 透视、正交及两种直接 OffCenter 均按实际 bounds 生成 world ray，可传给 world.pickTerrain / world.pick      |
| transform / inverseTransform / viewMatrix / inverseViewMatrix、worldToCameraCoordinates 系列及其反向               | 保留 Cartesian 矩阵和点 / 向量转换语义                                                                    |
| changed / percentageChanged、moveStart / moveEnd                                                                   | 保留原事件接口；changed 使用平面尺度，能检测平移与纯正交缩放                                              |
| getMagnitude                                                                                                       | 当前 reference frame 下 position 的向量长度，不是离地高度                                                 |
| positionCartographic                                                                                               | 仅为 Cesium 内部椭球基底，不能作为平面坐标或高程读取                                                      |
| pickEllipsoid / computeViewRectangle / getRectangleCameraCoordinates、Rectangle destination、flyOverLongitude 参数 | 球面专用，平面同步拒绝                                                                                    |

`Camera.DEFAULT_VIEW_RECTANGLE` / `DEFAULT_VIEW_FACTOR` 不定义平面 Home；Home 按 World extent 拟合。
`maximumZoomFactor` 是 Cesium 2D 参数，平面为 SCENE3D，不采用该参数。
程序调用可指定范围外或地下 Cartesian pose；surface 导航控制器在下一次 update 按现有 clearance 规则纠正高度。
示例 [相机控制](../../Test/Planar/相机控制.html) 可实时查看 HPR、坐标、正交宽度和 changed 计数。

## 影像与加载状态

平面的通用影像来源如下。类名沿用 Cesium 对应名称，加 `SceneGISPlanar` 前缀；所有来源都把
`world.tilingScheme` 原样传入，并通过 `world.imageryLayers.addImageryProvider(provider)` 加入图层。
`alpha`、颜色滤镜、显示顺序和资源所有权不随协议改变。

| 来源                        | 平面 Provider                                         | 主要配置                                                              |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| XYZ / 自定义 URL / TMS 模板 | `SceneGISPlanarUrlTemplateImageryProvider`            | `url`、`urlScheme`、`customTags`、`urlSchemeZeroPadding`              |
| WMS 1.1.1 / 1.3.0           | `SceneGISPlanarWebMapServiceImageryProvider`          | `layers`、`parameters`、`srs` / `crs`、`axisOrder`                    |
| WMTS KVP / REST             | `SceneGISPlanarWebMapTileServiceImageryProvider`      | `layer`、`style`、`tileMatrixSetID`、`tileMatrixLabels`、`dimensions` |
| TMS 元数据                  | `SceneGISPlanarTileMapServiceImageryProvider.fromUrl` | 目录或 XML URL，读取 `tilemapresource.xml`                            |
| 单幅影像                    | `SceneGISPlanarSingleTileImageryProvider.fromUrl`     | 自动读取图像尺寸；覆盖整个 world                                      |

```js
const imagery = new SceneGISPlanarWebMapServiceImageryProvider({
  url: "/services/wms",
  layers: "ortho",
  tilingScheme: world.tilingScheme,
  parameters: { version: "1.3.0", format: "image/png", transparent: true },
  crs: "LOCAL:PROJECT",
  axisOrder: "xy",
});
world.imageryLayers.addImageryProvider(imagery);

const tms = await SceneGISPlanarTileMapServiceImageryProvider.fromUrl(
  "/imagery/",
  {
    tilingScheme: world.tilingScheme,
  },
);
world.imageryLayers.addImageryProvider(tms);
```

WMS 的坐标系默认取 `world.coordinateSystem.crs`，也可显式传 `crs`（1.3.0）或 `srs`（1.1.1）。
这些标识必须代表 world 的实际米制坐标；不会做投影转换。WMS 1.3.0 的 `axisOrder: "xy" | "yx"`
由服务 CRS 的轴定义决定；1.1.1 始终发送 XY。范围、width / height 由网格生成。

WMTS 的 matrix set 必须对应 world 的单根、向下增加行号、逐级二分网格；`tileMatrixLabels[level]`
可以是任意服务标识。KVP 地址和 REST 模板都使用相同选项，REST 支持 `{TileMatrixSet}`、`{TileMatrix}`、
`{TileRow}`、`{TileCol}`、`{Style}`、`{Layer}` 及维度名。更换维度用
`provider.dimensions = { Time: "2026-09-18" }`，不要原地修改 getter 返回的对象；下一 normal frame
会刷新所有引用该 Provider 的图层，旧请求结果不会覆盖新图像。

TMS `fromUrl` 会校验 SRS、BoundingBox、Origin、TileFormat 和 TileSet 分辨率，尊重 href 与 order，
自动把内部 XYZ 行号转成 TMS 行号。不兼容的范围、多根矩阵、局部覆盖、缺失根层或不同分辨率会拒绝，
不会猜测 3857 / 4326。无 XML、已知网格时，可直接构造 TMS provider 并显式配置尺寸与最大层级。
单幅影像允许非正方形像素尺寸，子地形瓦片复用根图的对应部分；提供已知尺寸时也可同步构造。

URL template 在 x/y/z/s 之外支持 `reverseX`、`reverseY`、`reverseZ`、`width`、`height` 和
`westProjected` / `southProjected` / `eastProjected` / `northProjected`。Projected 值就是米制 XY，
`customTags` 的回调签名为 `(provider, x, y, level) => value`，输入地址始终是 canonical XYZ。
`urlSchemeZeroPadding` 与 Cesium 一样以带括号的 tag 为 key，例如 `{ "{x}": "0000" }`。

本项覆盖外部通用影像加载；OpenStreetMap 等普通 XYZ 服务可以直接配置模板。原生 Grid / TileCoordinates
属于程序化诊断图层，不是服务协议。没有增加 ArcGIS、Bing、Google、Ion、Mapbox 等厂商专用适配。
当前未提供 GetCapabilities 自动发现、Clock / times 时序预取、feature picking 或跨 CRS 重投影。
WMS 的静态 TIME 可放在 parameters 中，WMTS 可显式替换 dimensions。交互示例见
[影像服务](../../Test/Planar/影像服务.html)，完整契约见 [ADR-0082](Decisions/ADR-0082-planar-imagery-protocols.md)。

provider 的 `tilingScheme` 必须与 `world.tilingScheme` 是同一对象，不能只具有相同参数。每个 ideal geometry tile 始终提交一个 opaque command；shown layer 自底向顶在单 pass 中合成，因此 layer 数不能超过 WebGL texture image unit 上限。

`world.tilesLoaded` 是当前视图 terrain coverage/readiness 与 shown imagery readiness 的合取。对 imagery contribution，运行时请求 desired tile 与 Level 0 bootstrap；可复用 cache 中最近的 ready ancestor，但不会主动请求中间 ancestor。Recoverable terrain 或 imagery direct content 仍 pending 时结果保持 `false`；terminal failure 配合稳定 fallback 时可 settled。移除 layer、替换 provider 或销毁 world 会取消/隔离请求并释放对应资源，late settlement 不得重新进入 cache。

## 地形、光照与数据边界

### 通过 layer.json 加载地形服务

`SceneGISPlanarLayerTerrainProvider.fromUrl` 接受服务目录、明确的 JSON 地址或 `Resource`。
先等待描述加载完成，再让 World 复用 provider 的 canonical scheme：

```js
const terrain =
  await Cesium.SceneGISPlanarLayerTerrainProvider.fromUrl("/terrain/");
const world = new Cesium.SceneGISPlanarWorld({
  tilingScheme: terrain.tilingScheme,
  maximumLevel: terrain.maximumLevel,
});
world.terrainProvider = terrain;
const viewer = new Cesium.Viewer("map", { world });
```

当前支持 TileWorker 的 `scenegis-planar-heightmap-rgb24-v2` 和
`scenegis-planar-quantized-mesh-v2` 私有米制平面 profile。服务必须声明正方形 `rootRange`、
boundary posts、0 起始层级、每层静态 `available`。`available` 与 Cesium 一致，始终使用 TMS 行号，
不随 URL 的 `scheme=tms/slippyMap` 改变；provider 对外统一为 northwest XYZ。
仅支持上述当前 profile，其余格式统一按不支持处理。
相对瓦片模板、`{version}`、Resource 查询参数与请求头均保留。

正式准备的 TileWorker v2 描述提供 `scenegis.heightRange.minimum/maximum`，由完整源扫描与编码误差推导
保守范围；RGB24 的编码容量另放 `scenegis.encodingRange`。其他服务缺少全局范围时，应用必须在
`fromUrl` options 中提供真实、保守的 `minimumHeight` 和 `maximumHeight`。不能用根瓦片极值代表所有后代。
高度单位为米；NoData 填充值和量化误差也应包含在范围内。该范围描述地表，不包含消费端自行生成的裙边。

向已有 World 挂载时，传入 `{ tilingScheme: world.tilingScheme }`，并按需合并高度范围等 options；
元数据 rootRange 必须与其 extent 完全一致。此入口不执行 CRS 或垂直基准转换。
Globe 的 `quantized-mesh-1.0` / `heightmap-1.0`、动态 availability 和 parent layer 尚不在支持范围内。
低层 URL-template providers 继续用于已知参数的 image/LERC/mesh 接入。

可运行 [地形服务示例](../../Test/Planar/地形服务.html)，切换两种真实 TileWorker 产物。
示例默认直接读取服务公布的高度范围，也支持
`?url=服务地址&minimumHeight=下界&maximumHeight=上界` 显式覆盖。契约见
[ADR-0080](Decisions/ADR-0080-planar-terrain-layer-metadata.md)。

### 运行时与光照

`terrainProvider`由调用方拥有，并且必须引用World的canonical tiling scheme。Runtime维持direct、
upsampled与flat fallback的连续单层coverage，以skirt遮蔽mixed-LOD边缘；terrain geometry与imagery
始终共用每tile一个opaque command。Provider replacement、eviction与World destroy释放World拥有的
request/mesh/GPU资源，但不销毁provider。

`enableLighting`默认关闭。启用后，non-flat Heightmap/Quantized terrain使用Worker按真实surface topology生成的
area-weighted smooth vertex normals；flat/no-provider与active FLAT fallback继续使用fragment geometric normal。
Worker在tile extent真实meter metric中累计normal，2-byte oct stream固定在planar world axes；shader仅作world-to-eye
rotation，避免EPSG:3857大尺度model transform放大量化误差。
`lambertDiffuseMultiplier`可调Diffuse强度。Smooth normals改善同一mesh内共享边和代表性LOD边界连续性，但不保证
任意独立provider tile的boundary gradient完全一致。自定义planar CRS应显式配置稳定`DirectionalLight`，不要依赖
SunLight方向。双面surface允许从上下两侧观察，但lighting始终使用稳定topology-up/planar `+Z` hemisphere，
不会为面向相机而翻转Lambert法线。
相机位于surface下方只在underground mode中是合法状态；surface mode会在下一次enabled controller update沿+Z
恢复minimum clearance而不调用Home。Underground可通过中键orbit显式穿越；continuous/swept collision、free-look
与地下材质仍未实现。

## 支持矩阵与限制

| 能力          | 当前契约                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| extent        | 有限、严格正方形、米制、无 wrap                                                                                                                                            |
| scene mode    | 仅 `SCENE3D`                                                                                                                                                               |
| tiling        | 单个 1×1 root，northwest-origin XYZ；可选 TMS URL 翻转                                                                                                                     |
| surface       | opaque flat/Heightmap terrain、continuous LOD fallback、skirt与可选基础光照                                                                                                |
| imagery       | 同 canonical tiling scheme、无 reprojection、单 pass composition                                                                                                           |
| terrain style | caller-owned `Material`；四个稳定资格builtin与受限custom Fabric，仅组合diffuse/alpha                                                                                       |
| navigation    | PC pan/rotate/wheel 惯性与 Home、public Camera Cartesian view/flight、FIXED Entity tracking、surface clearance与underground crossing；无sweep/touch/body/inertial tracking |
| environment   | 默认无visual sky；可选caller-owned fixed-axis planar SkyBox、planar atmosphere与程序化Sun/Moon，不自动增加Earth sky语义                                                    |
| UI            | planar Viewer 无通用 provider picker、geocoder、mode/projection picker                                                                                                     |
| unsupported   | continuous/swept collision、free-look、universal cross-tile normal stitching、full Globe Material、imagery picking                                                 |

## 性能与调参

低角度透视可以通过 `world.maximumTiltedTileDistance = 100000` 限制地图细节距离，单位为米。
默认 `Infinity` 保持原选层；10° 以下完全采用设置距离，10°–20° 逐渐放宽，20° 以上、俯视拉远
和正交视图不启用该规则。判断使用相机到瓦片三维包围体的最近距离，范围外保留粗覆盖，
相机角度和其他三维对象的可见距离不变。Terrain、imagery 和独立 MVT 共用判定，
祖先与兄弟依赖仍可能越过细节距离；配置过小会让低角度画面大部分只显示粗层。
属性在取得 World 后设置，不是 Viewer `planarWorld` 构造字段。确定性对照见
[本地远景页面](../../Test/vector-tiles/planar-distance.html)，详细契约见
[ADR-0066](Decisions/ADR-0066-planar-tilted-tile-distance.md)。

降低 `maximumScreenSpaceError` 会选择更多 tile；提高 `tileCacheSize` 会保留更多 unprotected tile record。每个 shown imagery layer 会增加 texture/request/cache 成本，但不会增加每个 ideal tile 的 draw command 数。Terrain LERC decode与Heightmap/Quantized mesh在唯一terrain Worker中执行，normal render每帧仍最多启动两个terrain task并promotion两个GPU content。每个non-flat final vertex增加2 bytes oct normal和一个terrain normal vertex buffer；`enableLighting`选择smooth或geometric Lambert variant但不增加command。调参时同时观察 selected/submitted tile、resident tile、request/texture/binding、mesh/promotion与warm-frame allocation；不要仅用单帧 FPS 推断泄漏或稳定性。

release qualification 使用至少 16 个 submitted tiles、bare/双层影像各 120 warm frames、五轮 camera/cache churn、60 次 depth replay，以及重复 Widget/Viewer 生命周期作为确定性门禁。不同机器的 timing 只能作趋势参考。

高级地形交付另使用一个本地 real-Context 资格场景串联 LERC decode、Heightmap/Quantized mesh Worker、provider replacement、surface/underground navigation、smooth lighting、imagery/depth 与资源销毁。每种格式只执行 30 个 warm frames 和 3 轮有界 churn；hard gate 是 readiness、command/VA/shader/task/GPU/resource 收敛，median/P95 timing 仅作同机诊断，不是固定性能阈值。公网 terrain 与 imagery 只属于 Sandcastle 的 best-effort 人工检查，不进入自动化门禁。

统一styling交付另以一个最小real-Context场景和同一local dev/release E2E证明非默认imagery filter → Material
diffuse/alpha → lighting的公开链路，并检查uniform mutation不会替换DrawCommand、ShaderProgram、VA、imagery texture或
terrain mesh。Installed-package verifier逐项要求8个SceneGIS GLSL source及其8个generated shader module，同时验证S2/S3
runtime properties、declarations与API member anchors；Node consumer只检查对象契约和caller ownership，不模拟WebGL、DOM或
network。两个公开Sandcastle示例的用户工具面板使用中文，公网数据仍只属于best-effort人工验收。

统一environment交付复用现有real-Context Widget aggregate，并在同一个blocked-network local dev/release Viewer场景中串联
caller-owned `SceneGISPlanarEnvironment`、astronomical host Clock方向、visible Sun/Moon、planar atmosphere与generated local
`SceneGISPlanarSkyBox`。该E2E使用无terrain provider的flat world，因此时间变化必须保持stable light、body/atmosphere
commands、Surface tile/command/shader/VA与imagery binding/texture identity；真实terrain mesh identity由前述Environment
Widget aggregate覆盖。Pick/depth、wheel/Home、World/Controller/SkyBox caller ownership和public network attempts=0继续作为
同一门禁。Installed-package verifier要求12个SceneGIS GLSL source及其12个generated shader module，并验证E1-E4 runtime、
declarations、API anchors与private hiding；Node consumer不模拟WebGL、DOM或network。

## 故障排查

- 构造期 `DeveloperError`：检查 extent/span 是否有限且正方形、maximum level 是否安全、provider 是否复用 exact `world.tilingScheme`。
- extent 外拾取为 `undefined`：这是 public bounded mathematical pick 的预期行为。
- 远程影像空白：检查 CORS、URL scheme、credit、`errorEvent`、retry 和服务 SLA；baseColor/ready ancestor 是正常降级。
- 远程terrain保持flat/ancestor：检查boundary sample dimensions、format/structure、provider height range、
  availability、CORS与`errorEvent`；terminal failure配合稳定fallback可以报告`tilesLoaded=true`。
- 光照方向不稳定：为`scene.light`设置显式`DirectionalLight`；自定义CRS不会改变默认SunLight语义。
- 第二个 Context 报错：为每个 Widget/Viewer 创建独立 world。
- Viewer option 冲突：`world`、`planarWorld`与defined `globe`互斥；planar Viewer不接受Globe imagery/terrain/map-projection/provider-picker选项。
- 已销毁对象报错：不要在 Scene/Viewer destroy 后继续 render、pick 或复用 controller/world。

### 可见太阳与月亮

`SceneGISPlanarEnvironment`的`showSun`与`showMoon`默认关闭。启用后，procedural body严格使用
`effectiveSunDirection`/`effectiveMoonDirection`，尺寸由`sunPixelSize`/`moonPixelSize`（CSS pixels）控制；
`moonColor`只影响月亮外观，月亮不产生第二光源。对应native `scene.sun`或`scene.moon`必须未定义或显式
`show=false`。天体低于planar horizon、在camera后方或camera实际位于resident terrain下时隐藏，且会被后续
terrain/model自然遮挡。它们不提供pick、depth、shadow、月相或atmosphere语义。

### 平面 SkyBox 与大气

`showAtmosphere`默认关闭。启用后，`atmosphereZenithColor`与`atmosphereHorizonColor`定义visual-grade RGBA，
`atmosphereIntensity`控制强度，`atmosphereFadeHeight`是米制视觉淡出尺度；它们不代表Earth physical atmosphere。
Atmosphere只使用planar camera、resident terrain和`effectiveSunDirection`，不会安装native `SkyAtmosphere`。

需要固定轴SkyBox时，先准备六个已经加载且同类型的image/canvas face，再由调用方管理生命周期：

```js
const planarSkyBox = new SceneGISPlanarSkyBox({
  sources: {
    positiveX: eastImage,
    negativeX: westImage,
    positiveY: northImage,
    negativeY: southImage,
    positiveZ: upImage,
    negativeZ: downImage,
  },
});
environment.skyBox = planarSkyBox;
environment.showAtmosphere = true;

// Before destroying the Widget/Context:
environment.skyBox = undefined;
viewer.removeController(environment);
planarSkyBox.destroy();
```

不要把planar SkyBox传给`CesiumWidget`的`skyBox` option或写入`scene.skyBox`。ADR-0039/I4已取代早期允许planar atmosphere与
visible native generic SkyBox共存的说明；live non-Globe Scene的visible native SkyBox/SkyAtmosphere/Sun/Moon始终冲突，
`SceneGISPlanarEnvironment`是唯一受支持的sky、atmosphere和body路径。Camera低于resident terrain时SkyBox、atmosphere和可见
天体统一隐藏；普通terrain/model仍在它们之后绘制并自然遮挡。Renderer中保留的opaque background mask只是private defensive
compatibility seam，应用不得依赖它配置native sky。

## Scene API 资格与安全边界

平面Scene支持通用SCENE3D Cartesian API：`Camera.getPickRay`、`Scene.cartesianToCanvasCoordinates`、
`SceneTransforms` window/drawing-buffer transforms、`Scene.pick`、`drillPick`、`pickPosition`以及World terrain query。普通private
ray pick具有回归证据；`*MostDetailed` ray仍是3D Tiles-specific，不属于SceneGIS承诺。

以下入口保留Cesium的Earth/ellipsoid含义，因此在live non-Globe World中同步抛`DeveloperError`：
`Scene.sampleHeight*`、`clampToHeight*`、`Camera.getRectangleCameraCoordinates`、`pickEllipsoid`、
`computeViewRectangle`。平面高度改用`world.getTerrainHeight`、`world.pickTerrain`或`SceneGISPlanarTerrainSampler`。应用读取Camera
Cartesian `positionWC`/`position`；`positionCartographic`与`Scene.ellipsoid`只是Cesium内部ellipsoid projection/substrate，不是
项目CRS。

planar Widget/Viewer只接受SCENE3D/3D-only，并拒绝defined ellipsoid、map projection、2D mode或native
skyBox/skyAtmosphere。构造会关闭默认Fog；运行中visible native SkyBox/SkyAtmosphere/Sun/Moon、enabled Fog在frame发布前
失败。hidden/disabled对象可以保留且仍由原caller/Scene ownership管理；修正后下一frame可恢复。使用
`SceneGISPlanarEnvironment`提供平面sky、bodies和atmosphere。

## Planar API 统一交付

V1与I1-I4的公开路径作为同一交付单元验证：`Viewer({ planarWorld })`先解析唯一planar World与controller，public
`Camera`完成fixed-axis view/bounds/flight，`Viewer.zoomTo/flyTo`消费受支持的Entity/DataSource profile，
`trackedEntity`按native Clock跟随FIXED position，最后由Scene API safety阻止ellipsoid height/clamp、globe-only Camera入口和
native Fog/Shadow/Earth environment产生伪平面语义。Dev与release使用同一个blocked-network Viewer case；应用不得把3D Tiles
MostDetailed、GeoJSON/CZML/KML转换、clustering或planar Fog/Shadow误认为已包含在该矩阵中。

Installed-package verifier除公共声明、API HTML、ESM/CJS与12个GLSL/12个generated shader modules外，还显式锁定以下运行时文件：

- engine：`_SceneGISPlanarCamera.js`、`_SceneGISPlanarCameraFlight.js`、`_SceneGISPlanarEntityFraming.js`、
  `_SceneGISPlanarEntityTracker.js`、`_SceneGISPlanarSceneApi.js`；
- widgets：`_SceneGISPlanarViewerBootstrap.js`。

这些underscore export只用于SceneGIS package间的soft-private组装与交付验证，不是稳定public API；相应无underscore拼写必须保持
不可公开导入。升级或应用代码不得依赖其参数、状态或内部resource identity。

## 平面级联阴影

按 [ADR-0083](Decisions/ADR-0083-planar-cascaded-shadows.md)，平面复用 Cesium 四级 ShadowMap。
公开入口保持原有命名：

```js
const viewer = new Cesium.Viewer("cesiumContainer", {
  planarWorld: { coordinateSystem },
  shadows: true,
  terrainShadows: Cesium.ShadowMode.ENABLED,
});
viewer.scene.shadowMap.softShadows = true;
viewer.scene.shadowMap.maximumDistance = 1000;
viewer.scene.shadowMap.size = 2048;
entity.box.shadows = Cesium.ShadowMode.ENABLED;
```

`viewer.shadows` 控制全局；`viewer.terrainShadows` 对应 `world.shadows`，支持原生四种
`ShadowMode`，World 默认 `RECEIVE_ONLY`。普通 Planar Primitive / 非 Model Graphics 默认
`DISABLED`，Model 默认 `ENABLED`，与相应 Cesium 类型一致。属性更新不重建几何。
`scene.shadowMap` 继续控制距离、分辨率、软阴影、最低亮度及级联调试颜色。

四级使用固定光照坐标基、包围球和世界纹素网格对齐；末端 10% 重叠混合，PCF 不跨 atlas
分区采样。坡度偏移随级联纹素尺寸变化，减少自阴影条纹。透视、正交及大平面 XY 均保持
固定 +Z 语义。地表剖切同步作用于投影；`world.opacity` 仅改变地表贡献，背景不接收该地表阴影。

只对已提交的地形瓦片投影，不额外预取离屏山体。远距离、低太阳高度和小物体受有限纹素精度
及偏移影响。`size` 是每级尺寸，四级 atlas 边长为两倍；不要只提高距离而不考虑分辨率。
实体连续贴地分类覆盖、矢量瓦片和标注不在本阶段新增投射/接收资格。现有高级物理光照可与
几何阴影组合，但原生模型/地表的几何阴影仍衰减最终表面颜色，间接光和自发光分离另行处理。
开发示例：`Test/Planar/级联阴影.html`。
