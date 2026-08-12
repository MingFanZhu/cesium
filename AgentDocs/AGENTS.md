# SceneGIS AgentDocs 约束

本文件适用于 `AgentDocs/**`，用于保证架构 Agent、执行 Agent 和评审 Agent 能通过版本化文档连续协作。

## 开始前

- 先阅读本目录的 `README.md`、目标扩展的 `README.md`、active
  extension/standalone plan、current phase plan、所有相关 open discussion 和未解决
  review。
- 新扩展从 `_template/` 建立 `AgentDocs/<extension-slug>/`；`<extension-slug>` 使用稳定的 lowercase kebab-case，并按产品能力或子系统命名。
- `_template/` 是保留目录。创建扩展时复制其结构，不在模板目录记录具体功能工作。
- 同一扩展不得按对话、Agent、分支、提交或单个缺陷重复建目录。

## 必需结构

每个扩展必须包含：

```text
AgentDocs/<extension-slug>/
├── README.md
├── plans/
├── discussions/
└── reviews/
```

扩展索引必须指向 planning model、active extension/standalone plan、current phase、
active phase plan、open discussion、最新 review、相关 ADR/SGP，以及源码、测试和
Sandcastle 路径。链接使用仓库相对路径，不写本机绝对路径。

## Plan 层级

- `extension plan` 用于大型、跨模块或分阶段扩展，记录稳定目标、边界、非目标、阶段
  路线、阶段依赖、全局风险和整体验收条件。
- `phase plan` 从属于一个 extension plan，只细化即将进入或正在执行的阶段，记录
  当前源码事实、详细设计、影响路径、执行步骤、验证和退出条件。
- `standalone plan` 用于小型、单阶段且可一次验证的工作，不需要为形式完整再创建
  extension plan 和 phase plan。
- 同一扩展只能有一个 active extension plan。默认只允许一个 active phase plan；
  只有 extension plan 明确说明阶段彼此独立、负责人和合并条件时才允许并行。
- 尚未进入的阶段只在 extension plan 中保留粗粒度目标、依赖和 entry/exit gate。
  阶段开始前必须重新检查当前源码和未决讨论，再创建或更新 phase plan。
- phase plan 不得悄然改变 extension plan 的稳定边界。确需改变时，先更新 extension
  plan，并按影响创建 discussion、ADR 或 SGP。

## 文档纪律

- 文件名使用 `YYYY-MM-DD-<topic>.md`；同日同主题冲突时追加 `-02` 等稳定序号。
- 文档开头记录类型、状态、作者角色、创建或更新时间，以及 parent plan、相关
  discussion、review、ADR 和 SGP。
- extension plan 必须可追踪且可验收；phase/standalone plan 必须可执行且可验证；
  discussion 必须提炼问题、源码事实、方案权衡和结论；review 必须明确 review
  target、finding 严重度、负责人角色、证据、处置状态、follow-up 和剩余风险。
- 不覆盖其他 Agent 的记录，不删除未解决 finding。被替代或关闭的文档保留历史，并标记 `superseded`、`resolved` 或 `completed`，同时链接后继文档。
- 只记录有持续交接价值的结论，不保存逐轮聊天转录、思维过程或临时工具输出。
- 默认只提交 Markdown；不得保存 secret、本机绝对路径、大型日志、二进制、构建输出、依赖缓存或产品源码。

## 角色与交接

- 默认的双角色启动和任务间通信协议见
  `Documentation/SceneGIS/AgentRoles/ArchitectureAgent.md` 与
  `Documentation/SceneGIS/AgentRoles/ExecutionAgent.md`。任务间消息只负责通知和派工，长期状态仍必须回写本目录。
- 架构 Agent 维护 extension plan 的范围、非目标、阶段边界、依赖关系和 ADR/SGP
  触发条件，确认需要 architecture review 的 phase/standalone plan，并默认承担 Architecture/code review。
- 执行 Agent 维护 current phase plan、实际偏差、验证结果和 current handoff，并负责
  phase/standalone plan 的 `draft -> active -> completed` 状态流转。
- phase 完成、延期或被替代时，执行 Agent 同步更新 extension plan 的 phase roadmap；
  被替代的未完成 plan 转为 `superseded` 并链接后继 plan。
- phase 实现、验证和 review 全部完成后，Architecture Agent 负责把该阶段代码、
  Specs、正式决策/补丁记录与 AgentDocs 创建为独立本地提交。该提交完成前不得激活
  或实现下一 phase；下一阶段规划已经开始时，必须与已完成阶段分开提交。
- 架构 Agent 新建 review 并逐项记录 finding；执行 Agent 回填处置，架构 Agent 确认结论。项目负责人明确启用独立评审 Agent 时可由其记录和复核 finding，但 Architecture Agent 仍负责最终 phase gate。
- review finding 标记为 `fixed` 时必须附验证证据；标记为 `accepted` 或 `deferred` 时必须附理由，并在需要后续工作时链接后继 plan。
- 完成任务前更新扩展索引，并使所有未完成事项都有明确状态、负责人角色和下一步文档链接。

## 正式决策提升

AgentDocs 是协作记录，不替代正式规范：

- 长期架构决定提升到 `Documentation/SceneGIS/Decisions/`。
- 跨扩展强制规则提升到 `Documentation/SceneGIS/Architecture.md` 或相应 `AGENTS.md`。
- upstream-owned file 修改登记到 `.scenegis/upstream-patches.json`，并使用有效 SGP。

提升后保留原协作文档，并从双方互相链接。

## 验证

Cesium 根 `.prettierignore` 不会扫描新建的 `AgentDocs/` 根目录。修改本目录后必须显式运行：

```powershell
npx prettier --check --ignore-path .gitignore "AgentDocs/**/*.md"
npx markdownlint "AgentDocs/**/*.md"
```

不得仅以 `npm run prettier-check` 通过作为本目录 Markdown 已格式化的证据。
