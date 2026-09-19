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

这是固定小场景，不提供多级倾斜瓦片 LOD、全城性能或新 GI/局部光能力的验证结论。
后续每个新效果必须同时保留独立中文 HTML/JS 示例，并加入效果目录；综合页用于确认实景收益。

场景代码仅组装公开 API；生命周期使用 `Test/example-lifecycle.js`。验证入口为
`Specs/e2e/scenegis-rendering-reference.spec.js`，使用 `Test/playwright.examples.config.mjs`。
