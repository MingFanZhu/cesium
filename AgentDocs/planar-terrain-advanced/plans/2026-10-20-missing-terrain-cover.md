# 缺失子级地形的连续覆盖修复

- Type: standalone plan
- Status: active（实现与技术自审完成，待负责人原场景复测）
- Created / Updated: 2026-10-20
- Owner / architecture review: 当前 Agent；confirmed
- Parent: 已完成的 planar-terrain-advanced 扩展维护
- Branch: scenegis/develop，模型压平与 S3M 已快进合并至 12171614c5
- Related decisions: ADR-0009、ADR-0027、ADR-0028
- Upstream-owned files / SGP: None
- Review: [技术自审](../reviews/2026-10-20-missing-terrain-cover.md)

## 源码事实与目标

用户反馈缺失层级地形时先显示 Z=0，随后逐步生成真实高度。
当前 `_SceneGISPlanarTerrain._queueFallback` 只检查自己与父级 direct state
是否 terminal，就允许没有 active content 的父级向子级传播 FLAT。
连续两级缺失时，真实祖先的上采样尚未完成，后代已经被判定 renderable；
四子覆盖门禁因而可能让已有真实地形被平面替换。
`_updateBounds` 同样把 terminal direct state 当作最终地形状态，
可能在 fallback 未完成时将 selection bounds 收紧至 Z=0。

球面 `GlobeSurfaceTile.upsample` 在父级 terrainData 不存在时等待，
`QuadtreePrimitive` 通过 renderable 门禁保持已有覆盖。采用这些语义，
不复制球面状态机或坐标实现。

## 实现范围

- 区分 direct 数据缺失与可绘制 fallback 就绪。
- 只有稳定的 terminal FLAT 父级才能向缺失子级传播 FLAT；
  等待上采样的中间父级不能代表平面。
- fallback 未就绪或正在刷新时保留 provider 的保守高度范围。
- 保持原 SSE、四子接替、每帧两个 Worker start / GPU promotion、
  depth replay、合法缺失根级 FLAT 行为和资源所有权。
- 不新增公共 API、Shader、Worker 或网络重试。

## 验证

1. 先建立失败回归：连续缺失两级、父级 fallback 等待时的 active source 与 bounds。
2. 真实 GPU Surface 从已就绪 root 放大到缺失子级，逐帧检查覆盖、深度、
   readiness，最终上采样收敛；覆盖两种地形格式的共享 runtime。
3. 运行受影响 Terrain / Surface / Quadtree 专项及开发构建，检查
   稳态资源计数、任务预算和销毁；不重复完整发布与类型矩阵。
4. 文档与 scoped lint 检查，自审记录结果及剩余边界。

## 交接

已修正 `_queueFallback` 的稳定 FLAT 传播条件和 `_updateBounds` 的收紧条件，
并在 ADR-0009 明确 direct terminal 与 fallback ready 的区别。
无公共 API、Shader、Worker 或上游文件变更，原每帧任务与上传预算不变。

新增四项回归：连续缺失两级时等待真实祖先、合法缺失 root 的 FLAT 传播、
heightmap 与 quantized 两种真实 GPU 连续覆盖。其中三项针对问题的失败模式在旧代码上复现，
修复后全部通过。状态机 17 项、Surface 47/48 项、Quadtree 18 项通过；
较宽 Terrain 过滤另有两项样式像素断言失败，Surface 有一项线性深度透明像素断言失败，
三项均在合并后的旧实现上复现，未扩大本项范围修改。
开发构建、资源销毁、任务预算和 scoped lint 通过；详细证据见 review。

2026-10-20 按负责人要求形成本地提交，未推送。负责人原始数据场景复测状态保持待定；
尚未获得具体复现页面，已验证场景为“连续缺失更精细子级”，
不将此结论扩展为缺失 root 时能够凭空恢复高程。
