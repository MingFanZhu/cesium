# Extension Plan：Layer 动态绘制规则

- Type: extension plan
- Status: completed (technical); owner visual gate pending
- Created / updated: 2026-10-16
- Owner: 当前 Agent，Architecture / implementation self-review
- Baseline: `scenegis/develop@5d847ca8c6`
- Branch: 按负责人本对话要求继续使用当前 `scenegis/develop`，保留 WebGPU stash。
- Related: ADR-0058、ADR-0067、ADR-0076；SGP 增量预期为无
- Current phase: [D2 runtime](2026-10-16-d2-layer-style-runtime.md) technical completed；负责人视觉 gate pending；D1 checkpoint `7414056515`

## 目标与边界

响应 SDK 完成 JSON 接入后的引擎交接，在 `SceneGISVectorTileLayer` 增加 paint、layout、filter
的 set/get 方法及 `getStyle()`。ID 指 Style 内部层 ID；不增加场景 JSON 操作指令、不修改 SDK。
保留当前 profile 与表达式，保持 Layer、Source、MVT cache、show、opacity、state 及资源所有权。
无效参数同步报错且原状态不变；快照不泄漏共享 compiled Style 或调用方对象。
null 删除并恢复缺省语义，undefined 不是删除指令。getter 同步反映成功修改；绘制异步刷新。

## 路线

| Phase | 目标                                         | 退出条件                                                           | 状态                  |
| ----- | -------------------------------------------- | ------------------------------------------------------------------ | --------------------- |
| D1    | 不可变完整快照、原子候选校验与查询基础       | Core 契约测试、自审、独立本地提交                                  | completed             |
| D2    | Layer API、按依赖失效、Worker/标注代际与交付 | 双世界、缓存、隐藏/连续修改/迟到结果、构建类型及文档验证，独立提交 | completed (technical) |

D1 提交后再依据当前代码细化 D2，不以 D1 私有 helper 宣称 API 已交付。
不新增样式层/source/type/root 资源替换、动画 transition 或 paint-only GPU subrange 优化承诺。
未知图片/网络/Worker 错误继续显式报告，不为合法表达式的运行时数据错误添加猜测式 fallback。

## 验收与风险

- 两个 Layer 共享 Style 时修改互不影响；保留 name、metadata、sources、glyphs、sprite。
- 单次失败不发布候选；连续成功修改合并到最新规则，不允许旧 Worker 覆盖新规则。
- 同步 getter 不意味着 GPU 完成；隐藏时保留修改，恢复后使用最新规则。
- 修改只影响相关 style batches/symbol work，保留其他批次、原始 MVT 和临时 state。
- 所有生成文件由已有 build/type 链产生且不提交。公共 API 需要完整构建与类型检查。
- 自动化与自审不能代替负责人视觉 gate；性能报告说明实际重建粒度。

## 交接

SDK 仍固定旧引擎；最终交付明确 API、提交与升级条件。不得由此工作修改 SDK lock 或产物。
七个公开方法、完整文档与双世界示例已完成，验证和剩余事项见 [D2 review](../reviews/2026-10-16-d2-layer-style-runtime.md)。
本 extension 技术完成，仍等待新增动态规则的负责人视觉验收；当前 active extension 转为 [建筑材质](2026-10-27-building-materials-extension.md)；先前大气修复的“通过”不挪用为本项验收。
此前扩展及 P4e 的验收状态不变；本工作不扩展地下/背面排序、复杂 shaping 等历史延期能力。
