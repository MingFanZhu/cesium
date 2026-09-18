# 球面空气透视模型条带技术自审

- Type: review
- Status: approved; project-owner visual acceptance pending
- Created / Updated: 2026-09-18
- Reviewer / implementation owner: 当前 Agent（技术自审，非独立评审）
- Review target: `scenegis/develop@69f76a94c6` 之后的本项工作区改动
- Plan: [球面空气透视模型条带修复](../plans/2026-09-18-globe-aerial-receiver-distance.md)
- ADR: [ADR-0043](../../../Documentation/SceneGIS/Decisions/ADR-0043-atmosphere-log-depth-and-radiance-mapping.md)
- Upstream-owned files / SGP delta: None

## 发现与处置

| Finding                                                     | Severity | Owner          | Evidence / disposition                                                                                                                                               |
| ----------------------------------------------------------- | -------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aerial endpoint 稳定化误把模型深度当作地形，产生光程跳变    | P1       | 当前实现 Agent | fixed；当前页面关闭空气透视后条带消失；真实 receiver 约 20.5 km 连续，替代球壳交点却在相机高度附近切换。新增真实 box GPU 回归旧实现最大 RGB 阶跃 59，修复后低于 12。 |
| 旧稳定化回归要求高空短深度和 terrain LOD 都被强制投影到地面 | P2       | 当前实现 Agent | resolved；按 ADR-0043 的真实 opaque endpoint 契约移除该断言，历史 A8-AR-006 保留并链接本项。current-frame depth guard 不变。                                         |

## 验证证据

- 5 项针对性 GPU 回归通过，名称和证据见 plan；覆盖连续色彩、linear/log 精确重建、far opaque/stale-depth/clear identity、物理雾以及预编译变体资源复用。
- `npm run build` 通过；当前浏览器实际加载新 shader，原视角右侧方块条带和红线消失，空气透视仍开启。
  无控制台 warning/error，效果 ready。
- 产品变化只有两个 SceneGIS shader。未增加渲染通道、资源或运行时状态；删除原 finite-pixel endpoint 变形运算。
  既有销毁/资源切换路径保持不变，GPU 资源复用回归通过；未声称实测性能提升。
- Spec 的 scoped ESLint / Prettier、全量 AgentDocs 与本项 ADR 的 markdownlint、`git diff --check` 通过。
  新 plan/review、更新的索引与 ADR 已格式化。
- 本次所有新增/修改 Markdown 的 scoped Prettier check 通过。按 AgentDocs 规则执行全目录 Prettier
  check：292 个未修改的历史文件仍存在格式问题，未扩展本项范围去重排其他文档。
- `audit-upstream-patches.mjs` 通过：14 条已登记 upstream entries，当前交付 upstream-owned entries 0，
  generated status 0。本项没有 upstream-owned file 或 SGP 变化。

## 剩余风险与交接

- 恢复真实光程后，真实远处 terrain LOD 深度变化可能表现为大气变化；不再以移动 receiver 来伪造 LOD-invariance。
  本次验证覆盖已复现模型问题及共用光学/深度路径，未扩展为全地形数据集质量验收。
- 技术自审无剩余 blocking finding。负责人尚未对修复后当前页面给出视觉验收；本项尚未提交。
  负责人反馈由同一 plan 继续记录。
- 负责人追加的平面对照检查复现了另一处空气透视水平色带；具体根因尚未确认，产品代码未变。
  该问题为 open follow-up，负责人角色、复现和下一步见 plan 的“平面对照排查”。本 review 的通过结论仅针对球面修复。
- Follow-up 更新：平面问题已由 [独立 Planar plan](../plans/2026-09-18-planar-aerial-horizon-band.md)
  完成离线积分修复与技术验证，负责人视觉验收待定；原排查证据保留。
