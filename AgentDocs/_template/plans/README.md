# Plans

plan 是跨 Agent、跨对话保存的可执行交接资料。实际文档使用 `YYYY-MM-DD-<topic>.md`，并从扩展索引链接 current active plan。

每份 plan 使用以下结构：

```md
# Plan: <Title>

## Metadata

- Status: `draft | active | completed | superseded`
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

## Source facts

## Affected paths

## Steps

## Validation

## Risks and dependencies

## Completion criteria

## Deviations and results
```

执行 Agent 负责 `draft -> active -> completed` 的正常流转；被替代的未完成 plan 标记为 `superseded` 并链接后继 plan。涉及架构边界时，必须由架构 Agent 将 `Architecture review` 从 `pending` 改为 `confirmed` 后再进入实现。

实现改变范围、架构或验证方式时，先更新 active plan 的 deviations；如果变化形成独立方案问题，则新建 discussion。
