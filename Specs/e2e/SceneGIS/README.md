# SceneGIS 浏览器测试

使用仓库自带的 `Specs/e2e/playwright.config.js`，从根目录执行：

```powershell
# 收集 SceneGIS 用例
npm run test-e2e -- "e2e[/\\]SceneGIS[/\\]" --list

# 运行单个用例文件
npm run test-e2e -- scenegis-feature-examples.spec.js

# 发行包使用自己的静态服务，先运行 npm run build-scenegis
npx playwright test -c Specs/e2e/SceneGIS/config/distribution.config.mjs
```

浏览器使用 `fixtures/` 内的共享页面和数据。普通用例与 Cesium 官方用例共用测试配置、
本地开发服务和浏览器项目。`config/` 内的定向配置保留特定的视口、超时、图形后端和环境选择。
新用例可复用 Cesium 的 [`test.js`](../test.js) fixture，或用 Playwright 直接访问独立夹具页面。

Jasmine 用例在 `packages/engine/Specs/SceneGIS/` 与 `packages/widgets/Specs/SceneGIS/`。
本地试验继续放在仓库根 `Test/`，共享自动化只从版本化的夹具读取文件。

PBR 校准回归使用 Cesium 的 Box glTF 和小型合成对照图，Bistro 与 Sponza 用于本地视觉试验。
