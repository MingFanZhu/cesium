# V3D3 动态状态自审

- Date: 2026-09-17
- Reviewer: 当前 Agent，architecture/execution 自审，非独立评审
- Decision: approved；技术 checkpoint，负责人视觉 gate 待四项汇总
- Predecessor: V3D2 `81340f7bef`
- Plan: [V3D3](../plans/2026-09-17-v3d3-state.md)
- ADR: [0076](../../../Documentation/SceneGIS/Decisions/ADR-0076-vector-style-state.md)
- Upstream-owned files / SGP: None；官方基线路径交集为空

## 实现与语义

状态由 Layer 独立拥有，compiled Style 不保留状态。五个 Layer API 和可选 evaluation context 已导出 JSDoc/type。
Feature/source-layer/source 身份、JSON 复制、merge/remove 和 global null 删除明确；paint-only 限制有校验。
Worker 返回包含零 alpha/过滤要素的 ID 索引；依 key、source-layer 和 ID 失效，旧批次保留至正常帧发布。
未命中 ID、无关状态 key 和同值更新不产生几何任务；真正受影响的批次仍在 Worker 重建，没有暗称逐 feature GPU 更新。
标注只重新求值 paint，shape、glyph 请求与 static/dynamic buffer identity 保留。

## 验证

- 8 项新增语义/双世界/标注状态测试：身份隔离、input/get 副本、空状态默认值、动态颜色、透明后恢复、
  原始 IDs、不命中 ID/key、无额外 MVT、旧 Worker 结果隔离与标注 glyph/shape/buffer 保留。
- 全组共 218 项 vector Specs，217 项首轮通过；旧“feature-state 不支持”的断言改为仍未支持的 sin 后，
  22 项 Style/Styles 专项通过。最终 State 7 项再次通过，没有扩大或放宽 timeout。
- 两世界增强页面点击道路选中、清除、warm sprite identity E2E 通过；预览代码加入全局水面透明度。
- engine/root build、完整 build-ts 与 tsc 通过。生成器保留既有上游 TSD-JSDoc 警告，没有新增状态 API 警告。
- release build、独立 installed engine 与 release ESM/IIFE：状态 API 类型存在，真实 Worker 绘制绿色状态结果，
  pattern、符号、真实地形、环境与释放检查均通过。
- scoped lint/format 及提交 hooks；没有提交生成文件。

## 边界

没有 root state defaults、状态布局/过滤、动态 style/source 替换或没有 MVT ID 的自动身份。
高频大范围业务更新仍会重建相关 Worker 批次；后续可增加 paint-only 数据流，但不在本轮承诺。
无阻塞 finding；按授权进入 V5D，不以自审代替负责人视觉验收。
