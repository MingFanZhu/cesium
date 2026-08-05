# SceneGIS AgentDocs 约束

本文件适用于 `AgentDocs/**`，用于保证架构 Agent、执行 Agent 和评审 Agent 能通过版本化文档连续协作。

## 开始前

- 先阅读本目录的 `README.md`、目标扩展的 `README.md`、current active plan、所有相关 open discussion 和未解决 review。
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

扩展索引必须指向 current active plan、open discussion、最新 review、相关 ADR/SGP，以及源码、测试和 Sandcastle 路径。链接使用仓库相对路径，不写本机绝对路径。

## 文档纪律

- 文件名使用 `YYYY-MM-DD-<topic>.md`；同日同主题冲突时追加 `-02` 等稳定序号。
- 文档开头记录类型、状态、作者角色、创建或更新时间，以及相关 plan、discussion、review、ADR 和 SGP。
- plan 必须可执行且可验证；discussion 必须提炼问题、源码事实、方案权衡和结论；review 必须明确 review target、finding 严重度、负责人角色、证据、处置状态、follow-up 和剩余风险。
- 不覆盖其他 Agent 的记录，不删除未解决 finding。被替代或关闭的文档保留历史，并标记 `superseded`、`resolved` 或 `completed`，同时链接后继文档。
- 只记录有持续交接价值的结论，不保存逐轮聊天转录、思维过程或临时工具输出。
- 默认只提交 Markdown；不得保存 secret、本机绝对路径、大型日志、二进制、构建输出、依赖缓存或产品源码。

## 角色与交接

- 架构 Agent 维护范围、非目标、依赖边界、候选方案和 ADR/SGP 触发条件。涉及架构边界的 plan 由架构 Agent 将 `Architecture review` 从 `pending` 改为 `confirmed`。
- 执行 Agent 维护 active plan、实际偏差、验证结果和 current handoff，并负责 plan 的 `draft -> active -> completed` 状态流转；被替代的未完成 plan 转为 `superseded` 并链接后继 plan。
- 评审 Agent 新建 review，逐项记录 finding；执行 Agent 回填处置，评审 Agent 或后续维护者确认结论。
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
