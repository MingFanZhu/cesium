# 平面地形元数据接入技术自审

- Type: implementation / architecture self-review
- Status: approved technically；联合产物验收通过，项目负责人视觉验收待定
- Author / owner: 当前 Agent；未启用独立评审 Agent
- Created / Updated: 2026-09-18
- Target: `feature/planar-terrain-layer-metadata` 工作区中的本项变更
- Parent: [standalone plan](../plans/2026-09-18-terrain-layer-metadata.md)
- Related: [TileWorker 问题清单](2026-09-18-tileworker-compatibility.md)、
  [ADR-0080](../../../Documentation/SceneGIS/Decisions/ADR-0080-planar-terrain-layer-metadata.md)
- Upstream-owned files / SGP: None

## 实现核对

实现遵循双方确认的 [当前协议](../discussions/2026-09-18-terrain-layer-contract.md)，
固定 TMS available，仅接受两个当前 v2 profile，其他格式统一拒绝。
metadata provider 只持有静态元数据，组合 RGB24 image 与 quantized mesh URL providers。

公共导出和类型由现有 barrel / JSDoc 生成器生成，没有手改生成文件。
World 的 optional tilingScheme 是单一显式集成入口，兼容 coordinateSystem 构造，并保持
World/provider/imagery identity 契约。请求仍使用 Resource 与原调度器，缺失 tile 在请求前由 available 排除。
没有新增 retry、缓存、Worker 或 GPU 所有权；provider availability 优先于低层 terrain data 的 full-pyramid child mask。

两种真实样本均直接使用生产端发布的全局保守 heightRange；解析层拒绝无法确定有限范围的输入，
同时保留调用方显式覆盖范围的能力。根 tile extrema 不代表全数据集。
mesh 名义误差保留量化及裙边下限；本项不改变 Worker 的几何算法。

## 验证与结果

| 风险                 | 验证                                                                                                          | 结果                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 元数据解析与服务地址 | provider Specs：relative URL、version、Resource、调度 defer、TMS/slippyMap 对照、稀疏覆盖、拒绝输入、identity | 当前 11 项通过                       |
| 原有接入回归         | 两个 URL terrain providers 与 World Specs                                                                     | 18 + 25 项通过                       |
| 实际格式与空间结果   | 完整 private 双格式请求、Worker、独立采样、resident height、ray pick                                          | E2E 通过；双格式样点差不超过 0.21 米 |
| 非对称覆盖           | private 和原生 Cesium 3857/4326 北侧可用性、真实 TMS URL、解码/插值                                           | E2E 通过；无 HTTP 失败               |
| 可见画面             | 两种格式截图检查、canvas 非空、console / page errors                                                          | 通过                                 |
| 资源生命周期与热帧   | 12 warm frames 计数稳定，detach/reattach，VA 释放平衡，viewer destroy                                         | E2E 通过                             |
| API 交付             | 完整 build、buildTs、TypeScript 编译，根导出与浏览器 Build 入口                                               | 通过；保留既有 JSDoc warnings        |
| 源码质量             | 本项 ESLint、格式和文档检查、上游补丁审计                                                                     | 结果见 plan 交接记录                 |

5 份真实数据集共 16 片及 5 个 layer.json 原样复制并核对字节，源码/CLI 身份见样本 README。
World、低层 providers 和公共 API 签名在本次格式范围清理中均未改变，沿用对应通过证据。

## Finding 与处置

消费端没有未关闭的阻断 finding。生产端 TW-R001 / TW-R002 / TW-R003 由实际产物联合验收关闭，
见单独问题清单。双方各自维护仓库，消费结果已回传生产端步骤 43。

## 剩余范围与交接

仅支持两个静态私有 planar profile。公开 Globe profiles、动态 metadataAvailability、parent layers 与
CRS / vertical conversion 不在支持范围内。没有声称通过大数据集性能资格。
本项没有运行完整 package smoke；既有精确 export 白名单尚有其他 VectorTile 公共导出未登记的独立问题。
本次仅补充新 provider 的白名单条目，未改写无关导出或既有大气验证数据。

负责人可从 Test/Planar 示例目录进入“地形服务”验收。本项未提交或 push，已有大气修复保持独立。
