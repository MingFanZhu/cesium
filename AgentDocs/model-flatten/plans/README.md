# Plans

plan 是跨 Agent、跨对话保存的持久交接资料。实际文档使用
`YYYY-MM-DD-<topic>.md`，并从扩展索引链接。

## Plan 类型

- `extension`：大型、跨模块或分阶段扩展的总体计划。
- `phase`：从属于 extension plan 的阶段计划。
- `standalone`：小型、单阶段且可一次验证的独立计划。

同一扩展只维护一个 active extension plan。未来阶段只在其 phase roadmap 中保留
粗粒度目标、依赖和 entry/exit gate；进入阶段前重新检查源码，再创建 phase plan。
默认只允许一个 active phase plan，除非 extension plan 明确说明并行关系和合并条件。

## Extension plan 模板

```md
# Extension Plan: <Title>

## Metadata

- Plan type: `extension`
- Status: `draft | active | completed | superseded`
- Owner role: `architecture`
- Architecture review: `pending | confirmed`
- Architecture reviewer: Unassigned
- Created: `YYYY-MM-DD`
- Updated: `YYYY-MM-DD`
- Related discussions: None
- Related reviews: None
- ADR: None
- SGP: None

## Objective

## Non-goals

## Stable architecture boundaries

## Source and baseline facts

## Phase roadmap

| Phase | Objective | Dependencies | Entry gate | Exit gate | Status | Phase plan |
| ----- | --------- | ------------ | ---------- | --------- | ------ | ---------- |

## Cross-phase validation

## Global risks and dependencies

## Overall acceptance criteria

## Progress and handoff
```

## Phase 或 standalone plan 模板

`standalone` 使用同一模板，但 `Parent plan` 和 `Phase` 填写 `None`。

```md
# Phase Plan: <Title>

## Metadata

- Plan type: `phase | standalone`
- Status: `draft | active | completed | superseded`
- Parent plan: `<extension-plan-link> | None`
- Phase: `<phase-id> | None`
- Owner role: `architecture | execution`
- Architecture review: `not-required | pending | confirmed`
- Architecture reviewer: Unassigned
- Created: `YYYY-MM-DD`
- Updated: `YYYY-MM-DD`
- Related discussions: None
- Related reviews: None
- ADR: None
- SGP: None

## Objective

## Non-goals

## Entry conditions

## Current source facts

## Detailed design

## Affected paths

## Steps

## Validation

## Risks and dependencies

## Completion criteria

## Deviations and results
```

执行 Agent 负责 phase/standalone plan 的 `draft -> active -> completed` 流转。
phase 完成、延期或被替代时必须同步更新 parent extension plan。被替代的未完成 plan
标记为 `superseded` 并链接后继 plan。

涉及架构边界时，必须由架构 Agent 将 `Architecture review` 从 `pending` 改为
`confirmed` 后再实现。实现改变总体范围时先更新 extension plan；仅改变当前阶段细节时
记录到 active phase plan。形成独立方案问题时新建 discussion。
