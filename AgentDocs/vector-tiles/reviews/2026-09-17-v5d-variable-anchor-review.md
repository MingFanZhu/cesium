# V5D review：可变点标注锚点

- Type: review
- Status: approved（技术自审与 2026-09-18 四项负责人验收均通过）
- Date: 2026-09-17
- Target: V5D 工作树，相对 V3D3 checkpoint `d3a89475f3`
- Author / owner: 当前 Agent，architecture/execution 自审，非独立评审
- Plan: [V5D](../plans/2026-09-17-v5d-variable-anchors.md)
- ADR: [0077](../../../Documentation/SceneGIS/Decisions/ADR-0077-variable-symbol-anchors.md)
- Upstream-owned / SGP: 无

## Findings

| ID      | 等级 | 结论及证据                                                                                                                     | 状态     |
| ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| V5D-R01 | P1   | 原生 style validator 不拒绝沿线 variable anchor。增加 constant point 契约校验，错误配置专项通过。                              | fixed    |
| V5D-R02 | P1   | 候选试放不能污染碰撞网格或当前已发布 shape。试放只读碰撞，选择后提交；独立 shape container，双世界实际拾取与移动资源测试通过。 | fixed    |
| V5D-R03 | P2   | Worker 准备候选，主线程优先上次位置且无逐帧排字；warm motion Worker tasks/atlas identity 不变，222 项 vector Specs 通过。      | fixed    |
| V5D-R04 | P2   | 字形保守包络可能阻止三个重合 POI 都显示。示例采用足够 radial distance，双世界三个不同 anchor E2E 通过，截图已检查。            | accepted |
| V5D-R05 | P2   | 不支持沿线换位、anchor-offset collection、复杂 shaping、渐变过渡；候选首次成本最多九组，保留 soft budget。                     | accepted |

## 验证

- 222 项 vector Specs 全部通过，含 4 项新增语义/双世界实际 Worker、WebGL、pick、warm motion。
- 两个中文样式增强页 E2E 通过，验证三 POI 自动换位、pattern atlas 复用与状态交互。
- engine/root/release build、installed engine/ESM/IIFE 真实 Worker 候选验证通过；三入口均确认实际选择 center 且 top 候选存在。
- 所有修改与官方基线交集为空，无 upstream-owned files / SGP。负责人最终视觉 gate 随四项汇总。
