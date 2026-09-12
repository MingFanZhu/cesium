# Phase Plan: V0 架构审计与讨论

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Phase: `V0`
- Owner role: `architecture`
- Architecture review: `approved`
- Architecture reviewer: 当前 Agent；不作为独立评审
- Created: `2026-09-12`
- Updated: `2026-09-12`
- Related discussions: [源码审计](../discussions/2026-09-12-cesium-mvt-and-planar-audit.md)、
  [实现边界](../discussions/2026-09-12-rendering-boundaries.md)、
  [MapLibre 与贴地](../discussions/2026-09-12-maplibre-reference-and-surface.md)
- Related reviews: [V0 review](../reviews/2026-09-12-v0-architecture-review.md)
- ADR: [ADR-0057](../../../Documentation/SceneGIS/Decisions/ADR-0057-independent-vector-tiles-runtime.md)
- SGP: None

## Objective

基于当前 develop 建立独立扩展，明确已有能力、实际缺口和产品边界，把“类似 Mapbox”
拆成可讨论、可验收的契约，然后再进入实现。

## Non-goals

本轮不写产品代码，不安装依赖，不启动完整地图实现，不承诺视觉/性能资格，
不提前设计后续 Worker/Shader 私有字段。

## Entry conditions

- 已读 Architecture Agent 启动规则、Architecture、相关 DevelopmentGuide/ADR 和适用 AGENTS。
- 初始 working tree 干净，分支 base 为
  `scenegis/develop@e1244451613f4d0b8a5c6986f69ae56123d4267c`。
- 已读 upstream base/patch manifest；从 `AgentDocs/_template/` 建立稳定协作区。

## Current source facts

详见源码审计。图谱已有索引，MVT symbol/trace 可用；SceneGIS 和 build 搜索不足，
因此对已识别的文件做定向读取。同名宽泛图谱调用边以实际 import/函数体复核。

## Detailed design

围绕 MVT、样式、坐标、批量、贴地、标注逐项记录事实、选项、建议与非目标。
用户尚未确认的产品决定保持 open；不把建议写成已批准 ADR。

## Affected paths

- 本轮：`AgentDocs/vector-tiles/**`。
- 收尾新增 ADR-0057，并在 Architecture 提炼独立矢量瓦片边界。
- MVT/VectorProvider/Planar 源码、Specs、build/server/test 入口只读。
- upstream-owned files 零，SGP 无，不手工修改或提交生成文件。

## Steps

1. 恢复规范、Git 和平面契约，创建分支与目录。
2. 追踪 MVT provider → decode → glTF → content → ordinary/ground 出口。
3. 确认平面坐标、Primitive、Ground、anchor、构建与测试边界。
4. 用小型内存 PBF 验证 decoder 缺口，避免完整深层 tileset 分配。
5. 形成 extension plan 和六项讨论，向用户呈现选择。
6. 讨论结束后提升 ADR、review、回写 handoff，形成中文本地 checkpoint。
7. V0 checkpoint 后才重新审计并创建 V1 phase plan。

## Validation

- 检查 branch/base、相对链接、模板占位内容、ownership 和生成文件边界。
- native decode/build focused Specs 只证明基本链路，不代表完整 MVT conformance。
- 内存 PBF 复现 id/version 丢失及截断 MoveTo 错误接收。
- 按 `AgentDocs/AGENTS.md` 显式执行 Prettier/Markdownlint；结果记在审计文档。

## Risks and dependencies

用户明确没有必须兼容的服务/style.json；本地 fixtures、字体和兼容 profile 与标注目标待确定。
本轮不进行真实 GPU 地图对照、完整类型交付或性能压测。

## Completion criteria

六项边界已讨论确认，长期决定进入 ADR，无遗漏关键待决事项，
文档验证/review 通过并形成独立本地 checkpoint，才允许激活 V1。

## Deviations and results

- 用户授权同一 Agent 负责讨论与后续编码，本扩展不绑定或派工第二任务。
- 用户确认不依赖 Cesium 实验性 MVT；采用 CRS 无关解码、单 root tile matrix，首轮 3857。
- 已只读参考用户的 MapLibre 任意坐标系实现；用户优先矢量直接贴地，
  不采用地图颜色 RTT 主路线。现有 Planar stencil 是优先验证候选，
  其 single instance、简单颜色/线宽不能直接证明地图 batch/样式能力。
- `Test/**` 用于人工页面与场景数据；自动验证继续 Specs/E2E，符合既有管理。
- 用户批准按计划推进；V0 审计/讨论/review 完成，ADR-0057 已接受。未进行产品实现。
- 本地 checkpoint 由 V0 独立提交记录；提交前不得激活 V1。
- 验证结果见审计文档末尾。
