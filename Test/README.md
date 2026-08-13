# SceneGIS 开发示例

本目录保存绕过 Sandcastle、由 Cesium 根开发服务器直接交付的 SceneGIS 人工示例。

从仓库根目录启动：

```powershell
npm run start -- --port 8092 --no-embeddings
```

随后访问对应 HTML，例如：

```text
http://localhost:8092/Test/地形.html
```

根开发服务器为 `/Build/CesiumUnminified/index.js` 维护增量构建上下文，并监听 engine、widgets 与
Shader 源码。修改源码后刷新示例页面，即会请求最新开发 bundle；不需要单独构建或启动 Sandcastle。

页面结构、runtime identity、中文 UI、本地数据、资源释放和第三方库规则见 [AGENTS.md](AGENTS.md)。

本目录的格式检查需显式绕过upstream `.prettierignore`的root allowlist：

```powershell
npx prettier --check --ignore-path .gitignore "Test/**/*.html" "Test/**/*.md"
```
