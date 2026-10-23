# Review: P1 协议与 CPU 切片器

## Metadata

- Type: architecture / code review
- Status: completed
- Owner / reviewer: 本任务
- Date: 2026-10-23
- Target: [P1](../plans/2026-10-23-p1-tool-and-protocol.md)
- ADR: [ADR-0188](../../../Documentation/SceneGIS/Decisions/ADR-0188-segmented-gaussian-migration.md)
- SGP / upstream-owned files: None / 0

## Findings

| ID  | Severity | Finding                                      | Disposition | Evidence / follow-up                                                                                                          |
| --- | -------- | -------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| G1  | medium   | 旧 builder hash helper 引入 fixed10 全部入口 | fixed       | 提取 sourceHash；无固定网格 builder/reader；同输入 MCI、manifest、pack 三文件逐字节一致                                       |
| G2  | medium   | 分段 normalization 仍调用 fixed10 XY 校验    | fixed       | 保留通用 workers/坐标参数，XYZ cell 独立校验；CLI 三种 cell size 和无效输入通过                                               |
| G3  | medium   | 旧 runtime 测试中 24 项原工作树已失败        | fixed       | 旧失效用例不作为资格；[P2 review](2026-10-23-p2-rendering.md) 记录 248 项当前引擎 Specs 对 receipts、SH、排序和生命周期的验证 |

G3 包括过时二维 origin/非 400000 part fixture、以未补齐 raw bytes 充当 GPU atlas
bytes 的 receipts、旧 canonical planner 与指标精确值。这些证据不能作为当前实现通过项；
不为旧用例修改产品协议或增加测试专用分支。当前有效用例直接保留，P2 引擎 Specs 是后续 gate。

## Verification

- 工具及共享 runtime：78 tests pass，0 fail / skip / todo，Node 24.9.0。
- CPU worker 调度、确定性多 worker 产物、proxy error 溢出、MCI CRC/cell 校验、CLI
  build/inspect/validate、authored LOD 打包、Active Cut 和当前 ready-cut readiness 均有用例。
- 来源与迁移后相同 PLY：manifest、MCI、GSP pack 逐字节相同。
- 23 个 Core private 模块无 Tools/Node import，提供唯一 basename/default export；ESLint 通过。
- 自有 Markdown/Prettier 检查通过。没有新增依赖、修改源仓库或生成文件进入交付。

## Gate 与剩余风险

P1 实现与 review 通过，checkpoint 为 `040e7d72f6`。G3 已由本任务在 P2 关闭；
P1 单独不代表渲染资格，大型真实资产性能与用户视觉验收仍需后续数据验收。
