# 渲染质量对比

从[示例目录](示例目录.html)进入；综合入口为[实景对比](实景对比.html?world=planar)，
使用 `world=globe` 切换球面。所有模型、纹理与 runtime 来自本地，无 token 或公网启动依赖。

以公开 AGI HQ 摄影测量园区为主体，保留原始纹理。附加 GLB 参照区用于观察可控材质与反射。
数据来源、授权说明、坐标转换及重建方式见 [data/README](data/README.md)。

## 固定对比

- 固定四个视角、午后/低太阳/夜间三个时间，默认暂停 Clock，分辨率随窗口。
- 基线 A 固定已实现的阴影、AO 参数；实验 B 可调整阴影、AO、SSR和是否重打光。
- A/B 共用一个 Viewer，不改变视角、时刻、数据和 GLB 显示状态，切换 A 不丢失 B 参数。
- 导出配置记录模型版本、World、实际相机姿态、时刻、参数及绘制分辨率。跨代码版本比较
  还应保存 Git revision 和同分辨率截图；A/B 不会在当前进程运行历史版本的 renderer。
- 原始贴图模式保留影像已有光照。动态重打光、阴影和 AO 会与原有明暗叠加，不能把
  原始贴图阴影当作当前光源产生的动态阴影。

这是固定小场景，不提供多级倾斜瓦片 LOD、全城性能或新 GI 能力的验证结论。

## 夜景光照

[独立示例](夜景光照.html?world=planar)提供点光源、聚光灯、自发光灯带和金属高光；
`world=globe` 使用相同 API。局部照明、自发光、泛光与 SSR 可分别开关。
综合页切到“夜间基线”“建筑近景”，选择“实验 B”并开启“夜景局部灯光”即可比较实景。

`SceneGISLightCollection({scene})` 绑定到 Scene，`add` 接收 `SceneGISPointLight` /
`SceneGISSpotLight`。`position` 使用世界坐标，`direction` 为光线发射方向；
`intensity`、`color`、`range`、`radius` 可动态编辑。角度为弧度，距离为米。
Globe 使用 ECEF，Planar 使用平面坐标；局部 ENU 变换仅在应用组装层完成。
集合最多 16 个灯，包含隐藏灯；超限明确报错。Scene 销毁集合，描述对象可共享且无需销毁。
request-render 模式编辑属性后调用 `scene.requestRender()`。

自发光使用 glTF 原有 emissiveFactor/emissiveTexture 或 CustomShader 的 `material.emissive`；
HDR 值大于 1 可配合泛光。示例使用原生 bloom，并修正提取阶段负 RGB 在 HDR 暗部
产生彩色条带的问题。自发光自身不照亮邻近几何，需要配对显式局部灯。
局部灯暂不投影、不参与体积散射或 GI；原始 unlit 贴图模式仍不接收动态照明。

## 阴影精细度

[独立示例](阴影精细度.html?world=planar)提供细杆、悬空横梁、斜面和远处建筑，
可切换 `world=globe`。使用原有 `shadowMap.softShadows`、`size`、`maximumDistance`、
`normalOffset` 和 `debugCascadeColors`。降低分辨率可以观察连续滤波，移动相机可观察
级联稳定性。没有新增公共 API。球面的可见阴影距离使用分档范围，小幅移动保持稳定，
跨距离档位、改变光线或视锥时仍会重分配阴影采样。细于阴影像素的几何仍可能丢失。

本轮是连续 PCF 和接收面深度校正，不是 PCSS；没有按离地距离变化的物理半影。

后续每个新效果必须同时保留独立中文 HTML/JS 示例，并加入效果目录；综合页用于确认实景收益。

场景代码仅组装公开 API；生命周期使用 `Test/example-lifecycle.js`。验证入口为
`Specs/e2e/scenegis-rendering-reference.spec.js`，使用 `Test/playwright.examples.config.mjs`。
