# 高级环境功能示例整理

- Type: standalone plan
- Status: completed（技术自审；上手体验交付负责人查看）
- Author: Architecture / Implementation
- Updated: 2026-09-18
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Related: [P14](2026-09-12-phase-p14-planar-nanjing-data.md),
  [空间契约讨论](../discussions/2026-09-11-planar-atmosphere-space-model.md)
- Review: [功能示例评审](../reviews/2026-09-18-functional-examples.md)
- ADR / SGP: consume existing contracts; no product or upstream changes

## 范围和事实

现有球面与平面入口同时承担功能演示、固定观察、错误诊断、资源释放和历史阶段验收，
不适合快速上手。`SceneGISEnvironmentEffects` 已有各效果独立开关；平面另需显式注册
`SceneGISPlanarEnvironment` 提供 fixed-Z 日月方向。控制器由示例持有，先移除再释放 Viewer。

## 实现

1. 保留综合诊断代码到 `Test/AdvancedEnvironment/tests/`，迁移相关 E2E 入口。
2. 拆分物理大气、高度雾、体积云、日月光照、泛光与光晕五类，每类分别提供球面和平面页。
3. 每页直接展示 Viewer、控制器参数、GUI 和清理；只共享页面样式与生命周期。
   使用中文文件名、原版 lil-gui 外观、独立说明区，不展示诊断状态和阶段编号。
4. 新页默认本地数据；云动画只使用 Cesium Clock。平面天文参考点显式给定。
5. 更新目录和旧入口跳转，保留旧综合页的维护入口。

## 验证和退出

- 浏览器自动化验证本地启动、效果 ready、代表参数绑定、Clock、BFCache 和资源释放。
- 人工检查球面与平面代表画面；检查旧测试入口仍可达，避免 Sandcastle。
- Scoped ESLint / Prettier、AgentDocs Markdownlint、diff 和所有权检查。
- 只改示例、相关 E2E 和交接文档，无需产品完整构建或类型重生成。
- 技术 review 和独立本地提交完成后交付；视觉质量仍接受项目负责人反馈。

## 结果

十个功能页面已完成，全部使用本地资源、独立说明和默认 lil-gui；原综合页及相关
E2E 路径已迁移。11 项新页面/导航检查和两项原 Clock 回归通过，代表画面已自查。
检查覆盖 effects ready、真实控件绑定、原生 Clock、BFCache 和重复释放；不要求
低视角 Globe 的全部地表瓦片停止细分。测试采用仓库 Chromium channel。
Scoped 静态检查、Markdownlint 和上游所有权检查通过；全 AgentDocs Prettier 存在
231 项历史格式问题，本轮修改文档无问题。无产品实现、生成文件、ADR 或 SGP 改动。
本次形成独立本地提交；产品阶段状态保持原验收边界，不激活新功能阶段。
