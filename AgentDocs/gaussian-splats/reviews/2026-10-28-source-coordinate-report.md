# Review：普通切片源坐标报告

## Metadata

- Type: code / documentation review
- Status: completed
- Owner / reviewer: 本任务（未启用独立评审 Agent）
- Date: 2026-10-28
- Target: [standalone plan](../plans/2026-10-28-source-coordinate-report.md)
- ADR: ADR-0188；沿用来源元数据与显式变换的边界
- SGP: 无
- Upstream-owned files: 无

## Findings and disposition

- G14 / medium / fixed：普通报告缺失 PLY 定位来源。新增 coordinate.sourceComments
  与 source.comments，复用已有 LOD 的有限数值/冲突校验，缺失字段不推断。
- G15 / medium / fixed：仅保存 Number 会丢失源十进制文本的额外位数及尾零。
  source.comments 保留注释数值字符；回归覆盖真实偏移的长小数、科学计数和大小写。

## Verification

- coordinateReport、prebuiltLod、segmentedTileSizeCli 共 20 项 Node tests 通过。
- 普通 CLI 输出与报告文件一致；缺失和部分坐标声明保持可选，非有限数值和重复冲突明确
  拒绝；普通构建在扫描/排序前报错并清理 staging。
- 同一几何增加 EPSG/offset 注释后，sourceBounds、显式 localOrigin/localToFixed 与
  全部 pack 字节不变。源文件 hash 随 header 改变，不要求 MCI 产品身份保持不变。
- 真实 PLY 仅仅读取 header：EPSG 4549、三分量 offsets 及原始长小数文本均正确提取。
  不运行两亿点的完整切片；本次不涉及分块算法、编码或运行时行为。
- 使用说明覆盖字段路径、Number 与文本精度、旧报告不会自动更新、球面定位和高程基准边界。
- 修改 JS 的 ESLint recommended 检查通过；新增 JS 另通过 curly/prefer-template。
  本次路径的 Prettier、Markdown lint 与 diff whitespace 检查通过。

## Remaining boundaries

源注释仍由生产者负责正确性，解析不证明 CRS/单位/高程基准或 offset 的加减约定。
不自动重投影或定位；已有报告不会自动补齐。G10 普通 raw spool 大坐标提前 Float32
量化的已知限制保持原状。无 upstream 修改、生成文件或 SDK 改动。

验证结束时，共享工作区其他任务曾误带入构建器及扩展索引；该任务修正为 `9ac687a4bc`
后，高斯改动已全部恢复到待提交状态。2026-10-28 负责人授权本地提交，本次检查点完整
包含构建器、解析器、磁盘分块、测试、使用说明和 AgentDocs；不再依赖未追踪模块。
提交位于当前工作分支，未执行集成分支合并或推送。
