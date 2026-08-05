# SceneGIS Agent 约束

本文件适用于整个仓库。子目录中的 `AGENTS.md` 可以增加更具体的规则，但不得放宽本文件的强制约束。

## 必读路由

- 开始任何 SceneGIS 实现前，阅读 `Documentation/SceneGIS/DevelopmentGuide.md` 中与任务相关的章节。
- 开发新的扩展或继续已有扩展前，阅读 `AgentDocs/README.md`；新扩展先从
  `AgentDocs/_template/` 建立稳定的扩展目录，已有扩展先阅读其索引、active
  extension/standalone plan、current phase plan、open discussion 和未解决 review。
- 新增子系统、公共 API，或修改渲染管线、Shader、Worker、构建、发布和官方版本基线前，完整阅读 `Documentation/SceneGIS/Architecture.md` 以及相关 ADR。
- 修改任何上游已有文件前，读取 `.scenegis/upstream-base.json` 和 `.scenegis/upstream-patches.json`，创建或复用一个 `SGP-####` 条目。
- 在 `packages/engine` 或 `packages/sandcastle` 下工作时，同时遵守对应目录中的 `AGENTS.md`。

## 代码发现

- 优先使用 codebase-memory-mcp 的 `search_graph`、`trace_path`、`get_code_snippet`、`query_graph` 和 `get_architecture` 发现代码关系。
- 当前仓库未索引时先执行 `index_repository`。只有图谱不足，或搜索字符串、配置、脚本和非代码文件时，才使用 `rg` 或直接读取文件。
- 修改前必须确认调用关系、构建入口、测试入口和生成文件边界，不能根据目录名称推测行为。

## 所有权边界

`.scenegis/upstream-base.json` 记录的官方提交中已经存在的路径，称为 **upstream-owned file**。以下路径是 SceneGIS 默认拥有的新增区域：

- `packages/engine/Source/SceneGIS/**`
- `packages/engine/Specs/SceneGIS/**`
- `packages/widgets/Source/SceneGIS/**`
- `packages/widgets/Specs/SceneGIS/**`
- `packages/sandcastle/gallery/scenegis-*/**`
- `Specs/e2e/scenegis-*.spec.js`
- `Documentation/SceneGIS/**`
- `AgentDocs/**`
- `.scenegis/**`
- `scripts/scenegis/**`
- `.github/workflows/scenegis-*.yml`
- `.github/workflows/scenegis-*.yaml`
- 本仓库新增的 SceneGIS `AGENTS.md`

默认只在 SceneGIS-owned 路径实现功能。确需新增其他自有根路径时，先更新架构文档，说明所有权、构建和升级边界。

## Agent 开发协作

- 每个独立 SceneGIS 扩展使用一个稳定的 `AgentDocs/<extension-slug>/`，并遵守 `AgentDocs/AGENTS.md`；不得按对话、分支、提交或单个缺陷重复建目录。
- 扩展目录必须包含索引以及 `plans/`、`discussions/`、`reviews/`。仓库内 plan 是供跨 Agent、跨任务交接的持久记录，不等同于 Agent 运行时的临时计划。
- 大型、跨模块或明确分阶段的扩展必须先建立 `extension plan`，只定义稳定目标、
  边界、阶段、依赖、全局风险和整体验收条件。
- 进入具体阶段前，必须依据当时的源码事实建立或更新 `phase plan`，再细化该阶段的
  设计、影响路径、步骤和验证。不得为尚未进入的阶段提前猜测易变实现细节。
- 小型、单阶段且可一次验证的工作可以只使用一个 `standalone plan`。
- AgentDocs 只保存提炼后的计划、讨论、评审和交接状态，不保存原始聊天转录、secret、本机绝对路径、大型日志、二进制和生成产物。
- 架构 Agent 负责明确边界和待决问题；执行 Agent 必须记录实现偏差与验证结果；评审 Agent 必须记录发现项及其处理状态。未解决事项不得通过删除文档来表示完成。
- AgentDocs 不是新的规范或实现事实源。长期架构决定提升到 ADR，通用强制规则提升到 `Architecture.md` 或相应 `AGENTS.md`，上游补丁继续登记 SGP。

## 上游修改纪律

- 对 upstream-owned file 的修改必须是实现目标所需的最小集成缝隙。禁止顺手格式化、重命名、移动或重构邻近 Cesium 代码。
- 每个可注释的修改 hunk 必须使用成对标记，并引用有效的 SGP：

  ```js
  // SCENEGIS_PATCH_BEGIN SGP-0001: Explain the integration seam.
  // Minimal upstream modification.
  // SCENEGIS_PATCH_END SGP-0001
  ```

- SGP 是上游补丁追踪号，不是分支、提交或功能编号。同一集成目的可以跨多个文件和提交复用同一个 SGP。
- JSON、删除、重命名、二进制等无法加注释的改动必须在补丁清单中使用 `manifest-only`，并写明原因。
- SceneGIS 自有实现文件不得添加 `SCENEGIS_PATCH` 标记。唯一例外是规范文档中的语法示例；补丁审计必须以基线差异和补丁清单列出的 upstream-owned files 为范围，不能只统计全仓字符串。
- 禁止通过 prototype monkey patch、隐式全局状态、加载顺序技巧或复制大段 Cesium 实现来规避上游补丁规则。必要时增加一个显式、窄小、可测试的 hook。
- 如果复制少量上游实现确实不可避免，必须记录来源路径、上游基线提交和后续同步条件。

## 生成文件

不得手工编辑或提交生成文件，包括但不限于：

- `packages/engine/index.js`
- `packages/engine/index.d.ts`
- `packages/engine/Build/**`
- `packages/engine/Specs/SpecList.js`
- `Source/Cesium.js`
- `Source/Cesium.d.ts`
- `Specs/SpecList.js`
- `Build/**`

应修改源文件或生成器，然后重新生成并验证。

## Git 工作流

- `origin/main` 保持为官方代码镜像，不提交 SceneGIS 修改。
- 小型、原子、容易验证和回退的修改可以直接提交到 `scenegis/develop`，不强制创建功能分支。
- 大型、跨模块、实验性、长期未完成、难回退或多人并行的工作使用 `feature/*`。
- 官方版本升级必须使用 `upgrade/cesium-*`；发布维护使用 `release/*`。
- 上游同步和 SceneGIS 功能开发不得混在同一个提交中。
- 不得 force-push `main` 或 `scenegis/develop`。
- SGP 与分支相互独立：大型 SceneGIS 自有功能可以没有 SGP；两行上游改动也可能需要 SGP。

## 架构决策

- 不提前猜测未知的 Shader builtin、Worker 输出或构建接入方式。遇到实际需求时，先检查当前 Cesium 版本的源码、构建和测试链路。
- 影响公共 API、分层、运行时协议、构建发布、性能边界或上游升级策略的长期决定，应记录到 `Documentation/SceneGIS/Decisions/ADR-####-*.md`。
- ADR 形成通用强制规则后，将精简后的规则提升到 `Architecture.md` 或相应 `AGENTS.md`。
- 修改 upstream-owned file 的 ADR 必须引用相关 SGP；SGP 也应反向引用 ADR（如存在）。

## 验证与交付

- 每个行为变化必须有与风险相称的自动化测试。Sandcastle 是可执行示例和视觉验收页，不能替代 Specs。
- 渲染热路径修改必须验证画面正确性、资源生命周期，并提供性能或回归证据。
- 只运行与任务相关的最小充分检查；扩大到公共 API、构建或发布时，必须运行相应的完整构建和类型检查。
- 最终报告必须列出：修改内容、验证结果、所有改动过的 upstream-owned files、对应 SGP，以及尚未解决的风险。

## 语言

- JavaScript、GLSL、JSDoc、源码注释、标识符、提交信息和 SGP 标记说明使用英文。
- SceneGIS 架构与开发文档可以使用中文，但关键术语、路径、命令和 API 名称保持英文原文。
