# 矢量瓦片平面验收

根开发服务器入口：`/Test/vector-tiles/index.html`。当前页面直接使用
`/Build/CesiumUnminified/index.js`，不需要打开 Sandcastle。

从仓库根启动 `npm run start -- --no-embeddings`，然后访问
`http://localhost:8080/Test/vector-tiles/index.html`。已有该仓库的根服务器时直接复用；
上游 server 同时绑定固定的 8081 镜像端口，因此只改变 `--port` 不能启动第二个实例。

## 数据与人工验收

`generate-fixtures.mjs` 自行生成合成城市，不使用外部地图、token、glyph 或 sprite。
`tiles/` 含 MVT 2.1 的 z=0..2 完整金字塔，共 21 个文件、83,969 字节。
源数据共 320 个要素，分为 land/water/buildings/roads/places；
相邻 tile 保留 buffer 和一致 feature ID，几何不预裁成地图颜色纹理。
这些数据仅用于调试和验收，不表示真实地理对象。

重新生成：`node Test/vector-tiles/generate-fixtures.mjs`。
数据作者为 SceneGIS，随仓库许可证分发；protobufjs 仅用于离线 fixture 编码。
页面通过公开的独立 source/decoder/style/layer 加载 PBF。

- 全图俯视：公园、建筑、水域、道路底边/上层、圆形 POI 的顺序。
- 中央街区：放大后线宽与圆半径保持 CSS 像素尺寸；source 在 z=2 后继续复用。
- 倾斜视角：直接矢量保持在 Z=0 平面，道路和屏幕圆点连续显示。
- 湖心岛是 polygon hole；河道跨 tile，观察透明水域在共享边是否变深或断裂。
- 点击中央广场、道路、水域，确认返回业务属性、style layer、tile 和 feature ID。
- 隐藏/显示、移除并重建：确认命令消失、恢复和无控制台错误。
- 逐块加载演示：重新加载全图，再自动放大并让子瓦片分批完成。观察旧图保留、
  每块独立替换且透明颜色不加深；最终“替代瓦片”归零，再点击中央广场确认源 tile 切换。

演示通过页面的 source 子类延迟返回真实 PBF 的解析结果；延迟仅用于此 Test 页面，
产品没有模拟延迟或特殊测试分支。不同 LOD 的 MVT 量化可造成小幅边缘跳动。
V2 画面及 V3A 逐块加载过渡均已由项目负责人验收通过。
V3B0 改用自有 GPU 图元，保留上述视觉基线；拾取复用 Cesium 的 DrawCommand 自动派生。

V3B1 新增 `/Test/vector-tiles/styles.html` 样式图集，城市页面顶部可直接进入。
`style-cases.mjs` 定义 12 个案例、17 个要素；`generate-style-fixture.mjs` 编码
`styles.pbf`，重新生成命令为 `node Test/vector-tiles/generate-style-fixture.mjs`。
使用独立的本地米制 World 验证同一 MVT 数值契约，城市页面继续验收 3857。
全部案例关闭 MSAA/FXAA，以便直接检查自有 coverage：

- 三种 cap 与三种 join，半透明拐角保持普通连接处颜色一致。
- 同一 batch 内不同周期虚线、零长度圆点虚线、带 offset 的 gap 双轨。
- 带孔洞的面边界 AA、不同 circle blur 和 line blur。
- 俯视/倾斜、逐要素拾取、移除重建；页面标题采用 DOM 标签，不代表 symbol 已实现。

当前没有 terrainProvider 或 symbol 渲染；拐角 dash 随网格变形，跨 tile 相位不保证连续，
也不承诺 MapLibre 逐像素一致性。新增图集已于 2026-09-13 通过负责人视觉验收。颜色与样式契约见
[VectorTiles](../../Documentation/SceneGIS/VectorTiles.md)。

## 自动化与测量

新增 `/Test/vector-tiles/public.html` 直接加载在线 MVT，支持柏林、纽约、上海与北京定位，
俯视/倾斜、16 级街道细节、拾取、重建、样式排除清单和 CPU 测量。
公开页采用透视相机，中键可倾斜；选层复用平面影像/地形 SSE，近处细、远处粗，
显式预算为 64 desired / 128 cached。5° 浅俯角回归检查地面覆盖和比例，
地平线以上保留未配置天空的场景背景。尺寸对照图集继续使用正交相机。
默认使用免 token 的 OpenFreeMap / Bright，与用户参考项目的
`test/examples/display-buildings-in-3d.html` 和 `add-a-vector-tile-source.html` 相同。
可切换 Liberty 作样式对照；不需要 Mapbox 账户或 token。
连接失败明确显示错误并保留原地图，不自动更换数据。

V3C0 基线接入 Bright 93/119 层、Liberty 82/111 层；V5A 点标注扩展后的当前范围见下文，未渲染的层有逐项原因。
参见 [参考、差距和授权](reference/README.md)。Streets 固定 JSON 仅作后续离线样式参考，
官方 Mapbox 数据已移出本轮范围；当前真实公网 smoke 为 OpenFreeMap。
按用户本轮要求启用公网示例；服务不可用时可手动返回本地城市，不自动切换数据。

`Specs/e2e/scenegis-vector-tiles.spec.js` 覆盖真实 PBF、颜色像素、requestRenderMode、
拾取、倾斜、重建、父子替换中间状态和样式图集，共 3 项；112 项矢量单元和真实 Context 回归在
`packages/engine/Specs/SceneGIS/`。
E2E 使用仓库默认配置时，需要释放 8080/8081 给其根服务器，不能同时运行第二个开发服务器。

新增 `Specs/e2e/scenegis-vector-public.spec.js` 的 3 项 E2E 拦截外网，使用本地
`public-fixture.pbf` 与固定样式快照，覆盖两个入口、实际选层、pick、重建、
Bright/Liberty 切换销毁旧图和 HTTP 503 连接失败保留旧图。生成命令为
`node Test/vector-tiles/generate-public-fixture.mjs`。

“测量 60 帧”记录 preRender 到 postRender 的 CPU 提交时间，包含该页正常组装开销，
不含 GPU 完成、浏览器合成或初次 bundle 下载。诊断暴露为 `window.vectorTilePreview`。
该小数据集用于建立 V2 baseline，不代表密集真实地图的吞吐量。

公开地图暴露 `window.publicVectorPreview`。其 60 帧测量记录
preRender 到 postRender 的 CPU 提交、正常视图统计、请求数、接收字节和解码耗时。
firstReadyMs 从创建图层到当前视图首次无失败就绪，排除页面 bundle 与样式/TileJSON 获取；
要素数包含解码但尚未渲染的 POI/标注。指标是一次图层生命周期的累计值；
如需独立地点/zoom 的冷启动对比，定位后使用“重建图层”，不要把累计数当作当前可见要素。

## V5A 点标注

`/Test/vector-tiles/symbols.html` 完全本地运行，中英文、描边、图文 POI 与排序避让均来自自有
glyph/icon DrawCommand。7 个合成候选显示 6 条，左下低优先级文字被避让。
点击文字或图标返回相同业务 identity；“连续缩放”“倾斜”“重建图层”用于检查尺寸与生命周期。
资源与授权见 [symbol-assets](symbol-assets/README.md)，重新生成使用
`node Test/vector-tiles/generate-symbol-fixture.mjs`（仅生成命令需要网络）。

新增 2 项 `scenegis-vector-symbols.spec.js` E2E 检查实际文字 alpha 拾取、图标、倾斜、缩放、
资源销毁与双倍渲染分辨率。公开页新增 15 个 point symbol layers：Bright 108/119、Liberty 97/111。
“街道细节”显示 16 级 POI；字体/sprite 请求失败与 sprite 缺少名称分别显示错误和提示。
公开页显式使用 `maximumGlyphRanges: 192`，供多字体中文街区；Layer 默认仍为 64。
支持范围和限制见 [点标注文档](../../Documentation/SceneGIS/VectorTileSymbols.md)。
