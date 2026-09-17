# 高级环境功能示例

入口：[示例目录](示例目录.html)。通过仓库根开发服务器访问，每页只组装公开 API；
HTML 设置 Cesium base URL，旁边同名 JS 包含 Viewer、控制器、lil-gui 和清理代码。

| 功能                 | 球面                                  | 平面                                  |
| -------------------- | ------------------------------------- | ------------------------------------- |
| 物理天空与空气透视   | [球面物理大气](球面物理大气.html)     | [平面物理大气](平面物理大气.html)     |
| 指数高度雾           | [球面高度雾](球面高度雾.html)         | [平面高度雾](平面高度雾.html)         |
| 体积云、云影与体积光 | [球面体积云](球面体积云.html)         | [平面体积云](平面体积云.html)         |
| Clock、日照与月光    | [球面日月光照](球面日月光照.html)     | [平面日月光照](平面日月光照.html)     |
| HDR 泛光与镜头光晕   | [球面泛光与光晕](球面泛光与光晕.html) | [平面泛光与光晕](平面泛光与光晕.html) |

新示例默认完全本地：Globe 使用内置 Natural Earth 影像和椭球地表，Planar 使用本地米制
底色地表；远近模型使用仓库已有 Box glTF。Planar 的南京天文参考显式配置，不从 CRS 推断。
各效果通过 `SceneGISEnvironmentEffects` 的独立属性设置，原生环境合成关闭，HDR 开启。
控制器 caller-owned：页面离开时先移除控制器，再销毁 Viewer。云动画仅由 Clock 驱动。

`tests/` 保留原完整组合、公开服务、固定观察和资源诊断，供既有回归使用。
它们不是上手示例，历史参数和诊断布局保持兼容。原根目录高级环境 URL 重定向到新目录。

页面自动化位于 `Specs/e2e/scenegis-environment-examples.spec.js`，与产品 Specs 分开：

```powershell
npx playwright test --config Test/playwright.examples.config.mjs scenegis-environment-examples.spec.js
```

使用已启动的 8080 根服务器，不启动 Sandcastle。
