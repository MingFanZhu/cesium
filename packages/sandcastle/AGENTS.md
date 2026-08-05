# SceneGIS Sandcastle Agent 约束

本文件适用于 `packages/sandcastle/**`，并补充仓库根 `AGENTS.md`。

## 示例定位

- Sandcastle 是可执行示例、调试入口、人工视觉验收和基础截图冒烟，不是单元测试的替代品。
- 业务逻辑和可复用实现必须位于 SceneGIS 源码中，示例只负责组装、参数控制和演示。
- 每个可视化或交互型公共功能应提供至少一个稳定示例；内部诊断和性能工具可以提供 development 示例。

## 目录与命名

- gallery 保持 Cesium 当前的扁平结构，不创建 `gallery/SceneGIS/**` 多层命名空间。
- slug 使用全小写 kebab-case：`scenegis-<domain>-<feature>`。
- 调试、性能或内部验收页使用 `-dev` 后缀并设置 `development: true`。
- 使用 `sandcastle.yaml`，不得使用 `.yml`。现有 gallery 构建支持两者，但 E2E 只扫描 `.yaml`。

每个示例至少包含：

```text
scenegis-example/
├── index.html
├── main.js
└── sandcastle.yaml
```

稳定展示示例可以添加 `thumbnail.jpg`，尺寸遵循现有 `225x150` 约定。

## 元数据

- `title` 和 `description` 必填，使用清晰英文描述。
- 所有 SceneGIS 示例添加 `SceneGIS` label。
- 稳定且适合展示的示例可以添加 `Showcases`；开发示例添加 `Development`。
- 不得提交真实 token、账号、私有 URL 或其他秘密。外部数据源必须可公开访问，并说明不可用时的降级行为。

示例：

```yaml
title: SceneGIS Atmosphere Enhancement
description: Demonstrates SceneGIS atmosphere rendering enhancements.
labels:
  - SceneGIS
  - Showcases
thumbnail: thumbnail.jpg
development: false
```

## 示例质量

- 明确设置初始 camera、clock、scene 和必要参数，尽量保证默认画面可重复。
- 避免无界动画、随机状态和不稳定外部请求破坏截图测试；确需使用时提供固定种子或稳定等待条件。
- 示例应展示一个清晰主题，不把无关功能堆在同一页面。
- 调试控件应有合理默认值和单位，并使关键状态能够被人工复现。
- 修改 Sandcastle 核心应用或构建文件属于 upstream-owned 修改，必须遵守 SGP 规则；普通示例通常只需新增 gallery 目录。

## 验证

- 使用 `npm run create-demo -- scenegis-<feature>` 创建基础目录后，修正默认元数据。
- 构建 gallery，确认示例可被发现且无元数据错误。
- 在本地 Sandcastle 中运行示例，检查 console error、资源加载、交互和销毁后的状态。
- 对关键交互增加专用 Playwright 测试；截图更新必须是预期渲染变化，不能盲目接受新基线。
- 提交示例时同时列出对应 Specs 或说明为什么该功能不需要自动化行为测试。
