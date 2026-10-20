# 地表锚点旋转与中心边界解耦

- Type: standalone plan
- Status: completed（技术验证完成，待负责人视觉复测）
- Created / Updated: 2026-10-20
- Owner: 当前 Agent（实现与技术自审）
- Architecture review: confirmed（依据负责人明确确认的交互契约）
- Parent: [扩展索引](../README.md)
- Related: [ADR-0024](../../../Documentation/SceneGIS/Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)、[ADR-0026](../../../Documentation/SceneGIS/Decisions/ADR-0026-planar-terrain-clearance-and-penetration-prevention.md)、[ADR-0079](../../../Documentation/SceneGIS/Decisions/ADR-0079-planar-camera-inertia.md)
- Upstream-owned files / SGP: None
- Review: [技术自审](../reviews/2026-10-20-anchored-orbit-boundary.md)

## 已确认问题

综合环境平面页，高空且相机 XY 位于 extent 外，围绕南大西洋地表锚点压低视角。
同一次 middle press 的半径保持 41546832.78 米，但旋转后 center target clamp
在 −5° 额外平移 Camera Y 约 −13560474.51 米，实际锚点距离增至 54957146.39 米。
此前固定 held radius 的修复已生效；本次问题是合法锚点 orbit 被 center clamp 破坏。
新手势的 `_syncRig` 也会在 pointer picking 前平移 Camera，单独删除旋转末尾 clamp 不足。

## 实现边界

1. 中键起始同步先保留当前 Camera 位置；有效 depth/terrain/bounded reference anchor
   使用原位置解析，完整手势及 inertia 保持 pivot、window anchor、distance。
2. Surface 有效锚点 orbit 不执行 center XY clamp；内部 center target 跟随真实无界落点。
   再次中键手势重新拾取，但不因 center 越界而先移动 Camera。
3. Pointer miss 的 center fallback 继续 clamp；pan、wheel、Home、initial synchronization
   保留原有边界契约。Surface frame-end +Z terrain clearance 始终优先，不承诺碰撞时仍固定半径。
4. 无新 public API、俯角阈值、逐帧 picking、timer、资源或上游改动。

## 验证

- Controller Specs：有效锚点越界连续旋转、pitch limit 稳定、反向旋转、再次 press；
  高空/extent 外初始姿态；Perspective 与 Orthographic 代表；miss fallback 保持 clamp。
- 惯性使用真实 elapsed-time mock：松手继续同一 orbit、收敛、新 press 接管；
  原 pan boundary、wheel、clearance、underground suite 回归。
- 已有真实 terrain navigation / depth integration suites，验证深度锚点与生命周期不退化。
- 综合环境当前高空姿态：真实鼠标连续旋转、短拖松手惯性、再次拖动，记录锚点屏幕位置与半径，检查画面。
- 定向 ESLint/Prettier、AgentDocs Markdownlint、diff check；仅开发构建，不重复发布/类型矩阵。

## 交接

当前为已完成扩展的独立维护；保留工作区已有环境变更，不混入本项。技术 review 与实际验证结果已回填。

## 实际结果

- 产品修改仅 controller：中键同步暂缓 clamp，pointer miss 才恢复 clamp；
  有效锚点 orbit 更新无界 center target，惯性复用同一状态。无逐帧额外 picking 或分配。
- 修复前三项 anchored orbit 回归全部失败；修复后 Controller 61/61、真实 terrain/depth integration 5/5 通过。
- 当前综合页在相机 XY 位于 extent 外、Z 约 20015 km 的姿态用真实鼠标连续压低到 −5°。
  60 帧 held orbit 固定约 42166.856 km 半径，center Y 达 31071 km（extent 上限约 20038 km）。
  最大半径数值误差小于 8e-9 米，pivot 重投影偏差小于 1.3e-13 pixel。
- 再次中键在原 pointer 的零位移事件，Camera 位移小于 4e-9 米；没有旧 center clamp 平移。
  随后短拖释放产生 45 帧惯性，仍固定新手势的 pivot/range，最终位置停止变化。
- 开发构建由测试命令重建。Scoped ESLint、代码 Prettier、diff check 通过；文档检查见 review。
- 当前页已刷新加载修复版并恢复测试前 camera/time/effect/vector 设置；临时 recorder 已移除。
  页面原有 Noto Sans Italic 字形缺失错误仍在，本项不修改矢量文字。
- 未修改上游、public API、Shader/Worker、构建器；2026-10-20 按负责人后续要求独立提交，未推送。负责人视觉复测另记。
