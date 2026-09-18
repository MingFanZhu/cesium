# 平面空气透视水平色带技术自审

- Type: review
- Status: accepted; closed; project-owner visual acceptance passed
- Created / Updated: 2026-09-18
- Reviewer / implementation owner: 当前 Agent（技术自审，非独立评审）
- Review target: `scenegis/develop@69f76a94c6` 后本项独立 Planar 改动；不重复评审已有 Globe 修复
- Plan: [平面模型色带](../plans/2026-09-18-planar-aerial-horizon-band.md)
- Decision: [ADR-0042](../../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md)
- Upstream-owned files / SGP delta: None

## Findings

| Finding                                                        | Severity | Owner              | Evidence / disposition                                                                                                                                  |
| -------------------------------------------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 真正 boundary 的等距积分漏掉近处主要散射，近水平上下极限不一致 | P1       | 当前实现 Agent     | fixed；CPU 极限、实际 GPU 和真实 opaque face 均先失败后通过，两个默认/升高视角条带消失。                                                                |
| 共用颜色采样位置不能约束高空 ozone 差异消光的误差              | P2       | 当前实现 Agent     | fixed；按每颜色 absorbed transmittance 独立积分，五个独立 dense reference 路径误差低于 2%。                                                             |
| Planar lifecycle case 保留四个早期 CloudCore 字节数            | P2       | 当前实现 Agent     | fixed in fixture；依据未修改的 loader/renderer 和 `GLOBE_REFERENCE_PROVENANCE.json` 更新到现用 reference mip budgets，未修改云产品行为。                |
| 通用 package consumer 白名单遗漏既有 VectorTile 导出           | P2       | 后续打包维护 Agent | deferred；实际 tar 资产校验已通过，随后 ESM consumer 在五个 `SceneGISVectorTile*` 导出差异失败；不阻断本项大气资产修复，不宣称完整 package smoke 通过。 |

## 验证与性能

- Generator Node suite 11/11 通过，包含完整 byte-identical regeneration 和独立参考；构建、release 构建、类型生成、tsc 通过。
- 两个新 GPU cases 在旧资产分别表现为 7%–13% optical discontinuity 和 10-level RGB edge；修复后分别低于 2% 和 4-level。
  P5 far transport、双投影水平/高空路径与 Globe opaque receiver 回归通过。
- Planar warm/re-register lifecycle 复测通过，固定 LUT 字节数、warm 复用、exact destroy 和重新连接均通过；共 6 项 GPU cases 通过。
- Engine/root 实际 package asset hash/provenance 通过；完整 smoke 的已知 VectorTile 白名单失败单独保留。
- 无 runtime shader、API、pass、texture lookup、persistent resource 或 GPU byte 增量；固定 Planar LUT 仍为 8,527,872 bytes。
  增加的计算仅在离线 generator，完整生成约 40 s；不将生成耗时当作实时 GPU 性能测量。
- 原视角与升高相机画面复测通过；空气透视开启，无 browser warning/error。
- Scoped ESLint 通过；upstream audit 通过，当前交付 upstream-owned entries 0、generated status 0。
  本项 scoped Prettier、全量 AgentDocs/本项 ADR markdownlint 和 `git diff --check` 通过。
  全量 AgentDocs Prettier 仍有 292 个未修改历史文件的格式问题，不扩展本次修复范围。

## 结论与交接

色带根因已修复，未引入运行时掩盖或改变物理 preset。技术自审通过，2026-09-18 负责人视觉验收通过，代码尚未提交。
有限阶积分/half-float 的一般近似误差仍存在；完整打包 smoke 的独立白名单问题由后续打包维护处理，见 plan。
