# Review: V0 架构边界

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审；不是独立评审
- Created: `2026-09-12`
- Updated: `2026-09-12`
- Review target: `feature/vector-tiles` 的 V0 AgentDocs 与 ADR-0057
- Related plan: [V0](../plans/2026-09-12-v0-architecture-audit.md)

## Scope

检查用户确认的独立实现、坐标、兼容范围、批量、直接贴地、标注与 Globe 边界，
以及源码证据、阶段和测试管理；不审查尚未实现的 renderer。

## Summary

项目负责人已明确“同意，按你的计划推进”。稳定边界提升到
[ADR-0057](../../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)。
V2 先 flat 并证明 ground 可行性，M1 完整目标后续依 V4/V5 验收贴地与标注。
后端和字体的具体选择有明确 phase 负责人，不属于遗漏的 V0 决定。

## Findings

| ID     | Severity | Status   | Owner role             | Location         | Finding                                                   | Disposition / evidence                                       | Follow-up                                                                   |
| ------ | -------- | -------- | ---------------------- | ---------------- | --------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| V0-R01 | medium   | fixed    | architecture           | 主 discussion    | 早期 native decoder/RTT 候选与用户最新要求冲突            | 当前 ADR 明确独立解码和直接矢量贴地；旧选择保留为已取代比较  | V1/V2 遵守                                                                  |
| V0-R02 | high     | deferred | architecture/execution | ground candidate | single-instance stencil 不能证明多要素颜色、alpha 和 pick | 在 V2 增加早期最小验证，未宣称已解决                         | [Extension V2](../plans/2026-09-12-vector-tiles-extension.md#phase-roadmap) |
| V0-R03 | low      | accepted | architecture           | 文档检查         | 全 AgentDocs 既有 Prettier 格式问题                       | 不扩大本扩展 diff；修改范围单独检查，Markdownlint 全目录检查 | 后续继续 scope 验证                                                         |

## Validation reviewed

V0 native MVT focused Specs 7/7；Node 最小 PBF 复现 identity/version/截断命令问题。
这些是审计证据，未改上游实现。扩展文档 Prettier、全 AgentDocs Markdownlint、
相对文件链接和 ownership 检查已执行，收尾文档另做最终检查。

## Accepted risks

直接贴地 batch、层序、线型、字体和 Globe 资格仍需后续实现证据；
本 review 批准阶段路线，不批准未实现 API 或画面。
无 upstream-owned 文件修改，无新增 SGP。

## Conclusion

V0 architecture gate 通过。将 V0 文档与 ADR 形成独立本地 checkpoint 后可激活 V1，
具体协议/依赖和实现步骤必须写入 V1 phase plan，不能与 V0 混合提交。
