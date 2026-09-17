# SceneGIS 开发示例

本目录保存绕过 Sandcastle、由 Cesium 根开发服务器直接交付的 SceneGIS 人工示例。

从仓库根目录启动：

```powershell
npm run start -- --port 8092 --no-embeddings
```

随后访问中文示例入口：

```text
http://localhost:8092/Test/index.html
```

受管页面按大扩展拆分：

- `vector-tiles/planar-city.html`：独立 MVT 平面渲染、本地城市数据与 feature pick；无公网依赖。
- `平面Viewer.html`：声明式`Viewer({ planarWorld })`、EPSG:3857公开数据与基础导航。
- `平面地表样式.html`：影像颜色滤镜与terrain `Material`样式。
- `平面环境.html`：天文方向、原生Clock、可见天体、平面大气与SkyBox。
- `平面API集成.html`：公共Camera视图/飞行和Entity/DataSource framing。

四页都使用相同的best-effort公开OSM影像与Esri Terrain3D地形事实；服务不可用时仍以baseColor/flat fallback启动。

根开发服务器为 `/Build/CesiumUnminified/index.js` 维护增量构建上下文，并监听 engine、widgets 与
Shader 源码。修改源码后刷新示例页面，即会请求最新开发 bundle；不需要单独构建或启动 Sandcastle。

页面结构、runtime identity、中文 UI、本地数据、资源释放和第三方库规则见 [AGENTS.md](AGENTS.md)。

本目录的格式检查需显式绕过upstream `.prettierignore`的root allowlist：

```powershell
npx prettier --check --ignore-path .gitignore "Test/**/*.html" "Test/**/*.md"
```
