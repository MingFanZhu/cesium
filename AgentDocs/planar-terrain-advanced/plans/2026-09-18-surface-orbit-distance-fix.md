# 修复地表低俯角旋转距离发散

- Type: standalone plan
- Status: completed（技术自审与负责人确认通过）
- Created / Updated: 2026-09-18
- Owner: 当前 Agent（定位、实现与技术自审）
- Baseline: `scenegis/develop@a2b58e798d`
- Related: [扩展索引](../README.md)、[ADR-0024](../../../Documentation/SceneGIS/Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)、[ADR-0026](../../../Documentation/SceneGIS/Decisions/ADR-0026-planar-terrain-clearance-and-penetration-prevention.md)
- Review: [修复评审](../reviews/2026-09-18-surface-orbit-distance-fix.md)
- Upstream-owned files / SGP: None

## 复现与根因

负责人在 `Test/Planar/基础平面.html` 报告中键旋转接近水平后相机不断后退。
在 1061×852 viewport，从默认视角按住 (530,600)，每帧向上移动 3 pixels，
65 次移动后相机到 pivot 的距离从 12196 米增长到约 1.92e13 米。
Surface `_rotate` 每次从实际 Camera 重新计算距离；此前 `_applyTargetClamp`
为限制 center target 而平移 Camera，这个平移被下一次旋转作为新的距离反复放大。
Underground 已使用 press-time distance，不存在这条反馈路径。

## 实现边界

1. 同一 middle drag 使用已有 `_rotateDistance`，边界和 clearance 校正不回灌旋转半径。
2. 真实 wheel 输入仍能改变 surface held orbit 距离；仅在显式 wheel 后重新同步距离，
   保持原 pivot/window anchor，不改变 underground crossing 的 snapshot 规则。
3. 不改变 public API、pitch 限制、extent clamp、terrain clearance、锚点优先级和资源所有权。
4. 产品修改限于 SceneGIS-owned controller；Specs 进入既有 controller suite。
   无上游、Shader、Worker、生成器或生成文件改动。

## 验证

- 先以回归 Spec 复现低俯角 off-center held drag 在边界距离发散；
  修复后到达 pitch 限制继续拖动应稳定，反向拖动和 release 后新 gesture 可用。
- Perspective / Orthographic 各一个代表；另验证 surface held rotate 中 wheel 不被后续旋转撤销。
- 运行 controller suite 及已有 real-Context terrain/navigation suites，覆盖地下穿越与防穿透。
- 当前基础平面页重放同一路径，确认画面、距离收敛和无浏览器错误。
- Scoped ESLint/Prettier、AgentDocs Markdownlint、`git diff --check` 与上游审计。
  无公共 API 或构建变更，不重复完整发布、类型或渲染矩阵。

## 交接

当前为已完成 A1–A7 的维护修复，不激活新功能 phase。实现后回填实际验证与自审；
负责人视觉复测结果独立记录，不把自动化通过表述为负责人验收。

## 结果

- Controller 同一 held drag 复用旋转距离；只有开始新 drag 或 surface held drag 中的显式 wheel
  重新计算距离。Underground snapshot、target clamp 和 endpoint clearance 保持既有语义。
- 新增边界稳定/反向旋转回归与 wheel continuation 回归。修复前前者稳定失败，
  原 47 项与 wheel continuation 通过；修复后 Controller 49/49、terrain navigation 1/1、
  navigation/depth 4/4 通过，共 54 项。
- 当前页面同一 65-step 路径重放后，5° pitch 限制处 Camera 固定在
  约 `(0, -27716.1464, 3299.7352)`；最后连续移动位置不变，页面无 error/warn。
  现有边界平移会改变 Camera 到原 pivot 的实际距离，但不会再把它回灌成下一帧旋转半径。
- 测试命令的 `--includeName` 是 substring filter，不能写正则；三组最终分别运行。
  `--production` 在本仓库只跳过重复 build，使用本轮已生成的 development Specs bundle。
- 未修改上游、公共 API、Shader/Worker 或构建器。技术自审和校验结果见 review；
  当前页面已刷新恢复默认视角。负责人确认后进入惯性需求；本修复形成独立本地 checkpoint，未 push。
