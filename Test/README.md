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
- `Planar/示例目录.html`：八个独立功能入口，涵盖基础平面、公开影像地形、影像调色、地形材质、相机控制、实体定位、跟踪、日月天空。
- `Planar/tests/`：原四个综合页面，仅保留为维护诊断；原根目录 URL 导向新功能页。

平面功能页仅“影像与地形”访问公开 Esri 服务，其余使用本地确定性图案与高程图。
每页直接展示所需公共 API，控件使用默认 lil-gui，说明独立于控件面板。旧综合测试页的公开服务与诊断配置保留。

根开发服务器为 `/Build/CesiumUnminified/index.js` 维护增量构建上下文，并监听 engine、widgets 与
Shader 源码。修改源码后刷新示例页面，即会请求最新开发 bundle；不需要单独构建或启动 Sandcastle。

页面结构、runtime identity、中文 UI、本地数据、资源释放和第三方库规则见 [AGENTS.md](AGENTS.md)。

本目录的格式检查需显式绕过upstream `.prettierignore`的root allowlist：

```powershell
npx prettier --check --ignore-path .gitignore "Test/**/*.html" "Test/**/*.md"
```
