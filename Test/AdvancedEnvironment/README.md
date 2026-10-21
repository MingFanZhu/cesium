# 高级环境功能示例

入口：[示例目录](示例目录.html)。通过仓库根开发服务器访问，每页只组装公开 API；
HTML 设置 Cesium base URL，旁边同名 JS 包含 Viewer、控制器、lil-gui 和清理代码。

| 功能                 | 球面                                      | 平面                                       |
| -------------------- | ----------------------------------------- | ------------------------------------------ |
| 综合环境 · 南京      | [球面综合调试](综合环境.html?world=globe) | [平面综合调试](综合环境.html?world=planar) |
| 物理天空与空气透视   | [球面物理大气](球面物理大气.html)         | [平面物理大气](平面物理大气.html)          |
| 指数高度雾           | [球面高度雾](球面高度雾.html)             | [平面高度雾](平面高度雾.html)              |
| 体积云、云影与体积光 | [球面体积云](球面体积云.html)             | [平面体积云](平面体积云.html)              |
| Clock、日照与月光    | [球面日月光照](球面日月光照.html)         | [平面日月光照](平面日月光照.html)          |
| 星空、暮光与云雾遮挡 | [球面星空](夜晚星空.html?world=globe)     | [平面星空](夜晚星空.html?world=planar)     |
| HDR 泛光与镜头光晕   | [球面泛光与光晕](球面泛光与光晕.html)     | [平面泛光与光晕](平面泛光与光晕.html)      |

综合调试页直接使用 Scene 拥有的 `scene.environmentEffects`，覆盖其全部可写参数，并开放原生
HDR、tone mapper 和 exposure。初值及恢复值读取引擎，不采用分项示例或旧综合页的效果预设。
平面空气透视距离倍率按契约固定为 1，控件显示但不可编辑。默认环境中的云、云影、体积光、泛光和光晕开关保持关闭，
可在面板中自行开启；泛光/光晕还需要 HDR。原生 Animation/Timeline 控制播放、倒放和 seek，云时间编辑会重新锚定同一 Clock。
“恢复环境默认值”保留相机、日期和图层；“回到南京视角”回到 118.7969°E、32.0603°N、2500 m。
球面和平面默认使用同一 ArcGIS World Imagery EPSG:3857 影像，直接请求
`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`，
256 像素、level 0–18，两侧图层亮度/对比度/饱和度/gamma 保持 1，色相 0、不透明度 1。
球面保留原生影像/地形目录和初始椭球；离线可选择本地 Natural Earth。
平面使用南京 EPSG:3857 坐标和显式南京天文参考，可关闭“显示 World Imagery”回到本地底色。
在线数据依赖网络，失败会提示；其他服务沿用 SDK 凭据配置。新页不新增渲染实现或颜色补偿。

分项示例默认完全本地：Globe 使用内置 Natural Earth 影像和椭球地表，Planar 使用本地米制
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
