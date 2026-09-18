# SceneGIS 开发示例

本目录保存绕过 Sandcastle、由 Cesium 根开发服务器直接交付的 SceneGIS 人工示例。

从仓库根目录启动：

```powershell
npm run start -- --port 8080 --no-embeddings
```

随后访问中文示例入口：

```text
http://localhost:8080/Test/index.html
```

受管页面按大扩展拆分：

- `vector-tiles/examples/示例目录.html`：平面与球面矢量地图的上手示例。
- `Planar/示例目录.html`：独立功能入口，涵盖基础平面、公开影像地形、影像调色、地形材质、相机控制、实体定位、跟踪、日月天空。
- `Planar/tests/`：原四个综合页面，仅保留为维护诊断；原根目录 URL 导向新功能页。
- `AdvancedEnvironment/示例目录.html`：大气、雾、云、日月光照、泛光与光晕；球面和平面分别提供独立页面。
- `AdvancedEnvironment/tests/`：原高级环境综合页面，保留历史诊断和相关回归入口。

平面功能页仅“影像与地形”访问公开 Esri 服务，其余使用本地确定性图案与高程图。
每页直接展示所需公共 API，控件使用默认 lil-gui，说明独立于控件面板。旧综合测试页的公开服务与诊断配置保留。
新的高级环境功能页全部使用本地资源，旧高级环境 URL 导向功能目录。

根开发服务器为 `/Build/CesiumUnminified/index.js` 维护增量构建上下文，并监听 engine、widgets 与
Shader 源码。修改源码后刷新示例页面，即会请求最新开发 bundle；不需要单独构建或启动 Sandcastle。

页面结构、runtime identity、中文 UI、本地数据、资源释放和第三方库规则见 [AGENTS.md](AGENTS.md)。

本目录的格式检查需显式绕过upstream `.prettierignore`的root allowlist：

```powershell
npx prettier --check --ignore-path .gitignore "Test/**/*.html" "Test/**/*.md"
```

`Planar/级联阴影.html` 使用本地 heightmap、建筑与 glTF，演示原生 shadows / terrainShadows /
ShadowMode，提供软阴影、级联颜色、光方向、剖切和透视/正交控件。用于视觉验收，不能替代 Specs。
