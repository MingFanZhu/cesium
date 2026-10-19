# 南京综合环境示例评审

- Type: architecture / code review
- Status: approved
- Owner role: architecture（当前任务自审，未启用独立 Agent）
- Created / Updated: 2026-10-19
- Target: [standalone plan](../plans/2026-10-19-integrated-environment-example.md)
- ADR / SGP: 无新增；upstream-owned files=0

## 审查结论

页面直接调节 `scene.environmentEffects` 的 39 个公开可写属性，使用引擎当前默认值和生命周期。
没有复制历史示例的参数，也未创建第二个 effects 控制器；默认开关、Globe/Planar 参数差异及显示设置均保留。
独立的南京位置/平面天文参考配置只负责场景定位，原生 Animation/Timeline 与球面 BaseLayerPicker 可见。
影像/地形初始为本地数据，在线服务由用户选择；不嵌入凭据或改变 SDK 认证。

## Findings

- **P1 / fixed：默认值来源。** 显式 `new SceneGISEnvironmentEffects` 的默认开关不同于 Scene 的默认环境；
  综合页改用 Scene 拥有的实例。自动化创建独立 Viewer 对照全部参数及 HDR、tone mapper、exposure，初值一致。
- **P2 / fixed：云时间权威。** `cloudTime` 是调用方提供的模拟秒数，不能只打开 Timeline 就假定云会动画。
  使用 Clock onTick 和锚点，手动编辑后从新值继续；测试覆盖 42→45→43→43→3643 的正放、倒放、暂停和一小时跳转。
- **P2 / verified：参数完整性与所有权。** 用公共属性描述符检查全部可写参数均有 GUI 控件；Planar 唯一合法值为 1 的距离倍率禁用编辑。
  默认 effects 交给 Scene 释放，页面移除 Clock/错误/状态 listener 和自建 Planar 天文控制器；沿用 BFCache 与重复销毁语义。

## 验证

- 新增 Globe/Planar 两项综合 E2E，以及既有目录/旧链接检查通过。测试文件为
  `Specs/e2e/scenegis-environment-examples.spec.js`，使用 `Test/playwright.examples.config.mjs` 和本机 8080 开发服务器。
- 参数完整性、独立 Viewer 默认值对照、南京坐标/天文参考、真实控件输入、原生图层目录选择与 Clock 联动通过。
  恢复默认保留当前时间；Scene 拥有默认效果，未另建 effects 控制器。页面初始化无外网请求、console/page/render error。
- BFCache 保留 Viewer；实际 pagehide 和重复 destroy 后，Clock/效果 listener 为零、effects 不再 ready，GUI 移除。
- Chromium / Windows / RTX 3060 Ti，1280×800，检查双世界默认画面、云/HDR 修改后画面和原生控件布局。
  综合用例保留既有环境 E2E 的 120 秒超时；Globe 全流程约一分钟，曾在临时收紧为 60 秒时于云启用后的后续操作超时。
  未增加产品重试、等待帧或专供测试的分支。
- Scoped ESLint/Prettier、Markdownlint 与 diff 检查通过；全量 AgentDocs Prettier 仍有 452 个既有文件的格式警告，本次文件无新增问题。
- 只修改 Test、SceneGIS E2E 与 AgentDocs。无需产品全量构建、类型重生成或重跑旧 Shader Specs；upstream-owned files=0，SGP=None。

技术自审通过，无未处理的新 finding，形成独立本地检查点。

## 剩余边界

在线影像/地形依赖网络及服务授权；页面默认无需公网。Planar 距离倍率不可调是引擎公开契约。
本次没有产品、Shader、构建入口或公共 API 变更；既有 strict-WebGL fixture 问题保留在先前 review，不由示例变更关闭。
