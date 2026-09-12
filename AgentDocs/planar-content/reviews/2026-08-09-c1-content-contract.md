# Review：C1 平面内容基础契约与兼容性基线

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-09`
- Updated: `2026-08-09`
- Review target: branch `feature/planar-content`相对
  `c48a7f6b1072a75023a4c07695c326576a4ecfe6`的完整working-tree diff
- Related plan:
  [C1 phase plan](../plans/2026-08-09-phase-c1-content-contract.md)
- Related ADR:
  [ADR-0013](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)
- Related patch: None；C1 SGP=`0`

## Scope

请Architecture Agent评审：

1. private resolver的live-world、finite Cartesian3、inclusive extent与HeightReference subset；
2. resident terrain/Z=0 fallback、relative overflow、NONE zero-query和result failure atomicity；
3. 无subscription/request/cache/resource ownership与private generation boundary；
4. `PlanarContentGuide` compatibility matrix、fixed orientation和C1非runtime声明；
5. 相对base的zero-upstream、zero-SGP、zero-generated范围。

## Summary

- 新增无状态`SceneGISPlanarPositionResolver.resolve` private namespace；所有validation与derived height在
  result mutation前完成。
- 唯一focused Spec包含`11`个direct cases，使用真实World与instance-level terrain spy/stub，不修改
  prototype或terrain runtime。
- Architecture/DevelopmentGuide只提升稳定的DataSources分层、fixed axes、height/fallback与allowlist
  规则；新Guide明确C1不等于`viewer.entities`已支持。
- 未修改任何C2-C5产品、World/terrain、upstream-owned或生成文件。

## Findings

| ID  | Severity | Status | Owner role | Location | Finding                 | Disposition / evidence | Follow-up |
| --- | -------- | ------ | ---------- | -------- | ----------------------- | ---------------------- | --------- |
| N/A | N/A      | N/A    | N/A        | N/A      | No findings             | Approved               | N/A       |

Implementation matches ADR-0013 and the C1 phase plan.

## Validation reviewed

- Resolver focused `11/11`、`npm run build`、`build-ts`、`build-docs`均Exit 0；build-ts只有仓库既有
  TSD-JSDoc warnings。
- Private resolver在engine/Cesium declarations与API HTML中命中`0`；JS barrel保持允许的soft-private
  自动发现。
- scoped ESLint/Prettier、Markdown Prettier/Markdownlint、`git diff --check`均Exit 0；upstream audit
  Exit 0，upstream-owned files=`0`、C1 SGP=`0`、manifest/SGP-0001/0002 unchanged、new markers=`0`、
  generated status=`0`。
- Architecture Agent独立复跑resolver focused suite为`11/11`，并复跑upstream audit；结果同上，未扩大到
  与C1边界无关的全量矩阵。

## Accepted risks

- C1 resident-height resolver采用eventual consistency，不建立terrain subscription或content readiness。
- Soft-private JS export不是supported API；每次生成链升级需继续验证types/API隐藏。
- Entity visualizer、Model transform、line/polygon geometry与Viewer/DataSourceDisplay integration均未实现，
  必须等待C2-C4独立phase和review。

## Conclusion

C1 Architecture/code review通过。Private resolver的validation、height/fallback、atomic result与ownership
边界符合ADR-0013；compatibility guide明确保留C2-C4门禁。C1可以形成独立本地提交检查点；extension
继续`active`，C2尚未激活或设计。
