# 地表锚点旋转边界技术自审

- Type: review
- Status: approved（技术自审；负责人视觉复测待定）
- Created / Updated: 2026-10-20
- Owner / reviewer: 当前 Agent
- Review target: [维护计划](../plans/2026-10-20-anchored-orbit-boundary.md)、Controller 与对应 Specs、ADR-0024 amendment
- Upstream-owned files / SGP: None

## Findings 与处置

| ID        | Severity | Status | 事实与处置                                                                                                                                                                                                              |
| --------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORBIT-R01 | major    | fixed  | 高空有效锚点 orbit 后的 center clamp 额外平移相机；新增锚点有效标记，只对 miss fallback 保留 clamp。连续旋转及惯性 Specs、当前页真实拖动通过。                                                                          |
| ORBIT-R02 | major    | fixed  | 下一次 middle drag 在 pointer pick 前执行 `_syncRig` clamp，导致起始姿态跳变。Surface middle 同步先保存无界 target，miss 时再 clamp；高空 extent 外 / 大坐标 / Perspective / Orthographic 的起始与再次 press 回归通过。 |

## 边界审计

- 仅更改 SceneGIS-owned controller，没有改公共构造参数、pitch limit 或 anchor resolver 的来源优先级。
- Pan/wheel、initial sync、Home 默认仍执行 center clamp。新布尔状态在每个新 rotate 开始时赋值，
  inertia 只复用已有 pivot/window anchor/range；无新增逐帧 query、timer、listener、GPU 资源。
- Terrain clearance 的前后调用和纯 +Z 校正未改；碰撞纠正优先于保持轨道。Underground 路径未改。
- 全套 Controller 回归包含 pointer miss、平移边界、轮缩放、输入取消、terrain revision、clearance 和 underground crossing。

## 验证证据

- `npm run test -- --includeName "anchored surface orbit" --browsers ChromeHeadless --failTaskOnError --suppressPassed`：
  修复前 3 项失败，包含实际距离、屏幕锚点与新手势位置偏移。
- 同一命令筛选 `SceneGIS/Scene/SceneGISPlanarCameraController`：修复后 61/61 通过。
- `--production --includeName NavigationCesiumWidget`：5/5 通过，覆盖真实地形锚点、depth replay、non-log depth 和大坐标；
  `--production` 仅跳过已完成的 development bundle 构建。
- 原综合环境平面页 1001×826，原相机 Z 约 20015 km、Y 约 −43004 km：
  20 次连续中键移动压到 −5°，半径保持约 42166.856 km，center target 越界而 Camera 没有额外平移。
  再次 press 的零位移保持 Camera，短拖释放后 45 帧惯性保持新 pivot/range，最终停住。
  最大半径浮点偏差小于 8e-9 米，屏幕锚点偏差小于 1.3e-13 pixel。
- 技术画面检查完成；数值只证明已确认的相机漂移根因被消除，不替代负责人视觉验收。
- Scoped ESLint / code Prettier / `git diff --check` 通过。全量 AgentDocs Markdownlint 通过；
  显式全量 Prettier 仍报告 450 个既有文件格式问题，本项三个 AgentDocs 文件无告警；未顺带格式化无关文档。

## 剩余风险与交接

- 负责人视觉验收待复测；当前页保留修复版本及原相机/环境参数。
- 原有 `Missing glyph U+1472 in Noto Sans Italic` 与本项无关，保留原错误状态；未顺带修改文字或大气。
- 地形碰撞会按既有契约沿 +Z 修正位置，此时不承诺固定半径；当前仍是 endpoint clearance，不是 swept collision。
- 2026-10-20 按负责人后续要求独立提交，未推送；其他环境改动分项提交，无未解决的本项技术 finding。
