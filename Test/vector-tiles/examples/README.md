# 矢量地图上手

复用根开发服务器，打开 [示例目录](示例目录.html)。未启动时在仓库根运行
`npm run start -- --no-embeddings`，不使用 Sandcastle。

| 场景           | 页面                      | 完整初始化代码             |
| -------------- | ------------------------- | -------------------------- |
| EPSG:3857 平面 | [平面地图](平面地图.html) | [平面地图.js](平面地图.js) |
| WGS84 球面     | [球面地图](球面地图.html) | [球面地图.js](球面地图.js) |

每页按顺序创建 Viewer、设置相机、读取 Bright 样式与 TileJSON，最后把
`SceneGISVectorTileLayer({ scene, style })` 加入 `scene.primitives`。
两份 JS 各自包含完整初始化，CSS 只负责外观；没有高级环境、地形切换或性能调试面板。
FPS 使用 Cesium 原生显示；说明卡片下方独立的 lil-gui 面板控制矢量不透明度（0..1，默认 1），保留库的默认样式。

GUI 直接绑定公共属性，两种世界用法一致：

```js
gui.add(layer, "opacity", 0, 1, 0.01).name("矢量不透明度");
```

使用本地 `/Test/lib/lil-gui/lil-gui.esm.min.js`，复制示例到自己的项目时也可改用安装的 `lil-gui` 包。

平面通过 `planarWorld` 声明坐标范围与最大层级，相机位置使用投影米制坐标。
球面保留原生 Globe 的零高程地表，通过 `Cartesian3.fromDegrees` 经纬度定位。
平面 Layer 自动使用 World 的切片方案，Globe Layer 默认使用 EPSG:3857 单根切片方案。
请求、MVT 解码、Worker 准备和渲染由 Layer 管理。

## 替换数据

1. 把样式 URL 改为自己的 style JSON。
2. 已有 `sources.*.tiles` URL 模板时，省略 TileJSON 获取步骤；否则先解析服务目录。
3. 各层 `source-layer`、属性名、最大层级、glyphs 与 sprite 地址应与自己的数据对应。

资源 URL 使用绝对地址或以 `/` 开头的路径。MVT tile matrix 必须匹配世界坐标范围，
不能靠修改 CRS 名称完成重投影。

当前示例使用仓库固定 Bright 快照，显式排除尚不支持 fill-translate 的 building-top；
多字体使用 `maximumGlyphRanges: 192`。完整范围见
[矢量瓦片](../../../Documentation/SceneGIS/VectorTiles.md) 与
[标注说明](../../../Documentation/SceneGIS/VectorTileSymbols.md)。

## 网络与清理

两页均需要网络、无需 token；保留 TileJSON 署名，来源与许可见 [公开资源](../reference/README.md)。
服务失败会显示错误，不会自动换源。按负责人要求已删除本地上手示例；
页面的“离线测试”链接指向保留的测试入口，使用合成数据验证功能，不表示真实地图。

Viewer 销毁会释放图层、Worker 和 GPU 资源。pagehide 区分 BFCache，实际离开时销毁 GUI 与 Viewer；
异步加载结束后检查 Viewer 是否已销毁。`window.vectorExample` 只供控制台检查。
