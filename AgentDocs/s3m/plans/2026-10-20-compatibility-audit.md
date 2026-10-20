# Standalone Plan: S3M compatibility audit

## Metadata

- Plan type: `standalone`
- Status: `completed`
- Parent plan / Phase: None
- Owner role: `architecture`
- Architecture review: `not-required`，当前仅评估，没有运行时设计落地
- Created / Updated: `2026-10-20`
- Related discussion: [集成边界](../discussions/2026-10-20-loading-boundaries.md)
- Related review: [证据复核](../reviews/2026-10-20-audit-review.md)
- ADR / SGP: None

## Objective and non-goals

根据官方源码、实际数据和当前 SceneGIS 渲染结果，区分可复用解析能力与必须
改造的加载、坐标、渲染边界。本次不实现加载器，不承诺商业 iClient API
兼容，不通过关闭渲染校验使样例强行运行。

## Steps and affected paths

1. 固定官方源码版本，核对 SDK 说明、许可证、配置与解析链路。
2. 在隔离浏览器中使用当前开发构建解析官方数据，尝试两组样例的实际绘制。
3. 检查用户旧数据和官方在线服务，分开记录 metadata、decode 与 render 证据。
4. 保存结论与下一步准入条件。

仅修改 `AgentDocs/s3m/**`。外部源码、二进制和一次性探针放在忽略的构建临时区，
不作为产品源码或长期 Specs 夹具提交。

## Validation and results

- 官方 JS 两组样例的 9 个 S3MB 全部成功解析，二进制版本均为 1.0。
- 两组样例实际绘制均触发当前延迟渲染校验；没有将 config ready 计为画面通过。
- 用户 CBD config 和根瓦片可访问；根瓦片与官方 CBD 根瓦片完全一致。
- 官方在线样例的元数据、二进制与覆盖不足见 discussion。
- 完成条件：评估结论与未解决风险可交接；不要求在评估阶段实现全部兼容。

## Deviations and remaining risks

用户希望优先采用官方样例，因此旧 CBD 仅用于兼容回归。渲染性能、完整 LOD 树、
材质、拾取、释放和新版格式尚不能由解析探针证明；实现阶段需另行建立自动化
Specs 和视觉验收，不复用本次“评估完成”作为产品验收。
