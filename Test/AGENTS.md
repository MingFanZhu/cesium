# SceneGIS Test 开发示例约束

本文件适用于 `Test/**`，并继承仓库根 `AGENTS.md`。

- 新 SceneGIS 人工示例默认使用可由根 Cesium 开发服务器直接访问的 HTML 入口。简单示例优先为
  `Test/<名称>.html`，复杂示例可以使用子目录，但仍应有明确 HTML 入口。
- Cesium runtime 只从 `/Build/CesiumUnminified/index.js` 以 ESM 导入。不得同时加载
  `Cesium.js` IIFE 与 ESM，不得从 `Source/Cesium.js` 或 package build 拼接多份 runtime identity。
- 在导入 Cesium 前设置 `window.CESIUM_BASE_URL = "/Build/CesiumUnminified/"`。源码或 Shader
  改动由根开发服务器清理增量构建缓存；刷新页面后必须取得最新 bundle。
- 示例只做 API 组装、可视化和人工交互，不承载可复用业务实现，不替代 Specs/E2E，也不进入 npm
  交付。用户可见 tool/control panel 文案使用中文，API 名称与源码标识符保持英文。
- 默认使用本地确定性数据，不提交 access token、cookie、credential 或其他 secret，不让公网可用性成为
  示例能否启动的前提。确需 best-effort 公网数据时必须有清楚提示和本地 fallback。
- `Test/lib/**` 仅保存示例需要的浏览器第三方库。新增时同时更新 `Test/lib/README.md`，记录名称、固定版本、
  上游 URL、许可证和使用页面；不要修改 vendored minified 文件，也不要从产品源码导入该目录。
- 页面销毁或重新初始化时必须按 ownership contract 释放 caller-owned controller、world、provider、texture
  等资源。为了人工诊断，可以显式暴露少量 `window` reference，但不得成为产品 API。
- `pagehide`清理必须区分BFCache：`event.persisted === true`时保留live页面状态，non-persisted离开才执行
  idempotent destroy。当前upstream `.prettierignore`未包含`Test/**`；对本目录执行Prettier时显式使用
  `--ignore-path .gitignore`，不能依赖根默认ignore规则。
