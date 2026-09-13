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

`Specs/e2e/scenegis-vector-tiles.spec.js` 覆盖真实 PBF、颜色像素、requestRenderMode、
拾取、倾斜、重建、父子替换中间状态和样式图集，共 3 项；87 项单元和真实 Context 回归在
`packages/engine/Specs/SceneGIS/`。
E2E 使用仓库默认配置时，需要释放 8080/8081 给其根服务器，不能同时运行第二个开发服务器。

“测量 60 帧”记录 preRender 到 postRender 的 CPU 提交时间，包含该页正常组装开销，
不含 GPU 完成、浏览器合成或初次 bundle 下载。诊断暴露为 `window.vectorTilePreview`。
该小数据集用于建立 V2 baseline，不代表密集真实地图的吞吐量。
