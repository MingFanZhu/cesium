# SceneGIS Playwright 迁移评审

- 类型 `Architecture / code review`
- 状态 `approved`
- 日期 `2026-11-27`
- 负责人角色 `架构 / 执行`
- [阶段计划](../plans/2026-11-27-playwright-layout.md)
- [ADR-0211](../../../Documentation/SceneGIS/Decisions/ADR-0211-scenegis-test-layout.md)
- 上游补丁 `SGP-0076`

## 发现与处置

- P1，已修复。根 Playwright 收集无法解析 engine workspace 的 `ktx-parse`。将原有两份 KTX2
  保留为各 360 字节的静态夹具，IBL 优先级测试继续使用实际纹理和 WebGL。
- P1，已修复。旧校准使用本地 Bistro 场景，受控诊断指定延迟渲染不接受的 4×MSAA。
  导出使用 Cesium Box glTF，材质诊断使用 FXAA 和无 AA。采样关闭白平衡并恢复原始状态，
  校验相机、曝光、粗糙度、金属度和遮蔽。对照页使用 32×20 合成图覆盖尺寸与缺图错误。
- P2，按负责人决定退役。Bistro、Sponza 的资产验收与街道整帧性能调查留作本地试验。移除对应
  PBR、方向性遮蔽画面对照、GBuffer、延迟光照和分块光照专项，以及材质检查中的 Bistro 部分。
  同时退役仅验证本地示例目录与历史重定向的用例。保留可独立运行的渲染断言和 Jasmine 覆盖。

## 验收

- 官方 Playwright 配置发现 192 个 SceneGIS 用例。发行专用配置收集 21 个。使用本机 Chrome
  运行 7 项普通 E2E 与 2 项发行 E2E，覆盖原生 fixture、球面和平面、IBL 和校准。
- 13 项 Jasmine、27 项补丁审计脚本回归、开发构建及 TypeScript 检查通过。npm dry-run 的
  文件列表不含 `Test/` 和 `Specs/`。
- 411 个原 `Test/` 路径全部解除追踪，原文件与本地新增试验均保留。所有共享浏览器夹具与测试
  入口迁入 `Specs/e2e/SceneGIS/`，历史 AgentDocs 保留旧方案与出处。
- 上游文件为 `.gitignore`、`.npmignore` 与 `Specs/e2e/playwright.config.js`，均属 `SGP-0076`。

本机 ESLint HTML processor 与 `eslint-seatbelt` 的既有版本冲突仍可复现。迁移文件的 JavaScript
通过 ESLint，97 段 HTML 内嵌 JavaScript 使用同一解析器单独检查。本地提交采用上述检查和
Markdown lint、Playwright 验收结果。

本轮覆盖的是目录迁移和定向行为回归。未执行完整 Playwright 矩阵，现有特定网络和硬件验收保留原条件。
