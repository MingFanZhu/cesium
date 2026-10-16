# D1 样式快照与候选校验评审

- Type: review
- Status: approved
- Created / updated: 2026-10-16
- Owner: 当前 Agent，Architecture / implementation self-review；非独立评审
- Target: [D1 plan](../plans/2026-10-16-d1-style-snapshots.md)
- Related: ADR-0163；upstream-owned files / SGP：无

## Findings 与结论

- P1 / fixed：原 Style 丢弃 name/metadata，不能导出完整初始化文档。现保存完整冻结快照，
  并验证输入、快照、规则返回数组与新旧 Style 之间互不污染。
- P1 / verified：候选先检查 layer/property，再 clone/validate/compile；不存在先写旧对象后 rollback。
  null 删除恢复默认，undefined/未知属性/非法类型与表达式失败保留旧快照。
- P2 / verified：沿用已有 profile，保留 legacy filter、state paint、zoom layout 表达式语义。
  相同输入返回原 Style，不触发后继刷新。

## 验证

Chrome Headless 155：精确筛选 `SceneGIS/Core/SceneGISVectorTileStyle`，17 项全部通过，
含 4 项新增候选/快照契约。源文件与 Specs ESLint、scoped Prettier 通过。
仅新增私有方法，不改变公共签名、Worker 协议或渲染行为；完整构建/type 交付属于 D2。
全部 AgentDocs Markdownlint 通过；全量 Prettier 仍有 452 个未修改历史文件的格式警告。

最初宽名称筛选额外执行了 9 项 `SceneGISVectorTileStyles` 渲染测试，其中 4 项颜色断言失败。
它们未记为通过，也未据此修改像素容差；D2 渲染验证需核对当前默认环境下的 fixture 初始化。
本阶段的原子候选没有调用者接入，未把这些失败归因为本次修改或声称已确认基线。

## 交接

D1 只交付不可变前端基础，尚无 Layer setter。Architecture 允许形成独立本地检查点并进入 D2。
SDK 仍不可升级调用 API；双世界、缓存与异步结果验证必须在 D2 完成。
