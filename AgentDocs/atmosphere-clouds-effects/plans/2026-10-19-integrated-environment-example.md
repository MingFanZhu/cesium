# 南京综合环境调试示例

- Type: standalone plan
- Status: completed
- Owner role: architecture / execution（当前任务）
- Created / Updated: 2026-10-19
- Architecture review: confirmed；仅组装既有公开 API
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Related: [功能示例整理](2026-09-18-functional-examples.md)
- Review: [综合环境示例评审](../reviews/2026-10-19-integrated-environment-example.md)
- ADR / SGP: 无新增；无产品、Shader 或 upstream-owned 改动

## 范围与设计

新增 `Test/AdvancedEnvironment/综合环境.html?world=globe|planar`，从示例目录分别进入两种世界。
直接调节 Scene 拥有的 `scene.environmentEffects`，不重建显式控制器、不套用历史测试页预设。
所有可写环境属性均有中文控件，初值与恢复值从当前引擎实例读取；Planar 的空气透视距离倍率按公开契约固定为 1。
同时开放原生 HDR、tone mapper、exposure；保留默认值，不自动启用 TAA 或修改物理亮度。

位置为南京，Globe 使用经纬度，Planar 使用显式南京 Web Mercator 坐标和 astronomical reference。
开放原生 Animation/Timeline；云时间由同一 Clock 驱动，手动编辑云时间重设时间锚点，暂停/倒放/seek 均保持连续对应。
默认时钟使用 Viewer 原值。球面原生 BaseLayerPicker 保留所有原生影像/地形选项，初始选本地 Natural Earth / 椭球，
提供在线服务依赖提示；平面初始本地底色地表。只在用户选择在线图层后请求公网。

页面布局避开原生时钟与图层选择器；分组折叠、恢复环境默认值和回到南京视角。
Scene 拥有默认 effects；仅主动移除页面添加的 Planar 天文控制器和事件，沿用 BFCache-aware 页面清理。

## 验证与退出

- 双世界 E2E：所有公开可写属性有控件、引擎初值一致、真实输入/开关和恢复、Clock 正反向/暂停/seek、原生图层选择器。
- 页面加载使用本地资源，错误为空；BFCache 保留、离开和重复销毁释放事件及 Viewer。
- 检查代表截图、目录链接；scoped lint/format、AgentDocs 规则和所有权审计。
- 本次不改产品，复用既有产品 Specs；无需重复完整引擎构建与类型生成。
- 记录自审与结果，保留历史 strict-WebGL fixture 问题，不扩大修复范围。

## 完成结果

双世界综合页、目录和说明已完成，39 个公开可写环境属性均有控件，默认值来自 Scene 实例。
初始参数及 HDR/tone mapper/exposure 与独立新建 Viewer 对照一致；没有显式 effects 控制器或外网初始化请求。
南京经纬度/投影坐标、Planar 天文参考、原生时钟与图层目录、控件修改、恢复和 Clock 正反向/暂停/seek 验证通过。
Globe/Planar 两项综合 E2E 和一项目录/旧链接检查通过；BFCache、重复销毁和事件释放通过，无浏览器/渲染错误。
代表画面与原生控件布局已检查；scoped lint/format、Markdownlint 和所有权检查通过。
全量 AgentDocs Prettier 仍有 452 个既有文件的格式警告，新增和修改文件检查通过。
仅改示例、E2E 和协作文档，没有引擎、Shader、公共 API、upstream-owned 或生成文件改动；形成独立本地检查点。
