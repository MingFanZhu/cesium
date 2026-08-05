# SceneGIS AgentDocs

`AgentDocs/` 是 SceneGIS 架构 Agent、执行 Agent 和评审 Agent 的版本化协作区。它保存跨对话仍有价值的计划、讨论、评审和 handoff，使后续 Agent 能在不依赖聊天历史的情况下继续工作。

强制规则见 [AgentDocs AGENTS.md](AGENTS.md)，长期边界见 [SceneGIS Architecture](../Documentation/SceneGIS/Architecture.md)，日常流程见 [DevelopmentGuide](../Documentation/SceneGIS/DevelopmentGuide.md)。

## 目录模型

每个独立 SceneGIS 扩展对应一个稳定目录：

```text
AgentDocs/
├── _template/
└── <extension-slug>/
    ├── README.md
    ├── plans/
    ├── discussions/
    └── reviews/
```

`<extension-slug>` 使用 lowercase kebab-case，并按产品能力或子系统命名，例如 `terrain-materials`。不要按 Agent、对话、Git 分支、提交或单个缺陷创建重复目录。

## 创建扩展协作区

1. 复制 `_template/` 的结构到 `AgentDocs/<extension-slug>/`。
2. 填写扩展 `README.md` 的范围、状态、工程路径和 current handoff。
3. 判断 planning model：大型或分阶段扩展创建 extension plan；小型单阶段工作创建
   standalone plan。
4. 将未知且会改变方案的问题写入 `discussions/`。
5. extension plan 的具体阶段开始前创建 phase plan，并从扩展索引和 extension plan
   双向链接。
6. 实现进入可评审状态后，在 `reviews/` 创建独立 review 文档。

维护或修复已有扩展时继续使用原目录。开始工作前，至少阅读扩展索引、active
extension/standalone plan、current phase plan、相关 open discussion 和未解决 review。

## 分层计划

大型扩展采用 progressive elaboration：extension plan 先稳定整体目标和阶段边界，
phase plan 在阶段真正开始时依据最新源码细化。这样后续阶段可以保留方向和依赖，
但不会过早固化 Shader、Worker、构建入口或内部类等易变实现。

- Extension plan：范围、非目标、架构边界、phase roadmap、依赖、全局风险和整体验收。
- Phase plan：当前阶段的源码事实、详细设计、影响路径、步骤、验证和退出条件。
- Standalone plan：小型、单阶段、可一次验证的独立工作。

同一大型扩展保持一个 active extension plan。默认一次推进一个 active phase plan；
只有总体计划已经证明阶段可独立执行时才并行。阶段完成后先回写 roadmap 和 handoff，
再为下一阶段细化计划。

## 文档职责

- `README.md`：扩展范围、planning model、current phase、active plan、open issues 和
  下一步 handoff。
- `plans/`：extension、phase 或 standalone plan；记录对应层级的范围、步骤、验证、
  风险、依赖和完成条件。
- `discussions/`：提炼后的问题、源码事实、备选方案、权衡、结论和待办。
- `reviews/`：review target、findings、负责人角色、证据、处置状态、follow-up、验证结果和剩余风险。

文件名使用 `YYYY-MM-DD-<topic>.md`。同日同主题冲突时追加 `-02` 等序号，不覆盖既有文件。

## 事实源与提升

AgentDocs 不定义新的产品规范。它应链接而不是复制以下正式资料：

- 强制规则：仓库及作用域内的 `AGENTS.md`。
- 长期架构：`Documentation/SceneGIS/Architecture.md` 和 ADR。
- 上游补丁：`.scenegis/upstream-patches.json` 中的 SGP。
- 当前行为：源码、自动化测试和可重复验证结果。

discussion 形成长期决定后提升为 ADR；形成跨扩展规则后提升到 Architecture 或相应 `AGENTS.md`。原文档保留并链接正式决定。

## 内容边界

AgentDocs 默认只保存 Markdown，不保存：

- 原始聊天转录或逐步思维过程。
- secret、token、个人信息或本机绝对路径。
- 大型日志、二进制、截图集合、构建输出或依赖缓存。
- 可复用产品源码或用于绕过正常测试体系的脚本。

验证证据优先链接到测试、提交、SGP、ADR 或受版本控制的小型文本资料。

## 文档验证

Cesium 根 `.prettierignore` 只白名单扫描既有顶层目录，不会自动包含 `AgentDocs/`。为避免仅为文档根目录修改上游配置，使用以下显式检查：

```powershell
npx prettier --check --ignore-path .gitignore "AgentDocs/**/*.md"
npx markdownlint "AgentDocs/**/*.md"
```
