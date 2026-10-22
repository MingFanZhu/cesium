# 平面相机 Roll 导航评审

- Type: review; status: approved technically, owner visual confirmation pending.
- Updated: 2026-10-22; architecture / execution / review: current task, self-review.
- Plan: [roll 维护](../plans/2026-10-22-camera-roll-navigation.md).
- Baseline: `scenegis/develop@29bb119e3f`; upstream-owned files / SGP: none.

## 实现与 findings

| ID       | Severity      | Disposition                                                                                                                                                                            |
| -------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ROLL-R01 | major / fixed | `_syncRig` 将合法非零 roll 判 invalid，surface Home、underground 无法接管。移除这一个 admission 条件，保留其他导航检查。四 frustum 回归在修改前均失败，修改后通过。                    |
| ROLL-R02 | minor / fixed | 新 press/外部 pose 取消 inertia 时只清 type，running 留在 true。同步清除 running；真实鼠标新 press 和外部姿态测试验证接管后不移动且状态一致。                                          |
| ROLL-R03 | major / fixed | 直接删除 gate 会让 `_rotate` 第一帧以 zero-roll axes 跳变。保存 signed roll、按现有 angular input travel 逐步消除，并将完整 axes 传入原 window-anchor 方程；零位移与连续移动测试通过。 |

产品只修改 owned `SceneGISPlanarCameraController`。新增一个数值状态，不增加 timer、
animation、picking、listener、GPU resource 或 per-frame object allocation。Home 显式归零；
pan/wheel 使用原完整 Camera axes，不重建姿态。Rotation 每次最多消除与 normalized
mouse angular travel 等量的 roll，惯性复用同一规则；remaining roll 在 idle 保留。
Underground tangent-release 的既有 pitch 微调保留 roll。碰撞仍先后沿 +Z 纠正，
有效 surface pivot 的 center 越界、pan/wheel 边界、旧 pitch 约束保持。

## 验证

| Evidence                      | Result / purpose                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controller                    | 70/70；四 frustum initial/idle/pan/wheel、正负 roll、非 identity transform、零位移、连续扶正、再次 press、惯性、外部姿态取消、terrain clearance、underground tangent/crossing；既有大坐标 extent 外 orbit 增加 roll。 |
| Public Camera API             | 18/18；HPR、reference transform、四类 frustum、programmatic roll 与姿态语义保持。                                                                                                                                     |
| Camera flight                 | 9/9；生命周期、插值、complete/cancel 与 suspension 不变。                                                                                                                                                             |
| Real terrain/depth navigation | 5/5；真实 terrain anchor、depth picking/replay 与生命周期保持。                                                                                                                                                       |
| Browser                       | 2/2；Perspective / Orthographic、真实 pan/wheel/middle events、flight 后接管、release inertia 和 new press。每次有效旋转 pivot 重投影误差 <0.1 px；首个小移动仅部分扶正，后续收敛到 0；无 page errors。               |

开发构建通过。切分支后首次 test 遇到既有生成 barrel 不同步，正常 `gulp build`
重新生成后完成验证；没有手改或提交生成文件，也没有新增构建 workaround。
Controller 新增回归先在旧实现复现 initial roll → Home；轮缩放 fixture 使用 native
aggregator 的实际 pointer 字段，惯性遵守原 0.5 px 停止门槛，没有改变产品阈值。

独立浏览器使用 `Test/Planar/相机控制.html` 的本地影像，用户原页面未操作。
`Build/Specs/e2e/camera-roll/` 保存 rolled/upright 截图与逐帧 interaction.json；
两种投影画面均已检查，技术图像证据不能替代负责人对扶正速度/手感的验收。
日志位于 `Build/Specs/camera-roll-*.log`，均为忽略的本机产物。

## 剩余边界与交接

- 技术验证完成，负责人视觉确认待定。旧 orbit/terrain 的未决视觉 finding 不自动关闭。
- 短中键手势未完全消除的 roll 在停止后保留；下一次中键继续，不在 idle 自行动画。
- Nadir 的 heading/roll 不唯一，使用等价 axes；输入恢复仍有 surface pitch/side 约束。
- Clearance 是 endpoint 校正，发生碰撞时不承诺严格固定 orbit radius；未扩展 swept collision。
- 未改公共属性、Shader/Worker、发布器或上游文件。ADR-0004 修订了旧 roll admission 条款。
- Scoped ESLint / Prettier、全量 AgentDocs Markdownlint、diff check 与 upstream audit
  通过（current upstream-owned 0、generated status 0）。全量 AgentDocs Prettier
  仍报告 570 个本次改动之外的既有格式问题，没有扩散格式化。
- 2026-10-22 负责人要求在 `scenegis/develop` 形成本地提交检查点；未要求推送。
  视觉确认状态另记，提交请求不自动关闭旧 orbit/terrain 的未决视觉记录。
