# 平面功能示例

从[示例目录](示例目录.html)开始。每项均有独立中文 HTML 与同名 JS，直接创建 Viewer 并调用对应公开 API；
说明与 lil-gui 分开，保留第三方默认样式，不在示例中执行断言、销毁测试或性能资格矩阵。

- [基础平面](基础平面.html)：用 Viewer({ planarWorld }) 创建本地米制平面。X 向东、Y 向北、Z 向上；左键平移，中键旋转，滚轮缩放。
- [影像与地形](影像与地形.html)：接入 EPSG:3857 的公开影像和 LERC 地形，使用同一个 tilingScheme。默认查看南京紫金山；网络不可用时仍可浏览底色平面。
- [地形服务](地形服务.html)：读取 layer.json，自动配置 TileWorker 私有平面 RGB24 或 quantized-mesh 地形，使用本地真实产物。
- [地形剖切](地形剖切.html)：复用 Cesium 裁剪集合，演示平面交/并、动态剖切、凹多边形与反向裁剪。
- [影像调色](影像调色.html)：影像图层直接支持亮度、对比度、饱和度与色相调整。本地示意图用于观察颜色变化，替换 URL 即可接入瓦片服务。
- [地形材质](地形材质.html)：用已知高度范围的地形显示等高线、高程、坡度和坡向。这里的灰度图是一块本地合成山地；真实服务接入见“影像与地形”。
- [相机控制](相机控制.html)：实时查看 Cartesian 坐标与 HPR，验证 setView / flyTo、原地朝向、正交切换与缩放；位置使用米，界面角度使用度。
- [实体定位](实体定位.html)：Entity 使用平面 Cartesian3 位置。Viewer.zoomTo 与 flyTo 可以定位单个实体，也可以定位整组 CustomDataSource。
- [实体跟踪](实体跟踪.html)：用 FIXED 位置和 Cesium 原生 Clock 驱动移动实体。开启跟踪后，相机会随实体移动；关闭跟踪即可恢复自由浏览。
- [日月与天空](日月与天空.html)：以南京经纬度作为天文参考，日月方向由 Clock 决定。平面坐标自身不隐含地理位置；这里展示基础天空，物理大气另见高级环境。

- [影像服务](影像服务.html)：切换 XYZ、TMS 元数据、WMS、WMTS KVP / REST 和单幅影像，统一使用本地米制坐标。
  `data/imagery-service/` 是原创 PNG 示意图及标准 TMS XML；WMS/KVP 使用带查询参数的本地固定图像响应，
  不包含真实后端服务或裁图实现。协议参数、Y 行号和元数据错误由 Specs 覆盖，浏览器验证真实图像上传和方向。

仅“影像与地形”访问公网，保留来源署名、服务失败提示和已有底色平面行为。
其他示例使用本地 LOCAL 米制坐标和原创 PNG 示意图。data/height.png 是 65×65 灰度高程图，
首通道 0–255 映射为 0–3000 米，只供一块 level 0 的合成地形，不代表真实区域。
执行 `node Test/Planar/data/generate.mjs` 可重建五份 PNG；使用无外部依赖的确定性像素生成。

共用文件仅为 Test/examples.css、example-lifecycle.js（BFCache/pagehide 释放）和 data/ 静态数据，
无产品 API 包装层。window.example 仅供开发者控制台查看运行对象。
旧四页移至 tests/ 保留综合诊断；旧 URL 导向新的功能示例。

使用已有根服务器打开 /Test/Planar/示例目录.html。页面回归见 Specs/e2e/scenegis-feature-examples.spec.js，
通过 Test/playwright.examples.config.mjs 连接 8080，不启动 Sandcastle。

## 级联阴影

`级联阴影.html` / `级联阴影.js`：本地地形、建筑和 glTF 的四级阴影。全景观察远处山体，
近景观察建筑接触与级联交界；可切换投射/接收、低太阳高度、剖切与正交投影。复用原生阴影 API。
