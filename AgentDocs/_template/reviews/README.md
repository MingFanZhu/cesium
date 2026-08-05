# Reviews

review 记录架构、实现、测试或性能评审及 finding 的处置状态。实际文档使用 `YYYY-MM-DD-<topic>.md`。

每份 review 使用以下结构：

```md
# Review: <Title>

## Metadata

- Status: `open | changes-requested | approved | superseded`
- Reviewer role: `architecture | review`
- Created: `YYYY-MM-DD`
- Updated: `YYYY-MM-DD`
- Review target: `<commit, diff, branch, plan, or path>`
- Related plan: None

## Scope

## Summary

## Findings

| ID  | Severity | Status | Owner role | Location | Finding | Disposition / evidence | Follow-up |
| --- | -------- | ------ | ---------- | -------- | ------- | ---------------------- | --------- |

## Validation reviewed

## Accepted risks

## Conclusion
```

finding 的 severity 使用 `critical`、`high`、`medium`、`low` 或 `note`；status 使用 `open`、`fixed`、`accepted`、`deferred` 或 `not-applicable`。`fixed` 必须附验证证据；`accepted` 或 `deferred` 必须附理由，并在需要后续工作时链接后继 plan。不得删除未解决 finding 来表示 review 通过。
