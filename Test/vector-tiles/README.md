# 矢量地图示例与测试

程序员先看 [中文上手目录](examples/示例目录.html)：
[平面地图](examples/平面地图.html)、[球面地图](examples/球面地图.html)，各有独立同名 JS。
两页只展示 Viewer、相机、样式和 Layer 接入，需要网络、无需 token。
替换数据见 [上手说明](examples/README.md)。本地上手版已删除。

复用仓库根服务器；未启动时运行 `npm run start -- --no-embeddings`，默认端口 8080。
无需 Sandcastle。所有页面只导入 `/Build/CesiumUnminified/index.js`，使用 Cesium 原生 FPS。

## 测试入口

旧测试页保留有实际回归用途的能力，按世界命名；不再提供高级环境、环境参数和时间控件。

| 世界 | 页面                                 | 验证内容                                                  |
| ---- | ------------------------------------ | --------------------------------------------------------- |
| 平面 | [综合地图](planar-map.html)          | Bright/Liberty、真实地形、倾斜、拾取、图层重建与 CPU 测量 |
| 平面 | [城市](planar-city.html)             | 本地 MVT 金字塔、洞/透明层序、逐块替换、拾取              |
| 平面 | [样式](planar-styles.html)           | cap/join、dash/gap、fill AA、circle blur                  |
| 平面 | [点标注](planar-symbols.html)        | 中英文、图文 POI、避让、拾取与缩放                        |
| 平面 | [沿线标注](planar-line-symbols.html) | 曲线文字、路牌、箭头、反向道路与锐角限制                  |
| 平面 | [远景](planar-distance.html)         | 低角度地形/影像选层限制及俯视拉远对照                     |
| 球面 | [综合地图](globe-map.html)           | 原生椭球与地形、地图/标注贴地、整球缩放和资源释放         |

`planar-map.js` 和 `globe-map.js` 各自初始化 World、相机和地形；
`map-test.js` 仅共用测试面板、数据接入、拾取与测量，没有根据 DOM 切换世界的分支。
`map-test.css` 是测试面板样式，不被上手页加载。

两个综合测试入口支持 `?provider=local`、`bright`、`liberty`。
球面默认 local；平面默认 bright。local 使用合成 MVT 和已提交字体，不代表真实城市。
其他平面图集全部本地运行。公开服务失败会明确报错并保留已有地图，可手动选择本地测试数据。

地形开关：平面使用 Esri 3857 单根 LERC 高程；球面 local 使用确定性高度函数，在线使用 Esri 原生 provider。
关闭恢复平面零高程或原生椭球。仅保留基础地形光照，矢量直接贴地。
产品高级环境能力及 engine/release 验证仍在，本目录不再组装环境。

综合页增加矢量不透明度；球面页另外提供地表不透明度与本地网格影像不透明度。
矢量 `opacity` 乘各要素样式 alpha；地表为 0 时仍保留贴地深度，影像 alpha 只改变下层颜色。
首轮仅支持当前可见球面，背面/地下和整个 Planar World 透明后续扩展。

## 数据和工具为何保留

以下文件均有生成、自动化或性能复现用途，不是重复上手页面。

- `tiles/`、`style.json`：城市 21 个 MVT 金字塔与样式；`generate-fixtures.mjs` 可重建。
- `styles.pbf`、`style-cases.mjs`：样式图集；`generate-style-fixture.mjs` 可重建。
- `public-fixture.pbf`：综合地图与 E2E 的五个合成要素；`generate-public-fixture.mjs` 可重建。
- `symbol-assets/`、`line-symbol-assets/`、对应 cases 与 generate 脚本：点/沿线标注、字库和图标；
  许可证见 [点标注资源](symbol-assets/README.md)、[沿线资源](line-symbol-assets/README.md)。
- `reference/`：Bright/Liberty 固定样式、显式兼容清单与来源许可；Streets 保留为后续样式审计参考。
- `profile-motion.mjs` 和三个 camera JSON：已反馈性能/道路尺寸问题的复现材料。
- `verify-worker-package.mjs`：独立 engine 安装包、release ESM/IIFE 的 Worker、Globe、贴地和环境交付验证。

合成 MVT 由 SceneGIS 编写，随仓库许可分发。Noto 字库使用 SIL OFL；公开样式与数据署名见
[来源和支持范围](reference/README.md)。不在仓库分发真实公开地图瓦片。

## 自动化与测量

`Specs/e2e/scenegis-vector-*.spec.js` 验证页面组装，使用本地 MVT、字体、sprite 和服务拦截。
高级环境页面 E2E 随环境页面功能移除；产品 engine Specs 与发布脚本中的环境检查保留。

`npx playwright test -c Test/vector-tiles/playwright.config.mjs`

此命令连接已有服务器，不会启动 Sandcastle。产品源码/Specs 变更仍按
[开发指南](../../Documentation/SceneGIS/DevelopmentGuide.md) 的 engine 构建与测试流程验证。
发布验证仅在完成 build-release 与 build-ts 后运行 `node Test/vector-tiles/verify-worker-package.mjs`。

综合地图暴露 `window.publicVectorPreview`；“测量 60 帧”是 preRender 到 postRender 的 CPU 提交耗时，
不含 GPU 完成或浏览器合成。首次就绪时间不含样式与 TileJSON 下载；请求数/字节数为当前 Layer 生命周期累计值。
原生 FPS/MS 与 CPU 测量不是同一指标。

运行 `node Test/vector-tiles/profile-motion.mjs before` 记录固定南京轨迹；
`node Test/vector-tiles/profile-motion.mjs after Build/Specs/vector-motion/before.har` 重放服务响应。
输出只写忽略的 Build/Specs；Profiler 本身影响耗时，不能用 headless 帧时代表应用 FPS。
球面相机可通过 `globe-performance-camera.json` 恢复；两个 nanjing camera 文件分别保留标注旋转与道路浅俯角视图。

既有资格与限制见 [矢量瓦片](../../Documentation/SceneGIS/VectorTiles.md)、
[标注](../../Documentation/SceneGIS/VectorTileSymbols.md) 与 [阶段记录](../../AgentDocs/vector-tiles/README.md)。
